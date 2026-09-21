import { and, count, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auditJob, goal, site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteOverviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const current = await requireSession()
  const { siteId } = await params
  const [[registeredSite], [goalCount], [auditCount]] = await Promise.all([
    db.select({ id: site.id }).from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1),
    db.select({ value: count() }).from(goal).where(and(eq(goal.siteId, siteId), eq(goal.userId, current.user.id))),
    db.select({ value: count() }).from(auditJob).where(and(eq(auditJob.siteId, siteId), eq(auditJob.userId, current.user.id))),
  ])
  if (!registeredSite) notFound()
  const base = `/dashboard/sites/${siteId}`

  return <div className="stack">
    <section className="summary-grid">
      <div><span>登録目標</span><strong>{goalCount?.value ?? 0}</strong></div>
      <div><span>診断回数</span><strong>{auditCount?.value ?? 0}</strong></div>
    </section>
    <div className="grid">
      <section className="card"><h2>サイト診断</h2><p>サイトを巡回して、技術SEO上の改善点を確認します。</p><Link href={`${base}/audits`}>診断する</Link></section>
      <section className="card"><h2>目標</h2><p>このサイトで達成したい数値目標を設定します。</p><Link href={`${base}/goals`}>目標を設定</Link></section>
    </div>
  </div>
}
