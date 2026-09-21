import { describe, expect, it } from "vitest"
import { summarizeAudit } from "./audit-summary"

describe("audit list summary", () => {
  it("shows an all-clear message when no issues were found", () => {
    expect(summarizeAudit({ status: "done", goodCount: 12, reviewCount: 0, improveCount: 0, unreachableCount: 0 })).toBe("全て良好")
  })

  it("lists actionable issue counts in priority order", () => {
    expect(summarizeAudit({ status: "done", goodCount: 10, reviewCount: 1, improveCount: 2, unreachableCount: 0 })).toBe("要改善2件・要確認1件")
  })

  it("does not mistake a missing summary for an all-clear result", () => {
    expect(summarizeAudit({ status: "done", goodCount: null, reviewCount: null, improveCount: null, unreachableCount: null })).toBe("集計結果なし")
  })
})
