import Link from "next/link"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { BillingStatusRefresh } from "@/components/billing-status-refresh"
import { db } from "@/lib/db"
import { subscription } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"
import { hasPaidAccess } from "@/lib/subscriptions"

export default async function BillingCompletePage() {
  const current = await requireSession()
  const [record] = await db.select({ status: subscription.status, grace: subscription.gracePeriodEndsAt })
    .from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  if (record && hasPaidAccess(record.status, record.grace)) redirect("/dashboard")

  return <section className="card narrow stack">
    <BillingStatusRefresh />
    <h1>お申し込みを確認しています</h1>
    <p>Stripeから契約情報を受信すると自動的にダッシュボードへ移動します。通常は数秒で完了します。</p>
    <Link className="button secondary" href="/dashboard">ダッシュボードで確認</Link>
  </section>
}
