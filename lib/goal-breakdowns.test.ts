import { describe, expect, it } from "vitest"
import { buildGoalScenarios, getGoalBreakdown } from "./goal-breakdowns"
import { isSiteCategory } from "./site-categories"

describe("goal breakdown definitions", () => {
  it("breaks conversions into traffic and conversion rate", () => {
    const breakdown = getGoalBreakdown("conversions")
    expect(breakdown?.formula).toContain("CTAページ到達率 × CTAページCVR")
    expect(breakdown?.drivers.map((driver) => driver.id)).toEqual(["organic-sessions", "cta-rate", "cta-cvr"])
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
    const standard = buildGoalScenarios("paidContracts", 10).find((scenario) => scenario.id === "standard")
    expect(standard?.requirements[0]).toEqual({ label: "無料契約", value: 100, unit: "件/月" })
    expect(standard?.requirements[2]).toEqual({ label: "サイト全体流入", value: 66667, unit: "セッション/月" })
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

  it("uses a manually entered page RPM in preference to measured and category values", () => {
    const scenarios = buildGoalScenarios("adRevenue", 100000, "entertainment", {}, {
      "page-rpm": { value: 800, weight: 0.5 },
    }, 500)
    expect(scenarios.map((scenario) => scenario.assumptions[0])).toEqual([
      { label: "ページRPM（手入力）", value: "500円" },
      { label: "ページRPM（手入力）", value: "500円" },
      { label: "ページRPM（手入力）", value: "500円" },
    ])
    expect(scenarios.map((scenario) => scenario.requirements[0].value)).toEqual([200000, 200000, 200000])
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

  it("rejects inherited object properties as site categories", () => {
    expect(isSiteCategory("entertainment")).toBe(true)
    expect(isSiteCategory("constructor")).toBe(false)
    expect(isSiteCategory("toString")).toBe(false)
  })
})
