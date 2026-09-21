import { auth } from "./auth"
import { runWithConcurrency } from "./async-pool"
import { updateRate } from "./bayesian-rate"
import type { RateObservation } from "./goal-breakdowns"
import type { GoalMetric } from "./goals"

export const GOOGLE_DATA_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const

export type SearchConsoleSite = { siteUrl: string; permissionLevel: string }
export type AnalyticsProperty = { property: string; displayName: string; account: string; accountName: string }
export type GoogleProperties = {
  searchConsoleSites: SearchConsoleSite[]
  analyticsProperties: AnalyticsProperty[]
  searchConsoleError: string | null
  analyticsError: string | null
}

const GOOGLE_API_TIMEOUT_MS = 10_000

async function googleJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const requestHeaders = new Headers(init?.headers)
  requestHeaders.set("authorization", `Bearer ${accessToken}`)
  const response = await fetch(url, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
    signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Google APIから情報を取得できませんでした（${response.status}）。`)
  return response.json() as Promise<T>
}

export type GoogleGoalValue = { value: string; detail?: string }
export type NumericObservation = { value: number; weight: number }
export type GoogleGoalMetrics = {
  values: Record<string, GoogleGoalValue>
  keywordValues: Record<string, GoogleGoalValue>
  observations: Record<string, RateObservation>
  numericObservations: Record<string, NumericObservation>
  errors: string[]
  period: string
}
const goalMetricsCache = new Map<string, { expiresAt: number; data: GoogleGoalMetrics }>()
const GOAL_METRICS_CACHE_MS = 15 * 60 * 1000
const PARTIAL_GOAL_METRICS_CACHE_MS = 60 * 1000
const GOAL_METRICS_CACHE_MAX_ENTRIES = 200
const KEYWORD_REQUEST_CONCURRENCY = 4
const RPM_PRIOR_PAGEVIEWS = 10_000

const goalValueKeys: Partial<Record<GoalMetric, string>> = {
  adRevenue: "ad-revenue",
  pageviews: "pageviews",
  organicSessions: "organic-sessions",
  organicClicks: "organic-clicks",
  impressions: "impressions",
  ctr: "ctr",
}

export function googleValueForGoal(metric: GoalMetric, metrics: GoogleGoalMetrics | null): GoogleGoalValue | null {
  const key = goalValueKeys[metric]
  return key ? metrics?.values[key] ?? null : null
}

function readGoalMetricsCache(key: string): GoogleGoalMetrics | null {
  const now = Date.now()
  for (const [cachedKey, entry] of goalMetricsCache) if (entry.expiresAt <= now) goalMetricsCache.delete(cachedKey)
  const cached = goalMetricsCache.get(key)
  if (!cached) return null
  goalMetricsCache.delete(key)
  goalMetricsCache.set(key, cached)
  return cached.data
}

function writeGoalMetricsCache(key: string, data: GoogleGoalMetrics, ttl: number): void {
  goalMetricsCache.delete(key)
  while (goalMetricsCache.size >= GOAL_METRICS_CACHE_MAX_ENTRIES) {
    const oldestKey = goalMetricsCache.keys().next().value
    if (oldestKey === undefined) break
    goalMetricsCache.delete(oldestKey)
  }
  goalMetricsCache.set(key, { expiresAt: Date.now() + ttl, data })
}

function isoDate(daysAgo: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function metricNumber(report: { rows?: Array<{ metricValues?: Array<{ value?: string }> }> }, index: number): number | null {
  const value = Number(report.rows?.[0]?.metricValues?.[index]?.value)
  return Number.isFinite(value) ? value : null
}

export async function loadGoogleGoalMetrics(providerAccountId: string, requestHeaders: Headers, searchConsoleProperty: string | null, ga4Property: string | null, targetKeywords: string[] = []): Promise<GoogleGoalMetrics> {
  const uniqueKeywords = [...new Set(targetKeywords.map((keyword) => keyword.trim()).filter(Boolean))]
  const keywords = uniqueKeywords.slice(0, 20)
  const keywordLimitState = uniqueKeywords.length > 20 ? "truncated" : "complete"
  const cacheKey = `${providerAccountId}\n${searchConsoleProperty ?? ""}\n${ga4Property ?? ""}\n${keywordLimitState}\n${keywords.sort().join("\n")}`
  const cached = readGoalMetricsCache(cacheKey)
  if (cached) return cached
  const token = await auth.api.getAccessToken({ body: { providerId: "google", accountId: providerAccountId }, headers: requestHeaders })
  const startDate = isoDate(29)
  const endDate = isoDate(2)
  const values: Record<string, GoogleGoalValue> = {}
  const keywordValues: Record<string, GoogleGoalValue> = {}
  const observations: Record<string, RateObservation> = {}
  const numericObservations: Record<string, NumericObservation> = {}
  const errors: string[] = []
  let hasApiError = false
  const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 })

  const tasks: Promise<void>[] = []
  if (searchConsoleProperty) tasks.push(googleJson<{ rows?: Array<{ clicks?: number; impressions?: number; ctr?: number; position?: number }> }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(searchConsoleProperty)}/searchAnalytics/query`, token.accessToken,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate, endDate }) },
  ).then((report) => {
    const row = report.rows?.[0]
    values.impressions = { value: `${number.format(row?.impressions ?? 0)}回` }
    values["organic-clicks"] = { value: `${number.format(row?.clicks ?? 0)}クリック` }
    const clicks = row?.clicks; const impressions = row?.impressions
    if (clicks !== undefined && impressions !== undefined) {
      const estimate = updateRate(clicks, impressions)
      if (estimate && estimate.observed !== null) values.ctr = {
        value: `${number.format(estimate.observed * 100)}%`,
        detail: `実測 ${number.format(clicks)} / ${number.format(impressions)}、推定中央値 ${number.format(estimate.median * 100)}%、70%信用区間 ${number.format(estimate.low * 100)}〜${number.format(estimate.high * 100)}%`,
      }
      if (impressions > 0) observations.ctr = { successes: clicks, trials: impressions }
    }
  }).catch((error) => { hasApiError = true; errors.push(`Search Console: ${errorMessage(error)}`) }))
  if (searchConsoleProperty) tasks.push(runWithConcurrency(keywords, KEYWORD_REQUEST_CONCURRENCY, async (keyword) => {
    try {
      const report = await googleJson<{ rows?: Array<{ clicks?: number; impressions?: number; ctr?: number; position?: number }> }>(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(searchConsoleProperty)}/searchAnalytics/query`, token.accessToken,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          startDate, endDate, dimensions: ["query"],
          dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: keyword }] }],
        }) },
      )
      const row = report.rows?.[0]
      if (row?.position !== undefined) keywordValues[keyword] = {
        value: `${number.format(row.position)}位`,
        detail: `表示 ${number.format(row.impressions ?? 0)}回、クリック ${number.format(row.clicks ?? 0)}回、CTR ${number.format((row.ctr ?? 0) * 100)}%`,
      }
      else keywordValues[keyword] = { value: "データなし", detail: "対象期間に、このキーワードの検索表示データはありません。" }
    } catch (error) {
      hasApiError = true
      errors.push(`Search Console（${keyword}）: ${errorMessage(error)}`)
    }
  }))

  if (ga4Property) {
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/${ga4Property}:runReport`
    const body = (extra?: object) => ({ dateRanges: [{ startDate, endDate }], ...extra })
    tasks.push(googleJson<{ rows?: Array<{ metricValues?: Array<{ value?: string }> }>; metadata?: { currencyCode?: string } }>(endpoint, token.accessToken, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body({ metrics: ["sessions", "screenPageViews", "screenPageViewsPerSession", "totalAdRevenue"].map((name) => ({ name })) })),
    }).then((report) => {
      const sessions = metricNumber(report, 0); const views = metricNumber(report, 1); const viewsPerSession = metricNumber(report, 2); const adRevenue = metricNumber(report, 3)
      if (sessions !== null) values.sessions = { value: `${number.format(sessions)}セッション` }
      if (views !== null) values.pageviews = { value: `${number.format(views)}PV` }
      if (viewsPerSession !== null) values["pages-per-session"] = { value: `${number.format(viewsPerSession)}PV` }
      if (adRevenue !== null && report.metadata?.currencyCode === "JPY") values["ad-revenue"] = { value: `${number.format(adRevenue)}円` }
      if (views !== null && views > 0 && adRevenue !== null && report.metadata?.currencyCode === "JPY") {
        const rpm = adRevenue / views * 1000
        const weight = views / (views + RPM_PRIOR_PAGEVIEWS)
        values["page-rpm"] = { value: `${number.format(rpm)}円/1,000PV`, detail: `広告収益 ${number.format(adRevenue)}円 / ${number.format(views)}PV` }
        if (Number.isFinite(rpm) && rpm >= 0) numericObservations["page-rpm"] = { value: rpm, weight }
      }
    }).catch((error) => { hasApiError = true; errors.push(`GA4: ${errorMessage(error)}`) }))
    tasks.push(googleJson<{ rows?: Array<{ metricValues?: Array<{ value?: string }> }> }>(endpoint, token.accessToken, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body({
        dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }],
        dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
      })),
    }).then((report) => {
      const organic = metricNumber(report, 0)
      values["organic-sessions"] = { value: `${number.format(organic ?? 0)}セッション` }
    }).catch((error) => { hasApiError = true; errors.push(`GA4（自然検索）: ${errorMessage(error)}`) }))
  }
  await Promise.all(tasks)
  if (uniqueKeywords.length > 20) errors.push("順位を取得できる対象キーワードは先頭20件までです。")
  const result = { values, keywordValues, observations, numericObservations, errors, period: `${startDate}〜${endDate}` }
  writeGoalMetricsCache(cacheKey, result, hasApiError ? PARTIAL_GOAL_METRICS_CACHE_MS : GOAL_METRICS_CACHE_MS)
  return result
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "Google APIからの応答がタイムアウトしました。"
  return error instanceof Error ? error.message : "Google APIから情報を取得できませんでした。"
}

export async function loadGoogleProperties(providerAccountId: string, requestHeaders: Headers): Promise<GoogleProperties> {
  const token = await auth.api.getAccessToken({ body: { providerId: "google", accountId: providerAccountId }, headers: requestHeaders })
  const [searchConsole, analytics] = await Promise.allSettled([
    googleJson<{ siteEntry?: SearchConsoleSite[] }>("https://www.googleapis.com/webmasters/v3/sites", token.accessToken),
    googleJson<{ accountSummaries?: Array<{ account: string; displayName: string; propertySummaries?: Array<{ property: string; displayName: string }> }> }>(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", token.accessToken,
    ),
  ])
  return {
    searchConsoleSites: searchConsole.status === "fulfilled" ? searchConsole.value.siteEntry ?? [] : [],
    analyticsProperties: analytics.status === "fulfilled" ? (analytics.value.accountSummaries ?? []).flatMap((account) => (account.propertySummaries ?? []).map((property) => ({
      property: property.property,
      displayName: property.displayName,
      account: account.account,
      accountName: account.displayName,
    }))) : [],
    searchConsoleError: searchConsole.status === "rejected" ? errorMessage(searchConsole.reason) : null,
    analyticsError: analytics.status === "rejected" ? errorMessage(analytics.reason) : null,
  }
}
