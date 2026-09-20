export const ACCESSIBLE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due", "canceling"])
export const CHECKOUT_BLOCKING_STATUSES = new Set(["trialing", "active", "past_due", "incomplete", "canceling"])
export const PAYMENT_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

export function blocksNewCheckout(status: string | null | undefined): boolean {
  return Boolean(status && CHECKOUT_BLOCKING_STATUSES.has(status))
}

export function hasPaidAccess(
  status: string | null | undefined,
  gracePeriodEndsAt?: Date | null,
  now = new Date(),
): boolean {
  if (!status) return false
  if (status === "past_due") return Boolean(gracePeriodEndsAt && gracePeriodEndsAt > now)
  return ACCESSIBLE_SUBSCRIPTION_STATUSES.has(status)
}

export function storedSubscriptionStatus(status: string, cancelAtPeriodEnd: boolean): string {
  if (!cancelAtPeriodEnd) return status
  return status === "active" || status === "trialing" ? "canceling" : status
}

export function gracePeriodForStatus(
  status: string,
  existingGracePeriodEndsAt: Date | null | undefined,
  now = new Date(),
): Date | null {
  if (status !== "past_due") return null
  return existingGracePeriodEndsAt ?? new Date(now.getTime() + PAYMENT_GRACE_PERIOD_MS)
}
