import { describe, expect, it } from "vitest"
import { assumedDriverValues, buildGoalScenarios, driverGapLabel, getGoalBreakdown, isScenarioId, measuredDriverAmounts, requiredDriverValues } from "./goal-breakdowns"
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

  it("works back from a conversion target to every driver it needs", () => {
    const required = requiredDriverValues("conversions", 10)
    expect(required["conversion-sessions"].value).toBe(10)
    expect(required["cta-sessions"].value).toBe(1000)
    expect(required["organic-sessions"].value).toBe(33334)
  })

  it("needs more traffic in the conservative scenario and less in the optimistic one", () => {
    const conservative = requiredDriverValues("conversions", 10, null, {}, {}, null, null, {}, "conservative")
    const standard = requiredDriverValues("conversions", 10)
    const optimistic = requiredDriverValues("conversions", 10, null, {}, {}, null, null, {}, "optimistic")
    expect(conservative["organic-sessions"].value).toBe(100000)
    expect(standard["organic-sessions"].value).toBe(33334)
    expect(optimistic["organic-sessions"].value).toBe(10000)
  })

  it("asks to raise the rates only in the optimistic scenario", () => {
    // baselineは推定中央値。標準では同値になり、差分は出ない。
    const standard = requiredDriverValues("conversions", 10)
    expect(standard["cta-rate"].value).toBe(standard["cta-rate"].baseline)
    expect(driverGapLabel(standard["cta-rate"], undefined, "%")).toBe("前提どおり")

    const optimistic = requiredDriverValues("conversions", 10, null, {}, {}, null, null, {}, "optimistic")
    expect(optimistic["cta-rate"].value).toBeCloseTo(5)
    expect(optimistic["cta-rate"].baseline).toBeCloseTo(3)
    expect(driverGapLabel(optimistic["cta-rate"], undefined, "%")).toBe("あと2%")
  })

  it("keeps a measured rate from inventing a shortfall in the standard scenario", () => {
    const required = requiredDriverValues("conversions", 10, null, { "cta-rate": { successes: 10, trials: 1000 } })
    expect(driverGapLabel(required["cta-rate"], undefined, "%")).toBe("前提どおり")
  })

  it("scales the advertising RPM target with the scenario", () => {
    const optimistic = requiredDriverValues("adRevenue", 100000, "entertainment", {}, {}, null, null, {}, "optimistic")
    expect(optimistic["page-rpm"].value).toBe(700)
    expect(optimistic["page-rpm"].baseline).toBe(400)
    expect(optimistic.pageviews.value).toBe(142858)
  })

  it("accepts only the three scenario ids", () => {
    expect(isScenarioId("conservative")).toBe(true)
    expect(isScenarioId("standard")).toBe(true)
    expect(isScenarioId("optimistic")).toBe(true)
    expect(isScenarioId("aggressive")).toBe(false)
    expect(isScenarioId("constructor")).toBe(false)
  })

  it("never asks to move a rate in the standard scenario", () => {
    // 率は標準シナリオでは「その水準が続く前提」。差分を出すと、逆算に使った率と二重に手を打つことになる。
    const paid = requiredDriverValues("paidContracts", 10, null, { "free-cvr": { successes: 20, trials: 1000 } })
    for (const id of ["cta-rate", "free-cvr", "paid-rate"]) {
      expect(driverGapLabel(paid[id], undefined, "%")).toBe("前提どおり")
    }
    const ads = requiredDriverValues("adRevenue", 100000, "entertainment")
    expect(driverGapLabel(ads["page-rpm"], undefined, "円/1,000PV")).toBe("前提どおり")
  })

  it("does not contradict a measured rate that sits below the assumption", () => {
    // 実測0%でも、標準シナリオは率を動かすことを求めていない。「達成」と出すと現在値と矛盾する。
    const required = requiredDriverValues("conversions", 10, null, { "cta-cvr": { successes: 0, trials: 6 } })
    expect(driverGapLabel(required["cta-cvr"], 0, "%")).toBe("前提どおり")
  })

  it("matches the standard scenario even when measured rates move it", () => {
    const observations = { "cta-rate": { successes: 271, trials: 10_000 }, "cta-cvr": { successes: 123, trials: 10_000 } }
    const standard = buildGoalScenarios("conversions", 10, null, observations).find((scenario) => scenario.id === "standard")!
    const required = requiredDriverValues("conversions", 10, null, observations)
    expect(required["cta-sessions"].value).toBe(standard.requirements[0].value)
    expect(required["organic-sessions"].value).toBe(standard.requirements[1].value)
  })

  it("works back through the paid contract funnel", () => {
    const required = requiredDriverValues("paidContracts", 10)
    expect(required["paid-conversion-sessions"].value).toBe(10)
    expect(required["free-conversion-sessions"].value).toBe(100)
    expect(required["cta-sessions"].value).toBe(2000)
    expect(required["organic-sessions"].value).toBe(66667)
  })

  it("keeps the paid contract funnel in step with its scenario", () => {
    const observations = {
      "cta-rate": { successes: 271, trials: 10_000 },
      "free-cvr": { successes: 470, trials: 10_000 },
      "paid-rate": { successes: 97, trials: 1000 },
    }
    const standard = buildGoalScenarios("paidContracts", 10, null, observations).find((scenario) => scenario.id === "standard")!
    const required = requiredDriverValues("paidContracts", 10, null, observations)
    expect(required["free-conversion-sessions"].value).toBe(standard.requirements[0].value)
    expect(required["cta-sessions"].value).toBe(standard.requirements[1].value)
    expect(required["organic-sessions"].value).toBe(standard.requirements[2].value)
  })

  it("derives the impressions a target needs from the measured CTR", () => {
    const withoutCtr = requiredDriverValues("conversions", 10)
    expect(withoutCtr.impressions).toBeUndefined()
    expect(withoutCtr["organic-clicks"].value).toBe(33334)

    const withCtr = requiredDriverValues("conversions", 10, null, {}, {}, null, null, { ctr: 2 })
    expect(withCtr.impressions).toEqual({ value: 1666667, note: "現在のCTR 2%を維持した場合" })
  })

  it("works back from advertising revenue to pageviews and sessions", () => {
    const required = requiredDriverValues("adRevenue", 100000, "entertainment", {}, {}, null, null, { "pages-per-session": 2 })
    expect(required.pageviews.value).toBe(250000)
    expect(required.sessions).toEqual({ value: 125000, note: "現在のセッションあたり2PVを維持した場合" })

    const standard = buildGoalScenarios("adRevenue", 100000, "entertainment").find((scenario) => scenario.id === "standard")!
    expect(required.pageviews.value).toBe(standard.requirements[0].value)
  })

  it("requires nothing for a metric without a breakdown or without a genre", () => {
    expect(requiredDriverValues("averagePosition", 3)).toEqual({})
    expect(requiredDriverValues("adRevenue", 100000, null)).toEqual({})
  })

  it("states the gap between a measured driver and what the goal needs", () => {
    expect(driverGapLabel({ value: 1000 }, 250, "セッション/月")).toBe("あと750セッション")
    expect(driverGapLabel({ value: 1000 }, 1000, "セッション/月")).toBe("達成")
    expect(driverGapLabel({ value: 1000 }, 1200, "セッション/月")).toBe("達成")
    expect(driverGapLabel({ value: 400 }, 250, "円/1,000PV")).toBe("あと150円/1,000PV")
    expect(driverGapLabel({ value: 3 }, 1.2, "%")).toBe("あと1.8%")
  })

  it("treats a shortfall that rounds to zero as reached", () => {
    expect(driverGapLabel({ value: 2.7119717 }, 2.71, "%")).toBe("達成")
    expect(driverGapLabel({ value: 1000.004 }, 1000, "セッション/月")).toBe("達成")
    expect(driverGapLabel({ value: 1000.02 }, 1000, "セッション/月")).toBe("あと0.02セッション")
  })

  it("keeps assumptions out of the measured amounts", () => {
    expect(measuredDriverAmounts({
      "organic-sessions": { value: "1,200セッション", amount: 1200 },
      "cta-rate": { value: "3%", amount: 3, assumed: true },
      ctr: { value: "算出不可" },
    })).toEqual({ "organic-sessions": 1200 })
  })

  it("states no gap without a measured value", () => {
    expect(driverGapLabel({ value: 1000 }, undefined, "セッション/月")).toBeNull()
    expect(driverGapLabel({ value: 1000 }, Number.NaN, "セッション/月")).toBeNull()
  })

  it("rejects inherited object properties as site categories", () => {
    expect(isSiteCategory("entertainment")).toBe(true)
    expect(isSiteCategory("constructor")).toBe(false)
    expect(isSiteCategory("toString")).toBe(false)
  })
})
