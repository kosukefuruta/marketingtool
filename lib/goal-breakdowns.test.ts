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

  it("uses the site's genre RPM for advertising revenue", () => {
    const standard = buildGoalScenarios("adRevenue", 100000, "entertainment").find((scenario) => scenario.id === "standard")
    expect(standard?.requirements[0]).toEqual({ label: "ページビュー数", value: 250000, unit: "PV/月" })
    expect(buildGoalScenarios("adRevenue", 100000, null)).toEqual([])
  })

  it("rejects inherited object properties as site categories", () => {
    expect(isSiteCategory("entertainment")).toBe(true)
    expect(isSiteCategory("constructor")).toBe(false)
    expect(isSiteCategory("toString")).toBe(false)
  })
})
