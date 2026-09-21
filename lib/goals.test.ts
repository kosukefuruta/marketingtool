import { describe, expect, it } from "vitest"
import { formatGoalValue, goalNameFor, goalSubjectForMetric, validateGoalValues } from "./goals"

describe("goal value validation", () => {
  it("accepts a conversion target above the current value", () => {
    expect(validateGoalValues("conversions", 3, 10)).toBeNull()
  })

  it("rejects a growth target that does not improve the current value", () => {
    expect(validateGoalValues("pageviews", 1000, 900)).toContain("現在値より大きい")
  })

  it("treats a lower average position number as an improvement", () => {
    expect(validateGoalValues("averagePosition", 10, 5)).toBeNull()
    expect(validateGoalValues("averagePosition", 5, 10)).toContain("上位")
  })

  it("keeps CTR within a percentage range", () => {
    expect(validateGoalValues("ctr", 2, 101)).toContain("0〜100%")
  })

  it("formats a metric with its meaningful unit", () => {
    expect(formatGoalValue("revenue", 120000)).toBe("120,000円")
  })

  it("requires a keyword only for a ranking goal", () => {
    expect(goalSubjectForMetric("averagePosition")).toBe("keyword")
    expect(goalSubjectForMetric("revenue")).toBe("site")
  })

  it("generates a meaningful goal name from its inputs", () => {
    expect(goalNameFor("revenue", 120000, null)).toBe("売上高を120,000円にする")
    expect(goalNameFor("averagePosition", 1, "SEOツール")).toBe("「SEOツール」で1位を目指す")
  })

})
