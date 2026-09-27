import { describe, expect, it } from "vitest"
import { assumedDriverValues, buildGoalScenarios, getGoalBreakdown } from "./goal-breakdowns"
import { isSiteCategory } from "./site-categories"

describe("goal breakdown definitions", () => {
  it("breaks conversions into traffic and conversion rate", () => {
    const breakdown = getGoalBreakdown("conversions")
    expect(breakdown?.formula).toContain("CTAページ到達率 × CTAページCVR")
    expect(breakdown?.drivers.map((driver) => driver.id)).toEqual(["organic-sessions", "cta-sessions", "cta-rate", "conversion-sessions", "cta-cvr"])
  })

  it("breaks organic sessions down to impressions, CTR and clicks", () => {
    const organic = getGoalBreakdown("conversions")?.drivers.find((driver) => driver.id === "organic-sessions")
    expect(organic?.children?.map((child) => child.id)).toEqual(["impressions", "ctr", "organic-clicks"])
  })

  it("uses the advertising revenue identity", () => {
    expect(getGoalBreakdown("adRevenue")?.formula).toContain("ページビュー数 ÷ 1,000 × ページRPM")
  })

  it("returns no speculative breakdown for unsupported metrics", () => {
    expect(getGoalBreakdown("averagePosition")).toBeNull()
  })

  it("calculates the standard conversion scenario", () => {
    const standard = buildGoalScenarios("conversions", 10).find((scenario) => scenario.id === "standard")
    expect(standard?.requirements).toEqual([
      { label: "CTAページ流入", value: 1000, unit: "セッション/月" },
      { label: "サイト全体流入", value: 33334, unit: "セッション/月" },
    ])
  })

  it("includes free contracts in the paid-contract scenario", () => {
    expect(getGoalBreakdown("paidContracts")?.drivers.map((driver) => driver.id)).toEqual([
      "organic-sessions",
      "cta-sessions",
      "cta-rate",
      "free-conversion-sessions",
      "free-cvr",
      "paid-conversion-sessions",
      "paid-rate",
    ])
    const standard = buildGoalScenarios("paidContracts", 10).find((scenario) => scenario.id === "standard")
    expect(standard?.requirements[0]).toEqual({ label: "無料契約", value: 100, unit: "件/月" })
    expect(standard?.requirements[2]).toEqual({ label: "サイト全体流入", value: 66667, unit: "セッション/月" })
    expect(standard?.assumptions.map((item) => item.label)).toContain("無料→有料転換率（推定）")
  })

  it("updates initial rate scenarios with measured numerator and denominator", () => {
    const initial = buildGoalScenarios("conversions", 10).find((scenario) => scenario.id === "standard")!
    const updated = buildGoalScenarios("conversions", 10, null, { "cta-rate": { successes: 500, trials: 10_000 } }).find((scenario) => scenario.id === "standard")!
    expect(updated.assumptions[0].value).not.toBe(initial.assumptions[0].value)
    expect(Number.parseFloat(updated.assumptions[0].value)).toBeGreaterThan(4.5)
  })

  it("uses the site's genre RPM for advertising revenue", () => {
    const standard = buildGoalScenarios("adRevenue", 100000, "entertainment").find((scenario) => scenario.id === "standard")
    expect(standard?.requirements[0]).toEqual({ label: "ページビュー数", value: 250000, unit: "PV/月" })
    expect(buildGoalScenarios("adRevenue", 100000, null)).toEqual([])
  })

  it("moves advertising RPM smoothly toward a measured value", () => {
    const standard = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {
      "page-rpm": { value: 800, weight: 0.5 },
    }).find((scenario) => scenario.id === "standard")
    expect(standard?.assumptions[0]).toEqual({ label: "ページRPM（実測補正 50%）", value: "600円" })
    expect(standard?.requirements[0]).toEqual({ label: "ページビュー数", value: 166667, unit: "PV/月" })
  })

  it("weights a manually entered page RPM by its measured pageviews", () => {
    const scenarios = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {
      "page-rpm": { value: 800, weight: 0.5 },
    }, 1.3, 443)
    expect(scenarios.map((scenario) => scenario.assumptions[0])).toEqual([
      { label: "ページRPM（手入力・実測補正 4%）", value: "192円" },
      { label: "ページRPM（手入力・実測補正 4%）", value: "383円" },
      { label: "ページRPM（手入力・実測補正 4%）", value: "670円" },
    ])
  })

  it("does not use manual ad revenue without measured pageviews", () => {
    const scenarios = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {}, 1.3)
    expect(scenarios.map((scenario) => scenario.assumptions[0])).toEqual([
      { label: "ページRPM", value: "200円" },
      { label: "ページRPM", value: "400円" },
      { label: "ページRPM", value: "700円" },
    ])
  })

  it("accepts zero ad revenue as a measured RPM observation", () => {
    const standard = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {}, 0, 10_000)
      .find((scenario) => scenario.id === "standard")
    expect(standard?.assumptions[0]).toEqual({ label: "ページRPM（手入力・実測補正 50%）", value: "200円" })
  })

  it("ignores invalid measured RPM values and weights", () => {
    const negative = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {
      "page-rpm": { value: -100, weight: 0.5 },
    }).find((scenario) => scenario.id === "standard")
    const excessiveWeight = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {
      "page-rpm": { value: 800, weight: 2 },
    }).find((scenario) => scenario.id === "standard")
    expect(negative?.requirements[0].value).toBe(250000)
    expect(excessiveWeight?.requirements[0].value).toBe(250000)
  })

  it("assumes the conversion rates Google cannot measure", () => {
    const assumed = assumedDriverValues("conversions")
    expect(Object.keys(assumed)).toEqual(["cta-rate", "cta-cvr"])
    expect(assumed["cta-rate"]).toEqual({ value: "3%", detail: "初期仮定値（慎重 2% 〜 好調 5%）", assumed: true })
    expect(assumed["cta-cvr"].value).toBe("1%")
  })

  it("assumes every rate the paid contract funnel needs", () => {
    const assumed = assumedDriverValues("paidContracts")
    expect(Object.keys(assumed)).toEqual(["cta-rate", "free-cvr", "paid-rate"])
    expect(assumed["free-cvr"].value).toBe("5%")
    expect(assumed["paid-rate"].value).toBe("10%")
  })

  it("marks an assumed rate as corrected once it is measured", () => {
    const assumed = assumedDriverValues("conversions", null, { "cta-rate": { successes: 500, trials: 10_000 } })
    expect(assumed["cta-rate"].detail).toContain("実測で補正した仮定値")
    expect(Number.parseFloat(assumed["cta-rate"].value)).toBeGreaterThan(4.5)
  })

  it("assumes the page RPM from the site genre", () => {
    const assumed = assumedDriverValues("adRevenue", "entertainment")
    expect(assumed["page-rpm"]).toEqual({ value: "400円/1,000PV", detail: "エンタメの初期仮定値（慎重 200円 〜 好調 700円）", assumed: true })
  })

  it("reports how much a manual page RPM moved the assumption", () => {
    const assumed = assumedDriverValues("adRevenue", "entertainment", {}, {}, 1.3, 443)
    expect(assumed["page-rpm"].value).toBe("383円/1,000PV")
    expect(assumed["page-rpm"].detail).toContain("手入力・実測補正 4%")
  })

  it("keeps the assumed value and the standard scenario in step", () => {
    const observations = { "cta-rate": { successes: 500, trials: 10_000 } }
    const standard = buildGoalScenarios("conversions", 10, null, observations).find((scenario) => scenario.id === "standard")
    expect(standard?.assumptions[0].value).toBe(assumedDriverValues("conversions", null, observations)["cta-rate"].value)

    const adStandard = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, { "page-rpm": { value: 800, weight: 0.5 } }).find((scenario) => scenario.id === "standard")
    const adAssumed = assumedDriverValues("adRevenue", "entertainment", {}, { "page-rpm": { value: 800, weight: 0.5 } })
    expect(adAssumed["page-rpm"].value).toBe(`${adStandard?.assumptions[0].value}/1,000PV`)
  })

  it("assumes nothing for a metric without a breakdown or without a genre", () => {
    expect(assumedDriverValues("averagePosition")).toEqual({})
    expect(assumedDriverValues("adRevenue", null)).toEqual({})
  })

  it("rejects inherited object properties as site categories", () => {
    expect(isSiteCategory("entertainment")).toBe(true)
    expect(isSiteCategory("constructor")).toBe(false)
    expect(isSiteCategory("toString")).toBe(false)
  })
})
