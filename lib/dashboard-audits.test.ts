import { describe, expect, it } from "vitest"
import { auditHistoryVisible } from "./audit-history-access"

describe("audit history access", () => {
  const now = new Date("2026-09-21T00:00:00Z")

  it("allows active contracts and the 30-day post-contract window", () => {
    expect(auditHistoryVisible("active", null, null, now)).toBe(true)
    expect(auditHistoryVisible("canceled", null, new Date("2026-09-01T00:00:00Z"), now)).toBe(true)
  })

  it("rejects access after the post-contract window", () => {
    expect(auditHistoryVisible("canceled", null, new Date("2026-08-01T00:00:00Z"), now)).toBe(false)
  })
})
