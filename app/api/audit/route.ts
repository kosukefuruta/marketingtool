import { eq } from "drizzle-orm"
import { startAudit } from "@/lib/audit-jobs"
import { db } from "@/lib/db"
import { subscription } from "@/lib/db/schema"
import { getSession } from "@/lib/session"
import { hasPaidAccess } from "@/lib/subscriptions"

export const runtime = "nodejs"

const FREE_MAX_PAGES = 10
const PAID_MAX_PAGES = 300

async function maxPagesForCaller(): Promise<number> {
  const session = await getSession()
  if (!session) return FREE_MAX_PAGES
  const [plan] = await db.select({ status: subscription.status, grace: subscription.gracePeriodEndsAt })
    .from(subscription).where(eq(subscription.userId, session.user.id)).limit(1)
  return hasPaidAccess(plan?.status, plan?.grace) ? PAID_MAX_PAGES : FREE_MAX_PAGES
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const url = String(form.get("url") ?? "").trim()
    const max = Number(form.get("max") ?? FREE_MAX_PAGES)
    const maxPages = await maxPagesForCaller()
    if (!url || !Number.isInteger(max) || max < 1 || max > maxPages) {
      return Response.json({ error: `URLとページ数（1〜${maxPages}）を正しく入力してください。` }, { status: 400 })
    }
    const id = startAudit(url, max)
    return Response.json({ id, statusUrl: `/api/jobs/${id}` }, { status: 202 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 })
  }
}
