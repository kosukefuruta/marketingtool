import { and, desc, eq, inArray } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AuditForm } from "@/components/audit-form"
import { auditHistoryVisible } from "@/lib/audit-history-access"
import { db } from "@/lib/db"
import { auditJob, site, subscription } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"
import { hasPaidAccess } from "@/lib/subscriptions"

const PAID_MAX_PAGES = 300

export default async function DashboardAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const current = await requireSession()
  const params = await searchParams
  const requestedPage = Number(params.page ?? "1")
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pageSize = 20
  const [[registeredSite], [plan]] = await Promise.all([
    db.select().from(site).where(eq(site.userId, current.user.id)).limit(1),
    db.select({ status: subscription.status, grace: subscription.gracePeriodEndsAt, currentPeriodEnd: subscription.currentPeriodEnd })
      .from(subscription).where(eq(subscription.userId, current.user.id)).limit(1),
  ])
  if (!registeredSite) redirect("/onboarding/site")

  const paid = hasPaidAccess(plan?.status, plan?.grace)
  const canViewHistory = auditHistoryVisible(plan?.status, plan?.grace, plan?.currentPeriodEnd)
  const [jobs, [activeJob]] = await Promise.all([
    canViewHistory ? db.select({
      id: auditJob.id, status: auditJob.status, createdAt: auditJob.createdAt,
      completedAt: auditJob.completedAt, auditedPages: auditJob.auditedPages,
    }).from(auditJob).where(eq(auditJob.siteId, registeredSite.id))
      .orderBy(desc(auditJob.createdAt), desc(auditJob.id))
      .limit(pageSize + 1).offset((page - 1) * pageSize) : [],
    paid ? db.select({ id: auditJob.id }).from(auditJob).where(and(
      eq(auditJob.siteId, registeredSite.id),
      inArray(auditJob.status, ["queued", "running"]),
    )).limit(1) : [],
  ])
  const hasNextPage = jobs.length > pageSize
  const visibleJobs = jobs.slice(0, pageSize)
  return <div className="stack">
    <div>
      <h1>サイト分析</h1>
      <p className="muted">登録サイトを巡回し、ページごとの技術SEO項目を分析します。</p>
    </div>
    {paid ? <AuditForm
      endpoint="/api/dashboard/audit"
      siteUrl={registeredSite.normalizedOrigin}
      maxPages={PAID_MAX_PAGES}
      defaultMaxPages={100}
      initialStatusUrl={activeJob ? `/api/jobs/${activeJob.id}` : undefined}
    /> : <section className="card stack">
      <p>サイト分析を実行するには有料プランの契約が必要です。</p>
      <Link className="button" href="/pricing">料金を見る</Link>
    </section>}
    {canViewHistory && <section className="card stack">
      <h2>診断履歴</h2>
      {visibleJobs.length ? <table><thead><tr><th>開始日時</th><th>状態</th><th>ページ数</th><th>結果</th></tr></thead><tbody>
        {visibleJobs.map((job) => <tr key={job.id}>
          <td>{job.createdAt.toLocaleString("ja-JP")}</td><td>{job.status}</td><td>{job.auditedPages ?? "—"}</td>
          <td><Link href={`/dashboard/audits/${job.id}`}>詳細</Link></td>
        </tr>)}
      </tbody></table> : <p className="muted">診断履歴はまだありません。</p>}
      <div className="nav-links">
        {page > 1 && <Link href={`/dashboard/audit?page=${page - 1}`}>新しい履歴へ</Link>}
        {hasNextPage && <Link href={`/dashboard/audit?page=${page + 1}`}>古い履歴へ</Link>}
      </div>
    </section>}
    <Link href="/dashboard">ダッシュボードへ戻る</Link>
  </div>
}
