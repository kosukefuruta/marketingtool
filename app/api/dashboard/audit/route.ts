import { and, count, eq, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditJob, site, subscription } from "@/lib/db/schema"
import { getSession } from "@/lib/session"
import { hasPaidAccess } from "@/lib/subscriptions"

export const runtime = "nodejs"

const PAID_MAX_PAGES = 300
const MONTHLY_AUDIT_LIMIT = 4

export async function POST(request: Request) {
  const current = await getSession()
  if (!current) return Response.json({ error: "ログインしてください。" }, { status: 401 })

  try {
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const [[registeredSite], [plan], [usage]] = await Promise.all([
      db.select({ id: site.id, origin: site.normalizedOrigin }).from(site).where(eq(site.userId, current.user.id)).limit(1),
      db.select({ status: subscription.status, grace: subscription.gracePeriodEndsAt })
        .from(subscription).where(eq(subscription.userId, current.user.id)).limit(1),
      db.select({ value: count() }).from(auditJob)
        .where(and(eq(auditJob.userId, current.user.id), gte(auditJob.createdAt, monthStart))),
    ])
    if (!registeredSite) return Response.json({ error: "先にサイトを登録してください。" }, { status: 400 })

    const form = await request.formData()
    const requestedUrl = String(form.get("url") ?? "").trim()
    const max = Number(form.get("max") ?? 100)
    if (!hasPaidAccess(plan?.status, plan?.grace)) {
      return Response.json({ error: "サイト分析を実行するには有効な契約が必要です。" }, { status: 403 })
    }
    if (requestedUrl !== registeredSite.origin || !Number.isInteger(max) || max < 1 || max > PAID_MAX_PAGES) {
      return Response.json({ error: `登録サイトとページ数（1〜${PAID_MAX_PAGES}）を正しく指定してください。` }, { status: 400 })
    }
    if ((usage?.value ?? 0) >= MONTHLY_AUDIT_LIMIT) {
      return Response.json({ error: `今月の任意診断は${MONTHLY_AUDIT_LIMIT}回までです。` }, { status: 429 })
    }
    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(auditJob).values({
      id,
      userId: current.user.id,
      siteId: registeredSite.id,
      targetUrl: registeredSite.origin,
      maxPages: max,
      status: "queued",
      progress: "診断の開始を待っています。",
      createdAt: now,
      updatedAt: now,
    })
    return Response.json({ id, statusUrl: `/api/jobs/${id}` }, { status: 202 })
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return Response.json({ error: "このサイトは現在診断中です。完了後に再実行してください。" }, { status: 409 })
    }
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 })
  }
}
