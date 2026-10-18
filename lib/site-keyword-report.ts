import { and, asc, eq } from "drizzle-orm"
import { db } from "./db"
import { account, site, siteKeyword, sitePage, subscription } from "./db/schema"
import { fetchSearchVolumes, hasDataForSeoCredentials } from "./dataforseo"
import { loadKeywordSearchRows } from "./google-data"
import { keywordMatchKey, keywordRegexChunks, performanceStartDate, summarizeKeywordPerformance, type DateRange, type KeywordAssignment, type KeywordPerformance, type SearchKeywordRow } from "./keyword-performance"
import { hasPaidAccess } from "./subscriptions"
import { measurementStatus, type MeasurementStatus } from "./site-keywords"

const PERFORMANCE_MAX_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

export type SiteKeywordRow = {
  id: string
  keyword: string
  normalizedKeyword: string
  pagePath: string | null
  groupName: string | null
  memo: string | null
  publishedAt: Date | null
  modifiedAt: Date | null
  pageTitle: string | null
  datesError: string | null
  status: MeasurementStatus
}

export type SiteKeywordReport = {
  site: typeof site.$inferSelect
  rows: SiteKeywordRow[]
  assignments: KeywordAssignment[]
  range: DateRange
  searchRows: SearchKeywordRow[]
  performance: Map<string, KeywordPerformance> | null
  performanceError: string | null
  volumes: Map<string, number | null> | null
  volumeError: string | null
}

export function volumeOf(report: SiteKeywordReport, normalizedKeyword: string): number | null | undefined {
  return report.volumes?.get(keywordMatchKey(normalizedKeyword))
}

// キーワードの一覧と詳細で同じデータを使う。Search Console の取得は15分キャッシュされるので、一覧から詳細へ移っても取り直さない。
export async function loadSiteKeywordReport(siteId: string, userId: string, requestHeaders: Headers): Promise<SiteKeywordReport | null> {
  const [[registeredSite], [googleAccount], [plan]] = await Promise.all([
    db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, userId))).limit(1),
    db.select({ accountId: account.accountId }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "google"))).limit(1),
    db.select({ status: subscription.status, grace: subscription.gracePeriodEndsAt }).from(subscription).where(eq(subscription.userId, userId)).limit(1),
  ])
  if (!registeredSite) return null
  const testPeriodDays = registeredSite.keywordTestPeriodDays

  const records = await db.select({
    id: siteKeyword.id,
    keyword: siteKeyword.keyword,
    normalizedKeyword: siteKeyword.normalizedKeyword,
    pagePath: siteKeyword.pagePath,
    groupName: siteKeyword.groupName,
    memo: siteKeyword.memo,
    publishedAt: sitePage.publishedAt,
    modifiedAt: sitePage.modifiedAt,
    pageTitle: sitePage.title,
    datesError: sitePage.datesError,
  }).from(siteKeyword)
    .leftJoin(sitePage, and(eq(sitePage.siteId, siteKeyword.siteId), eq(sitePage.path, siteKeyword.pagePath)))
    .where(eq(siteKeyword.siteId, siteId))
    .orderBy(asc(siteKeyword.pagePath), asc(siteKeyword.normalizedKeyword))

  const now = new Date()
  const rows: SiteKeywordRow[] = records.map((record) => ({ ...record, status: measurementStatus(record.pagePath, record.publishedAt, now, testPeriodDays) }))

  // Search Console は2日ほど遅れて確定するので、2日前までを見る。
  const endDate = new Date(now.getTime() - 2 * DAY_MS)
  const assignments = rows.map((row) => ({ normalizedKeyword: row.normalizedKeyword, pagePath: row.pagePath, publishedAt: row.publishedAt }))
  const startDate = performanceStartDate(assignments, endDate, PERFORMANCE_MAX_DAYS)
  const range = { start: startDate.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) }

  let volumes: Map<string, number | null> | null = null
  let volumeError: string | null = null
  // 検索ボリュームは従量課金の外部APIなので、有料プランの利用者にだけ引く。
  if (rows.length > 0 && hasPaidAccess(plan?.status, plan?.grace) && hasDataForSeoCredentials()) {
    try {
      const result = await fetchSearchVolumes(rows.map((row) => row.normalizedKeyword))
      volumes = new Map(result.map((item) => [keywordMatchKey(item.keyword), item.volume]))
    } catch {
      volumeError = "検索ボリュームを取得できませんでした。"
    }
  }

  let searchRows: SearchKeywordRow[] = []
  let performance: Map<string, KeywordPerformance> | null = null
  let performanceError: string | null = null
  if (rows.length > 0 && googleAccount && registeredSite.searchConsoleProperty) {
    try {
      searchRows = await loadKeywordSearchRows(googleAccount.accountId, requestHeaders, registeredSite.searchConsoleProperty,
        keywordRegexChunks(rows.map((row) => row.normalizedKeyword)), range.start, range.end)
      performance = summarizeKeywordPerformance(searchRows, assignments, testPeriodDays, range)
    } catch (error) {
      const detail = error instanceof Error ? error.message : ""
      performanceError = `Search Console のデータを取得できませんでした。${detail}`
    }
  } else if (rows.length > 0) {
    performanceError = "Google連携で Search Console のプロパティを選ぶと、キーワードごとの表示・順位が出ます。"
  }

  return { site: registeredSite, rows, assignments, range, searchRows, performance, performanceError, volumes, volumeError }
}
