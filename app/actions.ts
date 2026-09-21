"use server"

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { auditJob, goal, site, subscription, user } from "@/lib/db/schema"
import { goalMetrics, goalNameFor, goalSubjectForMetric, isGoalMetric, validateGoalValues } from "@/lib/goals"
import { requireSession } from "@/lib/session"
import { defaultSiteName, normalizePublicSiteUrl } from "@/lib/sites"
import { isSiteCategory } from "@/lib/site-categories"
import { getStripe } from "@/lib/stripe"
import { blocksNewCheckout } from "@/lib/subscription-access"

export type SiteFormState = { error?: string }

const SITE_LIMIT = 3

export async function saveSite(_state: SiteFormState, formData: FormData): Promise<SiteFormState> {
  const current = await requireSession()
  const siteId = String(formData.get("siteId") ?? "").trim()
  const rawUrl = String(formData.get("url") ?? "")
  const rawName = String(formData.get("name") ?? "").trim()
  const now = new Date()
  try {
    if (siteId) {
      if (!rawName) return { error: "サイト名を入力してください。" }
      const category = String(formData.get("category") ?? "")
      if (category && !isSiteCategory(category)) return { error: "正しいサイトジャンルを選択してください。" }
      const updated = await db.update(site).set({
        name: rawName,
        category: category || null,
        updatedAt: now,
      }).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).returning({ id: site.id })
      if (!updated.length) return { error: "更新するサイトが見つかりません。" }
    } else {
      let normalized: Awaited<ReturnType<typeof normalizePublicSiteUrl>>
      try {
        normalized = await normalizePublicSiteUrl(rawUrl)
      } catch (error) {
        return { error: error instanceof Error ? error.message : "正しいサイトURLを入力してください。" }
      }
      const inserted = await db.transaction(async (tx) => {
        // Serialize additions for one user so concurrent submissions cannot exceed the limit.
        await tx.execute(sql`select ${user.id} from ${user} where ${user.id} = ${current.user.id} for update`)
        const [usage] = await tx.select({ value: count() }).from(site).where(eq(site.userId, current.user.id))
        if ((usage?.value ?? 0) >= SITE_LIMIT) return false
        await tx.insert(site).values({
          id: crypto.randomUUID(),
          userId: current.user.id,
          name: rawName || defaultSiteName(normalized.origin),
          inputUrl: normalized.inputUrl,
          normalizedOrigin: normalized.origin,
          createdAt: now,
          updatedAt: now,
        })
        return true
      })
      if (!inserted) return { error: `登録できるサイトは${SITE_LIMIT}件までです。` }
    }
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return { error: "このサイトはすでに登録されています。" }
    }
    throw error
  }
  redirect(siteId ? `/dashboard/sites/${siteId}/settings` : "/dashboard")
}

export type GoalFormState = { error?: string }

export async function createGoal(_state: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const current = await requireSession()
  const siteId = String(formData.get("siteId") ?? "").trim()
  const subjectValue = String(formData.get("subjectValue") ?? "").trim()
  const metric = String(formData.get("metric") ?? "")
  const targetRaw = String(formData.get("targetValue") ?? "").trim()

  if (!siteId || !isGoalMetric(metric) || !targetRaw) {
    return { error: "指標と目標値を入力してください。" }
  }
  const subjectType = goalSubjectForMetric(metric)
  if (subjectType === "keyword" && !subjectValue) return { error: "キーワードを入力してください。" }
  if (subjectValue.length > 200) return { error: "キーワードは200文字以内で入力してください。" }
  const targetValue = Number(targetRaw)
  const valueError = validateGoalValues(metric, null, targetValue)
  if (valueError) return { error: valueError }

  const [ownedSite] = await db.select({ id: site.id }).from(site)
    .where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1)
  if (!ownedSite) return { error: "登録サイトが見つかりません。" }

  const normalizedSubjectValue = subjectType === "keyword" ? subjectValue : null

  const now = new Date()
  await db.insert(goal).values({
    id: crypto.randomUUID(),
    userId: current.user.id,
    siteId,
    name: goalNameFor(metric, targetValue, normalizedSubjectValue),
    subjectType,
    subjectValue: normalizedSubjectValue,
    metric,
    baselineValue: null,
    targetValue,
    period: goalMetrics[metric].defaultPeriod,
    createdAt: now,
    updatedAt: now,
  })
  redirect(`/dashboard/sites/${siteId}/goals`)
}

export async function deleteGoal(formData: FormData): Promise<void> {
  const current = await requireSession()
  const goalId = String(formData.get("goalId") ?? "")
  const requestedSiteId = String(formData.get("siteId") ?? "")
  const [deleted] = goalId ? await db.delete(goal).where(and(eq(goal.id, goalId), eq(goal.userId, current.user.id))).returning({ siteId: goal.siteId }) : []
  const siteId = deleted?.siteId ?? requestedSiteId
  redirect(siteId ? `/dashboard/sites/${siteId}/goals` : "/dashboard")
}

export async function deleteSite(formData: FormData): Promise<void> {
  const current = await requireSession()
  const siteId = String(formData.get("siteId") ?? "").trim()
  if (!siteId) redirect("/dashboard")

  const [activeJob] = await db.select({ id: auditJob.id }).from(auditJob).where(and(
    eq(auditJob.siteId, siteId),
    eq(auditJob.userId, current.user.id),
    inArray(auditJob.status, ["queued", "running"]),
  )).limit(1)
  if (activeJob) redirect(`/dashboard/sites/${siteId}/settings?error=audit-running`)

  await db.delete(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id)))
  redirect("/dashboard")
}

async function findOrCreateStripeCustomer(userId: string): Promise<string> {
  const [account] = await db.select({ email: user.email, name: user.name, stripeCustomerId: user.stripeCustomerId })
    .from(user).where(eq(user.id, userId)).limit(1)
  if (!account) throw new Error("ユーザーが見つかりません。")
  if (account.stripeCustomerId) return account.stripeCustomerId

  const stripe = getStripe()
  const escaped = userId.replaceAll("'", "\\'")
  const found = await stripe.customers.search({ query: `metadata['userId']:'${escaped}'`, limit: 1 })
  const customer = found.data[0] ?? await stripe.customers.create({
    email: account.email,
    name: account.name,
    metadata: { userId },
  })
  const claimed = await db.update(user).set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(and(eq(user.id, userId), isNull(user.stripeCustomerId)))
    .returning({ stripeCustomerId: user.stripeCustomerId })
  if (claimed.length > 0) return customer.id

  // A concurrent checkout stored a different customer first; that one is the customer Stripe will bill.
  const [winner] = await db.select({ stripeCustomerId: user.stripeCustomerId })
    .from(user).where(eq(user.id, userId)).limit(1)
  return winner?.stripeCustomerId ?? customer.id
}

export async function startCheckout(): Promise<void> {
  const current = await requireSession()
  const [registeredSite] = await db.select({ id: site.id }).from(site).where(eq(site.userId, current.user.id)).limit(1)
  if (!registeredSite) redirect("/onboarding/site")

  const [currentSubscription] = await db.select().from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  if (blocksNewCheckout(currentSubscription?.status)) redirect("/dashboard")

  const priceId = process.env.STRIPE_PRICE_ID
  const baseUrl = process.env.APP_BASE_URL ?? process.env.BETTER_AUTH_URL
  if (!priceId || !baseUrl) throw new Error("課金設定が完了していません。")
  const customerId = await findOrCreateStripeCustomer(current.user.id)
  const checkout = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/billing/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard?checkout=canceled`,
    client_reference_id: current.user.id,
    subscription_data: { metadata: { userId: current.user.id, siteId: registeredSite.id } },
    metadata: { userId: current.user.id, siteId: registeredSite.id },
    locale: "ja",
  }, { idempotencyKey: `checkout-${current.user.id}-${new Date().toISOString().slice(0, 13)}` })
  if (!checkout.url) throw new Error("決済画面を開始できませんでした。")
  redirect(checkout.url)
}

export async function startCardUpdate(): Promise<void> {
  const current = await requireSession()
  const [account] = await db.select({ stripeCustomerId: user.stripeCustomerId }).from(user)
    .where(eq(user.id, current.user.id)).limit(1)
  const baseUrl = process.env.APP_BASE_URL ?? process.env.BETTER_AUTH_URL
  if (!account?.stripeCustomerId || !baseUrl) throw new Error("契約情報が見つかりません。")
  const checkout = await getStripe().checkout.sessions.create({
    mode: "setup",
    customer: account.stripeCustomerId,
    payment_method_types: ["card"],
    success_url: `${baseUrl}/settings/billing?card=success`,
    cancel_url: `${baseUrl}/settings/billing?card=canceled`,
    locale: "ja",
  })
  if (!checkout.url) throw new Error("支払方法の変更画面を開始できませんでした。")
  redirect(checkout.url)
}

async function setCancelAtPeriodEnd(cancelAtPeriodEnd: boolean): Promise<never> {
  const current = await requireSession()
  const [record] = await db.select({ stripeSubscriptionId: subscription.stripeSubscriptionId })
    .from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  if (!record?.stripeSubscriptionId) throw new Error("契約情報が見つかりません。")
  await getStripe().subscriptions.update(record.stripeSubscriptionId, { cancel_at_period_end: cancelAtPeriodEnd })
  // The subscription row is only updated by the signed webhook, so the page waits for it rather than guessing.
  redirect(`/settings/billing?pending=${cancelAtPeriodEnd ? "cancel" : "resume"}`)
}

export async function scheduleCancellation(): Promise<void> {
  await setCancelAtPeriodEnd(true)
}

export async function resumeSubscription(): Promise<void> {
  await setCancelAtPeriodEnd(false)
}
