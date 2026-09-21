import { and, asc, eq, inArray } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auditCheck, auditJob, auditPage, site } from "@/lib/db/schema"
import { canViewAuditHistory } from "@/lib/dashboard-audits"
import { requireSession } from "@/lib/session"

export default async function AuditDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const current = await requireSession()
  const { id } = await params
  const query = await searchParams
  const requestedPage = Number(query.page ?? "1")
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pageSize = 100
  const [[job], canView] = await Promise.all([
    db.select().from(auditJob).innerJoin(site, eq(auditJob.siteId, site.id))
      .where(and(eq(auditJob.id, id), eq(site.userId, current.user.id))).limit(1),
    canViewAuditHistory(current.user.id),
  ])
  if (!job || !canView) notFound()

  const checkRows = await db.select().from(auditCheck).where(eq(auditCheck.jobId, id))
    .orderBy(asc(auditCheck.position), asc(auditCheck.id))
    .limit(pageSize + 1).offset((page - 1) * pageSize)
  const hasNextPage = checkRows.length > pageSize
  const checks = checkRows.slice(0, pageSize)
  const pageIds = [...new Set(checks.flatMap((check) => check.pageId ? [check.pageId] : []))]
  const pages = pageIds.length ? await db.select().from(auditPage).where(inArray(auditPage.id, pageIds)) : []
  const pageUrls = new Map(pages.map((result) => [result.id, result.url]))
  return <div className="stack">
    <h1>診断詳細</h1>
    <section className="card stack">
      <p>状態: <strong>{job.audit_job.status}</strong></p>
      <p>開始日時: {job.audit_job.createdAt.toLocaleString("ja-JP")}</p>
      <p>診断ページ数: {job.audit_job.auditedPages ?? "—"}</p>
      {job.audit_job.error && <p className="error">{job.audit_job.error}</p>}
    </section>
    {checks.length > 0 && <section className="card stack"><h2>構造化診断結果</h2>
      <p>診断項目を100件ずつ表示しています。</p>
      <table><thead><tr><th>対象</th><th>診断項目</th><th>評価</th><th>詳細</th></tr></thead><tbody>
        {checks.map((check) => <tr key={check.id}><td>{check.pageId ? pageUrls.get(check.pageId) ?? "ページ" : "サイト全体"}</td><td>{check.item}</td><td>{check.evaluation}</td><td>{check.detail}</td></tr>)}
      </tbody></table>
      <div className="nav-links">
        {page > 1 && <Link href={`/dashboard/audits/${id}?page=${page - 1}`}>前の100件</Link>}
        {hasNextPage && <Link href={`/dashboard/audits/${id}?page=${page + 1}`}>次の100件</Link>}
      </div>
    </section>}
    {job.audit_job.report && <a className="button secondary" href={`/api/jobs/${id}/report`} target="_blank" rel="noreferrer">Markdownレポートを表示</a>}
    <Link href="/dashboard/audit">サイト分析へ戻る</Link>
  </div>
}
