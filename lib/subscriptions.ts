import { eq } from "drizzle-orm"
import type Stripe from "stripe"
import { db } from "@/lib/db"
import { subscription, user } from "@/lib/db/schema"
import { gracePeriodForStatus } from "@/lib/subscription-access"

export { hasPaidAccess } from "@/lib/subscription-access"

function periodEnd(value: Stripe.Subscription): Date | null {
  const seconds = value.items.data.map((item) => item.current_period_end).filter(Boolean).sort((a, b) => b - a)[0]
  return seconds ? new Date(seconds * 1000) : null
}

export async function syncStripeSubscription(value: Stripe.Subscription, userId?: string): Promise<boolean> {
  const customerId = typeof value.customer === "string" ? value.customer : value.customer.id
  let ownerId = userId ?? value.metadata.userId
  if (!ownerId) {
    const [existing] = await db.select({ userId: subscription.userId }).from(subscription)
      .where(eq(subscription.stripeCustomerId, customerId)).limit(1)
    ownerId = existing?.userId
  }
  if (!ownerId) throw new Error(`No user mapping for Stripe customer ${customerId}`)

  const [owner] = await db.select({ stripeCustomerId: user.stripeCustomerId })
    .from(user).where(eq(user.id, ownerId)).limit(1)
  if (!owner?.stripeCustomerId || owner.stripeCustomerId !== customerId) {
    console.warn("[stripe-webhook] customer ownership check failed", {
      userId: ownerId,
      subscriptionId: value.id,
      customerId,
      reason: owner ? "mismatch" : "no_owner",
    })
    return false
  }

  const actualPriceId = value.items.data[0]?.price.id ?? null
  const configuredPriceId = process.env.STRIPE_PRICE_ID?.trim() || null
  if (configuredPriceId && actualPriceId !== configuredPriceId) {
    console.error("[stripe-webhook] unexpected price id; subscription ignored", {
      userId: ownerId,
      subscriptionId: value.id,
      actualPriceId,
    })
    return false
  }

  const now = new Date()
  const [existingSubscription] = await db.select({ gracePeriodEndsAt: subscription.gracePeriodEndsAt })
    .from(subscription).where(eq(subscription.userId, ownerId)).limit(1)
  const rawStatus = value.cancel_at_period_end && value.status !== "canceled" ? "canceling" : value.status
  const gracePeriodEndsAt = gracePeriodForStatus(value.status, existingSubscription?.gracePeriodEndsAt, now)
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
  return true
}
