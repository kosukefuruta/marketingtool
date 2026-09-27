import { describe, expect, it } from "vitest"
import { goalMetricChange, goalMetricChangeNotice } from "./goal-updates"

describe("goal metric change", () => {
  it("keeps every setting when the metric does not change", () => {
    const change = goalMetricChange("conversions", "conversions")
    expect(change.keptKeyEventStages).toEqual(["conversion"])
    expect(change.removesKeyEvents).toBe(false)
    expect(change.removesCtaPages).toBe(false)
    expect(change.removesPageRpm).toBe(false)
    expect(goalMetricChangeNotice("conversions", "conversions")).toBeNull()
  })

  it("drops key events and CTA pages when the new metric has no funnel stages", () => {
    const change = goalMetricChange("conversions", "pageviews")
    expect(change.keptKeyEventStages).toEqual([])
    expect(change.removesKeyEvents).toBe(true)
    expect(change.removesCtaPages).toBe(true)
  })

  it("drops stages the new metric does not use but keeps CTA pages", () => {
    const change = goalMetricChange("conversions", "paidContracts")
    expect(change.keptKeyEventStages).toEqual([])
    expect(change.removesKeyEvents).toBe(true)
    expect(change.removesCtaPages).toBe(false)
  })

  it("clears the observed page RPM only when leaving the ad revenue metric", () => {
    expect(goalMetricChange("adRevenue", "pageviews").removesPageRpm).toBe(true)
    expect(goalMetricChange("pageviews", "adRevenue").removesPageRpm).toBe(false)
  })

  it("names every setting the change removes", () => {
    expect(goalMetricChangeNotice("conversions", "revenue")).toContain("キーイベントの設定とCTAページの設定")
    expect(goalMetricChangeNotice("adRevenue", "revenue")).toContain("ページRPMの観測値")
    expect(goalMetricChangeNotice("revenue", "pageviews")).toBeNull()
  })
})
