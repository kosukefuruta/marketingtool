import { and, asc, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auditCheck, auditPage } from "@/lib/db/schema"
import { loadOwnedAuditJob } from "@/lib/dashboard-audits"
import { requireSession } from "@/lib/session"

export default async function AuditPageDetail({ params, searchParams }: {
  params: Promise<{ siteId: string; auditId: string; pageId: string }>
  searchParams: Promise<{ fromPage?: string }>
}) {
  const current = await requireSession()
  const { siteId, auditId, pageId } = await params
  const query = await searchParams
  const requestedFromPage = Number(query.fromPage ?? "1")
  const fromPage = Number.isInteger(requestedFromPage) && requestedFromPage > 0 ? requestedFromPage : 1
  const job = await loadOwnedAuditJob(auditId, current.user.id)
  if (!job || job.siteId !== siteId) notFound()

  const [[page], checks] = await Promise.all([
    db.select().from(auditPage).where(and(eq(auditPage.id, pageId), eq(auditPage.jobId, auditId))).limit(1),
    db.select().from(auditCheck).where(and(eq(auditCheck.jobId, auditId), eq(auditCheck.pageId, pageId)))
      .orderBy(asc(auditCheck.position), asc(auditCheck.id)),
  ])
  if (!page) notFound()
  const detailUrl = `/dashboard/sites/${siteId}/audits/${auditId}`

  return <div className="stack">
    <div><h2>{page.title || "タイトルなし"}</h2><p className="url-text">{page.url}</p></div>
    <section className="card stack">
      <div className="section-heading"><h2>ページ情報</h2><a href={page.finalUrl} target="_blank" rel="noreferrer">ページを開く</a></div>
      <dl className="detail-grid">
        <div><dt>HTTPステータス</dt><dd>{page.httpStatus ?? "—"}</dd></div><div><dt>言語</dt><dd>{page.lang || "未設定"}</dd></div>
        <div><dt>H1の数</dt><dd>{page.h1Count}</dd></div><div><dt>本文文字数</dt><dd>{page.textLength.toLocaleString("ja-JP")}</dd></div>
        <div><dt>画像</dt><dd>{page.images}件</dd></div><div><dt>altなし画像</dt><dd>{page.imagesWithoutAlt}件</dd></div>
        <div className="detail-wide"><dt>description</dt><dd>{page.description || "未設定"}</dd></div>
        <div className="detail-wide"><dt>canonical</dt><dd>{page.canonical || "未設定"}</dd></div>
        <div className="detail-wide"><dt>robots</dt><dd>{page.robots || "未設定"}</dd></div>
      </dl>
      {page.error && <p className="error">{page.error}</p>}
    </section>
    <section className="card stack"><h2>診断項目</h2>
      {checks.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>診断項目</th><th>評価</th><th>詳細</th></tr></thead><tbody>
        {checks.map((check) => <tr key={check.id}><td>{check.item}</td><td>{check.evaluation}</td><td>{check.detail}</td></tr>)}
      </tbody></table></div> : <p className="muted">診断項目はありません。</p>}
    </section>
    <Link href={`${detailUrl}${fromPage > 1 ? `?page=${fromPage}` : ""}`}>ページ一覧へ戻る</Link>
  </div>
}
