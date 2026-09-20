import { describe, expect, it } from "vitest"
import { blocksNewCheckout, gracePeriodForStatus, hasPaidAccess, PAYMENT_GRACE_PERIOD_MS } from "./subscription-access"

describe("subscription access", () => {
  const now = new Date("2026-09-20T00:00:00.000Z")

  it.each(["trialing", "active", "canceling"])("allows %s subscriptions", (status) => {
    expect(hasPaidAccess(status, null, now)).toBe(true)
  })

  it("allows past_due only during its configured grace period", () => {
    expect(hasPaidAccess("past_due", new Date("2026-09-20T00:00:01.000Z"), now)).toBe(true)
    expect(hasPaidAccess("past_due", now, now)).toBe(false)
    expect(hasPaidAccess("past_due", null, now)).toBe(false)
  })

  it.each(["incomplete", "canceled", "unpaid"])("denies %s subscriptions", (status) => {
    expect(hasPaidAccess(status, null, now)).toBe(false)
  })
})

describe("payment grace period", () => {
  const now = new Date("2026-09-20T00:00:00.000Z")

  it("starts a seven-day grace period on the first past_due event", () => {
    expect(gracePeriodForStatus("past_due", null, now)).toEqual(
      new Date(now.getTime() + PAYMENT_GRACE_PERIOD_MS),
    )
  })

  it("does not extend the grace period on repeated webhook deliveries", () => {
    const existing = new Date("2026-09-24T00:00:00.000Z")
    expect(gracePeriodForStatus("past_due", existing, now)).toBe(existing)
  })

  it("clears the grace period after leaving past_due", () => {
    expect(gracePeriodForStatus("active", new Date("2026-09-24T00:00:00.000Z"), now)).toBeNull()
  })
})

describe("checkout guard", () => {
  it.each(["trialing", "active", "past_due", "incomplete", "canceling"])(
    "blocks a new Checkout for %s",
    (status) => expect(blocksNewCheckout(status)).toBe(true),
  )

  it.each([null, "canceled", "unpaid", "incomplete_expired"])(
    "allows a new Checkout for %s",
    (status) => expect(blocksNewCheckout(status)).toBe(false),
  )
})
