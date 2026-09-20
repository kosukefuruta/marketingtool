import type Stripe from "stripe"
import { and, eq, lt, or } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { site, stripeWebhookEvent, subscription } from "@/lib/db/schema"
import { getStripe } from "@/lib/stripe"
import { hasPaidAccess, syncStripeSubscription } from "@/lib/subscriptions"

export const runtime = "nodejs"

async function subscriptionFromEvent(event: Stripe.Event): Promise<{ value: Stripe.Subscription; userId?: string } | null> {
  if (event.type === "checkout.session.completed") {
    const checkout = event.data.object as Stripe.Checkout.Session
    const id = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id
    if (!id) return null
    return { value: await getStripe().subscriptions.retrieve(id), userId: checkout.client_reference_id ?? checkout.metadata?.userId }
  }
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const incoming = event.data.object as Stripe.Subscription
    return { value: await getStripe().subscriptions.retrieve(incoming.id), userId: incoming.metadata.userId }
  }
  return null
}

// A claim older than this belongs to a request whose process died before it could finish.
const ABANDONED_PROCESSING_MS = 5 * 60 * 1000

async function markFailed(eventId: string, status: "failed" | "ignored", reason: string): Promise<void> {
  await db.update(stripeWebhookEvent).set({ status, lastError: reason.slice(0, 300) })
    .where(eq(stripeWebhookEvent.stripeEventId, eventId))
}

async function rejectEvent(event: Stripe.Event, reason: "ownership_mismatch" | "unexpected_price"): Promise<NextResponse> {
  if (reason === "unexpected_price") {
    await markFailed(event.id, "ignored", reason)
    return NextResponse.json({ received: true, ignored: true })
  }
  await markFailed(event.id, "failed", reason)
  return NextResponse.json({ error: reason }, { status: 500 })
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get("stripe-signature")
  if (!secret || !signature) return NextResponse.json({ error: "Webhook is not configured" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const now = new Date()
  const claimed = await db.insert(stripeWebhookEvent).values({
    stripeEventId: event.id,
    eventType: event.type,
    status: "processing",
    receivedAt: now,
  }).onConflictDoUpdate({
    target: stripeWebhookEvent.stripeEventId,
    set: { status: "processing", receivedAt: now, processedAt: null, lastError: null },
    setWhere: or(
      eq(stripeWebhookEvent.status, "failed"),
      and(
        eq(stripeWebhookEvent.status, "processing"),
        lt(stripeWebhookEvent.receivedAt, new Date(now.getTime() - ABANDONED_PROCESSING_MS)),
      ),
    ),
  }).returning({ id: stripeWebhookEvent.stripeEventId })
  if (claimed.length === 0) return NextResponse.json({ received: true, deduped: true })

  try {
    const resolved = await subscriptionFromEvent(event)
    if (resolved) {
      const result = await syncStripeSubscription(resolved.value, resolved.userId)
      if (!result.applied) return await rejectEvent(event, result.reason)
      const [row] = await db.select({ userId: subscription.userId, status: subscription.status, grace: subscription.gracePeriodEndsAt })
        .from(subscription).where(eq(subscription.stripeSubscriptionId, resolved.value.id)).limit(1)
      if (row) {
        await db.update(site).set({
          status: hasPaidAccess(row.status, row.grace) ? "active" : "pending",
          updatedAt: new Date(),
        }).where(eq(site.userId, row.userId))
      }
    }
    await db.update(stripeWebhookEvent).set({ status: "processed", processedAt: new Date(), lastError: null })
      .where(eq(stripeWebhookEvent.stripeEventId, event.id))
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[stripe-webhook] processing failed", { eventId: event.id, type: event.type, message })
    await markFailed(event.id, "failed", message)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
