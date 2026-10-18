import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { KeywordTestPeriodForm, SiteKeywordBulkForm, SiteKeywordEditor, SitePageDatesRefreshForm } from "@/components/site-keyword-forms"
import { db } from "@/lib/db"
import { account, site, siteKeyword, sitePage, subscription } from "@/lib/db/schema"
import { fetchSearchVolumes, hasDataForSeoCredentials } from "@/lib/dataforseo"
import { loadKeywordSearchRows } from "@/lib/google-data"
import { keywordMatchKey, keywordRegexChunks, per30Days, performanceStartDate, summarizeKeywordPerformance, type KeywordPerformance, type WindowMetrics } from "@/lib/keyword-performance"
import { requireSession } from "@/lib/session"
import { hasPaidAccess } from "@/lib/subscriptions"
import { measurementStatus, type MeasurementStatus } from "@/lib/site-keywords"

const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 })
const PERFORMANCE_MAX_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

function Metrics({ value, days, volume }: { value: WindowMetrics | null; days: number; volume?: number | null }) {
  if (days === 0) return <span className="muted">—</span>
  if (!value) return <><span className="muted">データなし</span><span className="table-secondary">{days}日間</span></>
  const monthly = per30Days(value.impressions, days)
  const rate = monthly !== null && volume ? monthly / volume * 100 : null
  return <>
    <span className="table-primary">{value.position === null ? "—" : `${number.format(value.position)}位`}</span>
    <span className="table-secondary">{days}日間で表示 {number.format(value.impressions)}・クリック {number.format(value.clicks)}</span>
    {monthly !== null && <span className="table-secondary">30日換算 表示 {number.format(monthly)}{rate !== null && `（表示率 ${rate > 0 && rate < 0.1 ? "0.1%未満" : `${number.format(rate)}%`}）`}</span>}
  </>
}

function OtherPages({ value }: { value: KeywordPerformance | undefined }) {
  const pages = value?.otherPages ?? []
  if (pages.length === 0) return <span className="muted">—</span>
  return <>
    {pages.slice(0, 2).map((page) => <span className="table-secondary" key={page.path}>{page.path}（{page.position === null ? "—" : `${number.format(page.position)}位`}・表示 {number.format(page.impressions)}）</span>)}
    {pages.length > 2 && <span className="table-secondary">ほか{pages.length - 2}ページ</span>}
  </>
}

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
  normalizedKeyword: string
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
  const [[registeredSite], [googleAccount], [plan]] = await Promise.all([
    db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1),
    db.select({ accountId: account.accountId }).from(account).where(and(eq(account.userId, current.user.id), eq(account.providerId, "google"))).limit(1),
    db.select({ status: subscription.status, grace: subscription.gracePeriodEndsAt }).from(subscription).where(eq(subscription.userId, current.user.id)).limit(1),
  ])
  if (!registeredSite) notFound()
  const testPeriodDays = registeredSite.keywordTestPeriodDays

  const records = await db.select({
    id: siteKeyword.id,
    keyword: siteKeyword.keyword,
    normalizedKeyword: siteKeyword.normalizedKeyword,
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
  const rows: Row[] = records.map((record) => ({ ...record, status: measurementStatus(record.pagePath, record.publishedAt, now, testPeriodDays) }))

  // Search Console は2日ほど遅れて確定するので、2日前までを見る。
  const endDate = new Date(now.getTime() - 2 * DAY_MS)
  const assignments = rows.map((row) => ({ normalizedKeyword: row.normalizedKeyword, pagePath: row.pagePath, publishedAt: row.publishedAt }))
  const startDate = performanceStartDate(assignments, endDate, PERFORMANCE_MAX_DAYS)
  const period = `${startDate.toISOString().slice(0, 10)}〜${endDate.toISOString().slice(0, 10)}`
  let performance: Map<string, KeywordPerformance> | null = null
  let performanceError: string | null = null
  // 検索ボリュームは従量課金の外部APIなので、有料プランの利用者にだけ引く。
  let volumes: Map<string, number | null> | null = null
  let volumeError: string | null = null
  if (rows.length > 0 && hasPaidAccess(plan?.status, plan?.grace) && hasDataForSeoCredentials()) {
    try {
      const result = await fetchSearchVolumes(rows.map((row) => row.normalizedKeyword))
      volumes = new Map(result.map((item) => [keywordMatchKey(item.keyword), item.volume]))
    } catch {
      volumeError = "検索ボリュームを取得できませんでした。"
    }
  }
  if (rows.length > 0 && googleAccount && registeredSite.searchConsoleProperty) {
    try {
      const searchRows = await loadKeywordSearchRows(googleAccount.accountId, await headers(), registeredSite.searchConsoleProperty,
        keywordRegexChunks(rows.map((row) => row.normalizedKeyword)), startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10))
      performance = summarizeKeywordPerformance(searchRows, assignments, testPeriodDays, { start: startDate.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) })
    } catch (error) {
      const detail = error instanceof Error ? error.message : ""
      performanceError = `Search Console のデータを取得できませんでした。${detail}`
    }
  } else if (rows.length > 0) {
    performanceError = "Google連携で Search Console のプロパティを選ぶと、キーワードごとの表示・順位が出ます。"
  }
  const pages = new Map<string, Row[]>()
  for (const row of rows) if (row.pagePath) pages.set(row.pagePath, [...(pages.get(row.pagePath) ?? []), row])
  const count = (state: MeasurementStatus["state"]) => rows.filter((row) => row.status.state === state).length
  const origin = registeredSite.normalizedOrigin
  const base = `/dashboard/sites/${siteId}/keywords`

  return <div className="stack">
    <div>
      <h2>キーワード</h2>
      <p className="muted">狙うキーワードごとに記事を割り当てます。記事の公開日・更新日はページの構造化データから読み取ります。公開から{testPeriodDays}日間はテスト期間として、それ以降の数字と分けて表示します。</p>
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
      <KeywordTestPeriodForm siteId={siteId} days={testPeriodDays} />
      {performance && <p className="muted">Search Console（{period}）。順位は表示回数で重み付けした平均です。表示回数は列ごとに日数が違うので、30日あたりに換算した値と、月間検索数に対する表示率（30日換算の表示 ÷ 月間検索数）も出しています。表示の少ないクエリは Search Console が匿名化するため、「データなし」でも表示が0回とは限りません。</p>}
      {volumeError && <p className="muted">{volumeError}</p>}
      {performanceError && <p className="muted">{performanceError}</p>}

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
          <thead><tr><th>キーワード</th>{volumes && <th>月間検索数</th>}<th>記事</th><th>公開日／更新日</th><th>状態</th>{performance && <><th>テスト期間</th><th>それ以降</th><th>別のページ</th></>}<th></th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td><span className="table-primary">{row.keyword}</span>{row.memo && <span className="table-secondary">{row.memo}</span>}</td>
            {volumes && <td>{(() => { const volume = volumes.get(keywordMatchKey(row.normalizedKeyword)); return volume === undefined || volume === null ? <span className="muted">不明</span> : number.format(volume) })()}</td>}
            <td>{row.pagePath ? <a className="url-text" href={new URL(row.pagePath, origin).href} target="_blank" rel="noreferrer">{row.pagePath}</a> : "—"}</td>
            <td><span className="table-secondary">{formatDate(row.publishedAt)}</span><span className="table-secondary">{formatDate(row.modifiedAt)}</span></td>
            <td><StatusLabel status={row.status} datesError={row.datesError} /></td>
            {performance && <>
              <td>{row.pagePath ? <Metrics value={performance.get(row.normalizedKeyword)?.testPeriod ?? null} days={performance.get(row.normalizedKeyword)?.testPeriodDays ?? 0} /> : <span className="muted">—</span>}</td>
              <td>{row.pagePath ? <Metrics value={performance.get(row.normalizedKeyword)?.afterTestPeriod ?? null} days={performance.get(row.normalizedKeyword)?.afterTestPeriodDays ?? 0} volume={volumes?.get(keywordMatchKey(row.normalizedKeyword))} /> : <span className="muted">—</span>}</td>
              <td><OtherPages value={performance.get(row.normalizedKeyword)} /></td>
            </>}
            <td><SiteKeywordEditor siteId={siteId} keywordId={row.id} keyword={row.keyword} pageUrl={row.pagePath ? new URL(row.pagePath, origin).href : ""} memo={row.memo ?? ""} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>
}
