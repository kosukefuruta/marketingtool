import { and, asc, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SiteKeywordBulkForm, SiteKeywordEditor, SitePageDatesRefreshForm } from "@/components/site-keyword-forms"
import { db } from "@/lib/db"
import { site, siteKeyword, sitePage } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"
import { measurementStatus, TEST_PERIOD_DAYS, type MeasurementStatus } from "@/lib/site-keywords"

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })

function formatDate(value: Date | null): string {
  return value ? dateFormat.format(value) : "—"
}

function StatusLabel({ status, datesError }: { status: MeasurementStatus; datesError: string | null }) {
  switch (status.state) {
    case "unassigned": return <span className="status-label">記事未割り当て</span>
    case "unknownDate": return <span className="status-label" title={datesError ?? undefined}>公開日不明</span>
    case "testPeriod": return <span className="status-label">テスト期間中（{formatDate(status.measurableFrom)}から測定）</span>
    case "measurable": return <span className="status-label">測定できる（公開{status.daysSincePublished}日）</span>
  }
}

type Row = {
  id: string
  keyword: string
  pagePath: string | null
  memo: string | null
  publishedAt: Date | null
  modifiedAt: Date | null
  datesError: string | null
  status: MeasurementStatus
}

export default async function SiteKeywordsPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ view?: string }> }) {
  const current = await requireSession()
  const { siteId } = await params
  const { view } = await searchParams
  const byPage = view === "pages"
  const [registeredSite] = await db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1)
  if (!registeredSite) notFound()

  const records = await db.select({
    id: siteKeyword.id,
    keyword: siteKeyword.keyword,
    pagePath: siteKeyword.pagePath,
    memo: siteKeyword.memo,
    publishedAt: sitePage.publishedAt,
    modifiedAt: sitePage.modifiedAt,
    datesError: sitePage.datesError,
  }).from(siteKeyword)
    .leftJoin(sitePage, and(eq(sitePage.siteId, siteKeyword.siteId), eq(sitePage.path, siteKeyword.pagePath)))
    .where(eq(siteKeyword.siteId, siteId))
    .orderBy(asc(siteKeyword.pagePath), asc(siteKeyword.normalizedKeyword))

  const now = new Date()
  const rows: Row[] = records.map((record) => ({ ...record, status: measurementStatus(record.pagePath, record.publishedAt, now) }))
  const pages = new Map<string, Row[]>()
  for (const row of rows) if (row.pagePath) pages.set(row.pagePath, [...(pages.get(row.pagePath) ?? []), row])
  const count = (state: MeasurementStatus["state"]) => rows.filter((row) => row.status.state === state).length
  const origin = registeredSite.normalizedOrigin
  const base = `/dashboard/sites/${siteId}/keywords`

  return <div className="stack">
    <div>
      <h2>キーワード</h2>
      <p className="muted">狙うキーワードごとに記事を割り当てます。記事の公開日・更新日はページの構造化データから読み取り、公開から{TEST_PERIOD_DAYS}日間はテスト期間として測定から外します。</p>
    </div>

    <details className={`goal-add ${rows.length ? "goal-add-collapsed" : "card"}`} open={rows.length === 0}>
      <summary>キーワードを登録</summary>
      <div className={rows.length ? "card goal-add-content" : "goal-add-content"}>
        <SiteKeywordBulkForm siteId={siteId} siteOrigin={origin} />
      </div>
    </details>

    <section className="card stack">
      <div className="section-heading">
        <h2>登録済みのキーワード</h2>
        <span className="muted">
          {byPage ? <Link href={base}>キーワードごとに見る</Link> : <Link href={`${base}?view=pages`}>記事ごとに見る</Link>}
        </span>
      </div>
      <div className="summary-grid">
        <div><span>キーワード</span><strong>{rows.length}</strong></div>
        <div><span>記事</span><strong>{pages.size}</strong></div>
        <div><span>測定できる</span><strong>{count("measurable")}</strong></div>
        <div><span>テスト期間中</span><strong>{count("testPeriod")}</strong></div>
        <div><span>公開日不明</span><strong>{count("unknownDate")}</strong></div>
        <div><span>記事未割り当て</span><strong>{count("unassigned")}</strong></div>
      </div>
      {rows.length > 0 && <SitePageDatesRefreshForm siteId={siteId} />}

      {rows.length === 0 ? <p className="muted">まだキーワードがありません。</p> : byPage ? <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>記事</th><th>公開日</th><th>更新日</th><th>状態</th><th>キーワード</th></tr></thead>
          <tbody>{[...pages.entries()].map(([path, items]) => <tr key={path}>
            <td><a className="url-text" href={new URL(path, origin).href} target="_blank" rel="noreferrer">{path}</a></td>
            <td>{formatDate(items[0].publishedAt)}</td>
            <td>{formatDate(items[0].modifiedAt)}</td>
            <td><StatusLabel status={items[0].status} datesError={items[0].datesError} /></td>
            <td>{items.map((item) => <span className="table-secondary" key={item.id}>{item.keyword}</span>)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>キーワード</th><th>記事</th><th>公開日</th><th>更新日</th><th>状態</th><th></th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td><span className="table-primary">{row.keyword}</span>{row.memo && <span className="table-secondary">{row.memo}</span>}</td>
            <td>{row.pagePath ? <a className="url-text" href={new URL(row.pagePath, origin).href} target="_blank" rel="noreferrer">{row.pagePath}</a> : "—"}</td>
            <td>{formatDate(row.publishedAt)}</td>
            <td>{formatDate(row.modifiedAt)}</td>
            <td><StatusLabel status={row.status} datesError={row.datesError} /></td>
            <td><SiteKeywordEditor siteId={siteId} keywordId={row.id} keyword={row.keyword} pageUrl={row.pagePath ? new URL(row.pagePath, origin).href : ""} memo={row.memo ?? ""} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>
}
