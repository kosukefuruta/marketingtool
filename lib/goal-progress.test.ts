import { describe, expect, it } from "vitest"
import { goalPeriodComparison, goalProgress, progressBarPercent } from "./goal-progress"

describe("goal progress", () => {
  it("reports what is still missing for a growth goal", () => {
    const progress = goalProgress("conversions", 4, 10)!
    expect(progress.gap).toBe(6)
    expect(progress.achieved).toBe(false)
    expect(progress.gapLabel).toBe("あと6件")
    expect(progress.rateLabel).toBe("達成率 40%")
  })

  it("keeps the excess visible once a growth goal is reached", () => {
    const progress = goalProgress("conversions", 13, 10)!
    expect(progress.gap).toBe(0)
    expect(progress.achieved).toBe(true)
    expect(progress.gapLabel).toBe("目標達成（+3件）")
    expect(progress.rateLabel).toBe("達成率 130%")
  })

  it("treats a lower average position as progress", () => {
    const behind = goalProgress("averagePosition", 12, 3)!
    expect(behind.achieved).toBe(false)
    expect(behind.gap).toBe(9)
    expect(behind.gapLabel).toBe("あと9位上位へ")
    expect(behind.rateLabel).toBe("達成率 25%")

    const ahead = goalProgress("averagePosition", 2, 3)!
    expect(ahead.achieved).toBe(true)
    expect(ahead.gapLabel).toBe("目標達成（1位上回る）")
  })

  it("formats the gap with the unit of its metric", () => {
    expect(goalProgress("revenue", 120000, 300000)!.gapLabel).toBe("あと180,000円")
    expect(goalProgress("ctr", 1.5, 3)!.gapLabel).toBe("あと1.5%")
    expect(goalProgress("adRevenue", 0, 50000)!.gapLabel).toBe("あと50,000円")
  })

  it("says nothing without a current value", () => {
    expect(goalProgress("conversions", null, 10)).toBeNull()
    expect(goalProgress("conversions", undefined, 10)).toBeNull()
    expect(goalProgress("conversions", Number.NaN, 10)).toBeNull()
  })

  it("survives a zero target and a zero current value", () => {
    const zeroTarget = goalProgress("conversions", 0, 0)!
    expect(zeroTarget.achieved).toBe(true)
    expect(zeroTarget.gapLabel).toBe("目標達成")
    expect(zeroTarget.rate).toBe(1)

    const zeroPosition = goalProgress("averagePosition", 0, 3)!
    expect(zeroPosition.achieved).toBe(true)
    expect(zeroPosition.rate).toBe(1)
  })

  it("compares only the periods a 28-day actual can answer for", () => {
    expect(goalPeriodComparison("point")).toEqual({ comparable: true, note: null })
    expect(goalPeriodComparison("monthly")).toEqual({ comparable: true, note: "直近28日の実績を月間目標と比較しています。" })
  })

  it("refuses to compare a 28-day actual with a daily or weekly target", () => {
    expect(goalPeriodComparison("daily")).toEqual({ comparable: false, reason: "1日あたりの目標は、直近28日の実績と比較できません。" })
    expect(goalPeriodComparison("weekly").comparable).toBe(false)
  })

  it("refuses to compare an unknown stored period", () => {
    expect(goalPeriodComparison("quarterly")).toEqual({ comparable: false, reason: "目標の集計期間が不明なため、実績と比較できません。" })
    expect(goalPeriodComparison("")).toEqual({ comparable: false, reason: "目標の集計期間が不明なため、実績と比較できません。" })
  })

  it("clamps the progress bar to the 0-100 range", () => {
    expect(progressBarPercent(goalProgress("conversions", 4, 10)!)).toBe(40)
    expect(progressBarPercent(goalProgress("conversions", 13, 10)!)).toBe(100)
    expect(progressBarPercent(goalProgress("averagePosition", 12, 3)!)).toBe(25)
  })
})
