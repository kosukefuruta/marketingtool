import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auditCheck, auditPage } from "@/lib/db/schema"
import { loadOwnedAuditJob } from "@/lib/dashboard-audits"
import { summarizeCheckCounts } from "@/lib/audit-summary"
import { requireSession } from "@/lib/session"

const PAGE_SIZE = 50

export default async function AuditDetailPage({ params, searchParams }: {
  params: Promise<{ siteId: string; auditId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const current = await requireSession()
  const { siteId, auditId } = await params
  const query = await searchParams
  const requestedPage = Number(query.page ?? "1")
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const job = await loadOwnedAuditJob(auditId, current.user.id)
  if (!job || job.siteId !== siteId) notFound()

  const [pageRows, siteChecks] = await Promise.all([
    db.select().from(auditPage).where(eq(auditPage.jobId, auditId)).orderBy(asc(auditPage.url), asc(auditPage.id))
      .limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE),
    db.select().from(auditCheck).where(and(eq(auditCheck.jobId, auditId), isNull(auditCheck.pageId)))
      .orderBy(asc(auditCheck.position), asc(auditCheck.id)),
  ])
  const hasNextPage = pageRows.length > PAGE_SIZE
  const pages = pageRows.slice(0, PAGE_SIZE)
  const pageIds = pages.map((item) => item.id)
  const pageChecks = pageIds.length ? await db.select({ pageId: auditCheck.pageId, evaluation: auditCheck.evaluation })
    .from(auditCheck).where(and(eq(auditCheck.jobId, auditId), inArray(auditCheck.pageId, pageIds))) : []
  const counts = new Map<string, { good: number; review: number; improve: number; unreachable: number }>()
  for (const check of pageChecks) {
    if (!check.pageId) continue
    const value = counts.get(check.pageId) ?? { good: 0, review: 0, improve: 0, unreachable: 0 }
    if (check.evaluation === "良好") value.good += 1
    else if (check.evaluation === "要確認") value.review += 1
    else if (check.evaluation === "要改善") value.improve += 1
    else if (check.evaluation === "取得不能") value.unreachable += 1
    counts.set(check.pageId, value)
  }
  const base = `/dashboard/sites/${siteId}/audits/${auditId}`

  return <div className="stack">
    <div><h2>診断結果</h2><p className="muted">ページ一覧から詳しい診断内容を確認できます。</p></div>
    <section className="card stack"><h2>診断概要</h2>
      <div className="summary-grid">
        <div><span>状態</span><strong>{job.status}</strong></div><div><span>診断ページ</span><strong>{job.auditedPages ?? "—"}</strong></div>
        <div><span>良好</span><strong>{job.goodCount ?? "—"}</strong></div><div><span>要確認</span><strong>{job.reviewCount ?? "—"}</strong></div>
        <div><span>要改善</span><strong>{job.improveCount ?? "—"}</strong></div><div><span>取得不能</span><strong>{job.unreachableCount ?? "—"}</strong></div>
      </div>
      <p className="muted">開始日時: {job.createdAt.toLocaleString("ja-JP")}</p>{job.error && <p className="error">{job.error}</p>}
    </section>
    {siteChecks.length > 0 && <section className="card stack"><h2>サイト全体</h2>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>診断項目</th><th>評価</th><th>詳細</th></tr></thead><tbody>
        {siteChecks.map((check) => <tr key={check.id}><td>{check.item}</td><td>{check.evaluation}</td><td>{check.detail}</td></tr>)}
      </tbody></table></div>
    </section>}
    <section className="card stack"><h2>ページ一覧</h2>
      {pages.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>ページ</th><th>HTTP</th><th>概要</th><th></th></tr></thead><tbody>
        {pages.map((item) => { const count = counts.get(item.id); return <tr key={item.id}>
          <td><span className="table-primary">{item.title || "タイトルなし"}</span><span className="table-secondary">{item.url}</span></td>
          <td>{item.httpStatus ?? "—"}</td><td>{count ? summarizeCheckCounts({ goodCount: count.good, reviewCount: count.review, improveCount: count.improve, unreachableCount: count.unreachable }) : "集計結果なし"}</td>
          <td><Link href={`${base}/pages/${item.id}?fromPage=${page}`}>詳細</Link></td>
        </tr>})}
      </tbody></table></div> : <p className="muted">ページの診断結果はまだありません。</p>}
      <div className="nav-links">{page > 1 && <Link href={`${base}?page=${page - 1}`}>前の50件</Link>}{hasNextPage && <Link href={`${base}?page=${page + 1}`}>次の50件</Link>}</div>
    </section>
    {job.report && <a className="button secondary" href={`/api/jobs/${auditId}/report`} target="_blank" rel="noreferrer">Markdownレポートを表示</a>}
    <Link href={`/dashboard/sites/${siteId}/audits`}>サイト診断へ戻る</Link>
  </div>
}
