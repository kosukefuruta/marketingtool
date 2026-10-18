import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { formatDate, formatPosition, number, StatusLabel } from "@/components/keyword-report"
import { KeywordTestPeriodForm, SiteKeywordBulkForm, SitePageDatesRefreshForm } from "@/components/site-keyword-forms"
import { requireSession } from "@/lib/session"
import { loadSiteKeywordReport, volumeOf, type SiteKeywordReport, type SiteKeywordRow } from "@/lib/site-keyword-report"
import type { MeasurementStatus } from "@/lib/site-keywords"

const NO_GROUP = "__none"

function groupKey(row: SiteKeywordRow): string {
  return row.groupName ?? NO_GROUP
}

function groupLabel(key: string): string {
  return key === NO_GROUP ? "グループなし" : key
}

function KeywordTable({ rows, report, base }: { rows: SiteKeywordRow[]; report: SiteKeywordReport; base: string }) {
  const origin = report.site.normalizedOrigin
  return <div className="data-table-wrap">
    <table className="data-table">
      <thead><tr><th>キーワード</th>{report.volumes && <th>月間検索数</th>}<th>記事</th><th>状態</th>{report.performance && <><th>順位</th><th>別のページ</th></>}</tr></thead>
      <tbody>{rows.map((row) => {
        const value = report.performance?.get(row.normalizedKeyword)
        const volume = volumeOf(report, row.normalizedKeyword)
        return <tr key={row.id}>
          <td><Link className="table-primary" href={`${base}/${row.id}`}>{row.keyword}</Link>{row.memo && <span className="table-secondary">{row.memo}</span>}</td>
          {report.volumes && <td>{volume === undefined || volume === null ? <span className="muted">不明</span> : number.format(volume)}</td>}
          <td>{row.pagePath ? <a className="url-text" href={new URL(row.pagePath, origin).href} target="_blank" rel="noreferrer">{row.pagePath}</a> : "—"}</td>
          <td><StatusLabel status={row.status} datesError={row.datesError} /></td>
          {report.performance && <>
            <td>{!row.pagePath ? <span className="muted">—</span> : <>
              <span className="table-primary">{value?.afterTestPeriodDays ? formatPosition(value.afterTestPeriod?.position) : "—"}</span>
              {value?.testPeriod && <span className="table-secondary">テスト期間 {formatPosition(value.testPeriod.position)}</span>}
            </>}</td>
            <td>{value?.otherPages.length ? <span className="table-secondary">{value.otherPages.length}ページ</span> : <span className="muted">—</span>}</td>
          </>}
        </tr>
      })}</tbody>
    </table>
  </div>
}

export default async function SiteKeywordsPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ view?: string; group?: string }> }) {
  const current = await requireSession()
  const { siteId } = await params
  const { view, group } = await searchParams
  const byPage = view === "pages"
  const report = await loadSiteKeywordReport(siteId, current.user.id, await headers())
  if (!report) notFound()
  const testPeriodDays = report.site.keywordTestPeriodDays
  const origin = report.site.normalizedOrigin
  const base = `/dashboard/sites/${siteId}/keywords`

  const groupKeys = [...new Set(report.rows.map(groupKey))].sort((a, b) => a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, "ja"))
  const selectedGroup = group && groupKeys.includes(group) ? group : null
  const rows = selectedGroup ? report.rows.filter((row) => groupKey(row) === selectedGroup) : report.rows
  const href = (next: { view?: string; group?: string | null }) => {
    const query = new URLSearchParams()
    const nextView = next.view === undefined ? (byPage ? "pages" : undefined) : next.view
    const nextGroup = next.group === undefined ? selectedGroup : next.group
    if (nextView) query.set("view", nextView)
    if (nextGroup) query.set("group", nextGroup)
    const text = query.toString()
    return text ? `${base}?${text}` : base
  }

  const pages = new Map<string, SiteKeywordRow[]>()
  for (const row of rows) if (row.pagePath) pages.set(row.pagePath, [...(pages.get(row.pagePath) ?? []), row])
  const count = (state: MeasurementStatus["state"]) => rows.filter((row) => row.status.state === state).length
  const sections = selectedGroup || groupKeys.length <= 1
    ? [{ key: selectedGroup ?? groupKeys[0] ?? NO_GROUP, rows }]
    : groupKeys.map((key) => ({ key, rows: rows.filter((row) => groupKey(row) === key) }))

  return <div className="stack">
    <div>
      <h2>キーワード</h2>
      <p className="muted">狙うキーワードごとに記事を割り当てます。記事の公開日・更新日はページの構造化データから読み取ります。公開から{testPeriodDays}日間はテスト期間として、それ以降の数字と分けて表示します。</p>
    </div>

    <details className={`goal-add ${report.rows.length ? "goal-add-collapsed" : "card"}`} open={report.rows.length === 0}>
      <summary>キーワードを登録</summary>
      <div className={report.rows.length ? "card goal-add-content" : "goal-add-content"}>
        <SiteKeywordBulkForm siteId={siteId} siteOrigin={origin} />
      </div>
    </details>

    <section className="card stack">
      <div className="section-heading">
        <h2>登録済みのキーワード</h2>
        <span className="muted">
          {byPage ? <Link href={href({ view: "" })}>キーワードごとに見る</Link> : <Link href={href({ view: "pages" })}>記事ごとに見る</Link>}
        </span>
      </div>
      {groupKeys.length > 1 && <nav className="site-menu" aria-label="グループ">
        <Link className={selectedGroup ? undefined : "active"} href={href({ group: null })}>すべて（{report.rows.length}）</Link>
        {groupKeys.map((key) => <Link className={selectedGroup === key ? "active" : undefined} href={href({ group: key })} key={key}>
          {groupLabel(key)}（{report.rows.filter((row) => groupKey(row) === key).length}）
        </Link>)}
      </nav>}
      <div className="summary-grid">
        <div><span>キーワード</span><strong>{rows.length}</strong></div>
        <div><span>記事</span><strong>{pages.size}</strong></div>
        <div><span>測定できる</span><strong>{count("measurable")}</strong></div>
        <div><span>テスト期間中</span><strong>{count("testPeriod")}</strong></div>
        <div><span>公開日不明</span><strong>{count("unknownDate")}</strong></div>
        <div><span>記事未割り当て</span><strong>{count("unassigned")}</strong></div>
      </div>
      {report.rows.length > 0 && <SitePageDatesRefreshForm siteId={siteId} />}
      <KeywordTestPeriodForm siteId={siteId} days={testPeriodDays} />
      {report.performance && <p className="muted">Search Console（{report.range.start}〜{report.range.end}）。順位はテスト期間後の、表示回数で重み付けした平均です。表示回数・クリックと日別の推移は、キーワードを押すと見られます。「別のページ」は、割り当てた記事以外にこのキーワードで表示されたページの数です。</p>}
      {report.volumeError && <p className="muted">{report.volumeError}</p>}
      {report.performanceError && <p className="muted">{report.performanceError}</p>}

      {rows.length === 0 ? <p className="muted">まだキーワードがありません。</p> : byPage ? <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>記事</th><th>公開日</th><th>更新日</th><th>状態</th><th>キーワード</th></tr></thead>
          <tbody>{[...pages.entries()].map(([path, items]) => <tr key={path}>
            <td><a className="url-text" href={new URL(path, origin).href} target="_blank" rel="noreferrer">{path}</a>{items[0].pageTitle && <span className="table-secondary">{items[0].pageTitle}</span>}</td>
            <td>{formatDate(items[0].publishedAt)}</td>
            <td>{formatDate(items[0].modifiedAt)}</td>
            <td><StatusLabel status={items[0].status} datesError={items[0].datesError} /></td>
            <td>{items.map((item) => <Link className="table-secondary" href={`${base}/${item.id}`} key={item.id}>{item.keyword}</Link>)}</td>
          </tr>)}</tbody>
        </table>
      </div> : sections.map((section) => <div className="stack" key={section.key}>
        {sections.length > 1 && <h3>{groupLabel(section.key)}（{section.rows.length}）</h3>}
        <KeywordTable rows={section.rows} report={report} base={base} />
      </div>)}
    </section>
  </div>
}
