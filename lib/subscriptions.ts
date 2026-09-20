import { eq } from "drizzle-orm"
import type Stripe from "stripe"
import { db } from "@/lib/db"
import { subscription } from "@/lib/db/schema"

export const ACCESSIBLE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due", "canceling"])

export function hasPaidAccess(status: string | null | undefined, gracePeriodEndsAt?: Date | null): boolean {
  if (!status) return false
  if (status === "past_due") return !gracePeriodEndsAt || gracePeriodEndsAt > new Date()
  return ACCESSIBLE_SUBSCRIPTION_STATUSES.has(status)
}

function periodEnd(value: Stripe.Subscription): Date | null {
  const seconds = value.items.data.map((item) => item.current_period_end).filter(Boolean).sort((a, b) => b - a)[0]
  return seconds ? new Date(seconds * 1000) : null
}

export async function syncStripeSubscription(value: Stripe.Subscription, userId?: string): Promise<void> {
  const customerId = typeof value.customer === "string" ? value.customer : value.customer.id
  let ownerId = userId ?? value.metadata.userId
  if (!ownerId) {
    const [existing] = await db.select({ userId: subscription.userId }).from(subscription)
      .where(eq(subscription.stripeCustomerId, customerId)).limit(1)
    ownerId = existing?.userId
  }
  if (!ownerId) throw new Error(`No user mapping for Stripe customer ${customerId}`)

  const now = new Date()
  const rawStatus = value.cancel_at_period_end && value.status !== "canceled" ? "canceling" : value.status
  const gracePeriodEndsAt = value.status === "past_due" ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null
  await db.insert(subscription).values({
    id: crypto.randomUUID(),
    userId: ownerId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: value.id,
    stripePriceId: value.items.data[0]?.price.id ?? null,
    status: rawStatus,
    currentPeriodEnd: periodEnd(value),
    cancelAtPeriodEnd: value.cancel_at_period_end,
    gracePeriodEndsAt,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: subscription.userId,
    set: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: value.id,
      stripePriceId: value.items.data[0]?.price.id ?? null,
      status: rawStatus,
      currentPeriodEnd: periodEnd(value),
      cancelAtPeriodEnd: value.cancel_at_period_end,
      gracePeriodEndsAt,
      updatedAt: now,
    },
  })
}
