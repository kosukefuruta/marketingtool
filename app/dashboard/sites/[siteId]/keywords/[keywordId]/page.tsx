import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { formatDate, formatPosition, Metrics, number, StatusLabel } from "@/components/keyword-report"
import { SiteKeywordEditor } from "@/components/site-keyword-forms"
import { dailyKeywordMetrics } from "@/lib/keyword-performance"
import { requireSession } from "@/lib/session"
import { loadSiteKeywordReport, volumeOf } from "@/lib/site-keyword-report"

export default async function SiteKeywordDetailPage({ params }: { params: Promise<{ siteId: string; keywordId: string }> }) {
  const current = await requireSession()
  const { siteId, keywordId } = await params
  const report = await loadSiteKeywordReport(siteId, current.user.id, await headers())
  const row = report?.rows.find((item) => item.id === keywordId)
  if (!report || !row) notFound()
  const origin = report.site.normalizedOrigin
  const testPeriodDays = report.site.keywordTestPeriodDays
  const base = `/dashboard/sites/${siteId}/keywords`
  const volume = volumeOf(report, row.normalizedKeyword)
  const value = report.performance?.get(row.normalizedKeyword)
  const daily = dailyKeywordMetrics(report.searchRows, { normalizedKeyword: row.normalizedKeyword, pagePath: row.pagePath, publishedAt: row.publishedAt }, testPeriodDays)
  const pageUrl = row.pagePath ? new URL(row.pagePath, origin).href : ""

  return <div className="stack">
    <div>
      <p className="muted"><Link href={row.groupName ? `${base}?group=${encodeURIComponent(row.groupName)}` : base}>← キーワード一覧</Link></p>
      <h2>{row.keyword}</h2>
      <p className="muted">
        {row.groupName ? `グループ: ${row.groupName}` : "グループなし"}
        {report.volumes && `・月間検索数: ${volume === undefined || volume === null ? "不明" : number.format(volume)}`}
      </p>
      {row.memo && <p>{row.memo}</p>}
    </div>

    <section className="card stack">
      <div className="section-heading">
        <h2>割り当てた記事</h2>
        <SiteKeywordEditor siteId={siteId} keywordId={row.id} keyword={row.keyword} pageUrl={pageUrl} groupName={row.groupName ?? ""} memo={row.memo ?? ""} from="detail" />
      </div>
      {!row.pagePath ? <p className="muted">まだ記事を割り当てていません。</p> : <dl className="stack">
        <div><dt>タイトル</dt><dd>{row.pageTitle ?? <span className="muted">未取得（一覧の「すべて取り直す」で取得します）</span>}</dd></div>
        <div><dt>URL</dt><dd><a className="url-text" href={pageUrl} target="_blank" rel="noreferrer">{pageUrl}</a></dd></div>
        <div><dt>公開日／更新日</dt><dd>{formatDate(row.publishedAt)}／{formatDate(row.modifiedAt)}</dd></div>
        <div><dt>状態</dt><dd><StatusLabel status={row.status} datesError={row.datesError} /></dd></div>
      </dl>}
    </section>

    <section className="card stack">
      <h2>Search Console の実績</h2>
      {report.performanceError && <p className="muted">{report.performanceError}</p>}
      {report.volumeError && <p className="muted">{report.volumeError}</p>}
      {report.performance && <>
        <p className="muted">{report.range.start}〜{report.range.end}。順位は表示回数で重み付けした平均です。表示の少ないクエリは Search Console が匿名化するため、「データなし」でも表示が0回とは限りません。</p>
        {row.pagePath && <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>テスト期間（公開から{testPeriodDays}日）</th><th>それ以降</th></tr></thead>
            <tbody><tr>
              <td><Metrics value={value?.testPeriod ?? null} days={value?.testPeriodDays ?? 0} /></td>
              <td><Metrics value={value?.afterTestPeriod ?? null} days={value?.afterTestPeriodDays ?? 0} volume={volume} /></td>
            </tr></tbody>
          </table>
        </div>}

        <h3>日別の推移</h3>
        {daily.length === 0 ? <p className="muted">割り当てた記事のデータはまだありません。</p> : <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>日付</th><th>順位</th><th>表示</th><th>クリック</th><th></th></tr></thead>
            <tbody>{[...daily].reverse().map((day) => <tr key={day.date}>
              <td>{day.date}</td>
              <td>{formatPosition(day.position)}</td>
              <td>{number.format(day.impressions)}</td>
              <td>{number.format(day.clicks)}</td>
              <td>{day.inTestPeriod && <span className="status-label">テスト期間</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>}

        <h3>このキーワードで表示されたほかのページ</h3>
        {!value?.otherPages.length ? <p className="muted">ありません。</p> : <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>ページ</th><th>順位</th><th>表示</th><th>クリック</th></tr></thead>
            <tbody>{value.otherPages.map((page) => <tr key={page.path}>
              <td><a className="url-text" href={new URL(page.path, origin).href} target="_blank" rel="noreferrer">{page.path}</a></td>
              <td>{formatPosition(page.position)}</td>
              <td>{number.format(page.impressions)}</td>
              <td>{number.format(page.clicks)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </>}
    </section>
  </div>
}
