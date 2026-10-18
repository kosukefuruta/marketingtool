import type { SearchKeywordRow } from "./google-data"
import { normalizeKeyword } from "./site-keywords"

export type { SearchKeywordRow }

export type WindowMetrics = { impressions: number; clicks: number; position: number | null }

export type OtherPageMetrics = { path: string; impressions: number; clicks: number; position: number | null }

export type KeywordPerformance = {
  testPeriod: WindowMetrics | null
  afterTestPeriod: WindowMetrics | null
  otherPages: OtherPageMetrics[]
}

export type KeywordAssignment = { normalizedKeyword: string; pagePath: string | null; publishedAt: Date | null }

// Search Console の正規表現フィルタは長さに上限があるので、まとめるキーワードを分ける。
const REGEX_CHUNK_LIMIT = 3_500

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// 日本語の検索語は空白の入れ方がばらつく（「収益化しない」「収益化 しない」）。照合は空白を取り除いた形どうしで行う。
export function keywordMatchKey(value: string): string {
  return normalizeKeyword(value).replace(/ /g, "")
}

// 文字と文字のあいだに空白（半角・全角）があってもなくても一致させる。
export function keywordRegexChunks(normalizedKeywords: string[]): string[] {
  const patterns = [...new Set(normalizedKeywords.map(keywordMatchKey))].filter(Boolean).map((key) => [...key].map(escapeRegex).join("[\\s　]*"))
  const chunks: string[] = []
  let current: string[] = []
  const wrap = (items: string[]) => `^(?:${items.join("|")})$`
  for (const pattern of patterns) {
    if (current.length > 0 && wrap([...current, pattern]).length > REGEX_CHUNK_LIMIT) {
      chunks.push(wrap(current))
      current = []
    }
    current.push(pattern)
  }
  if (current.length > 0) chunks.push(wrap(current))
  return chunks
}

type Accumulator = { impressions: number; clicks: number; weightedPosition: number }

function add(target: Accumulator, row: SearchKeywordRow): void {
  target.impressions += row.impressions
  target.clicks += row.clicks
  target.weightedPosition += row.position * row.impressions
}

function toMetrics(value: Accumulator | undefined): WindowMetrics | null {
  if (!value || value.impressions === 0) return null
  return { impressions: value.impressions, clicks: value.clicks, position: value.weightedPosition / value.impressions }
}

function pathOf(page: string): string {
  try {
    return new URL(page).pathname || "/"
  } catch {
    return page
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

// 割り当てた記事の行は、公開日からテスト期間内とそれ以降に分ける。平均順位は表示回数で重み付けする。
export function summarizeKeywordPerformance(rows: SearchKeywordRow[], assignments: KeywordAssignment[], testPeriodDays: number): Map<string, KeywordPerformance> {
  const byKeyword = new Map<string, KeywordAssignment>()
  for (const assignment of assignments) byKeyword.set(keywordMatchKey(assignment.normalizedKeyword), assignment)

  const test = new Map<string, Accumulator>()
  const after = new Map<string, Accumulator>()
  const others = new Map<string, Map<string, Accumulator>>()
  for (const row of rows) {
    const keyword = keywordMatchKey(row.query)
    const assignment = byKeyword.get(keyword)
    if (!assignment) continue
    const path = pathOf(row.page)
    if (assignment.pagePath && path === assignment.pagePath) {
      const boundary = assignment.publishedAt ? assignment.publishedAt.getTime() + testPeriodDays * DAY_MS : null
      const rowTime = Date.parse(`${row.date}T00:00:00Z`)
      const target = boundary !== null && rowTime < boundary ? test : after
      const value = target.get(keyword) ?? { impressions: 0, clicks: 0, weightedPosition: 0 }
      add(value, row)
      target.set(keyword, value)
      continue
    }
    const pages = others.get(keyword) ?? new Map<string, Accumulator>()
    const value = pages.get(path) ?? { impressions: 0, clicks: 0, weightedPosition: 0 }
    add(value, row)
    pages.set(path, value)
    others.set(keyword, pages)
  }

  const result = new Map<string, KeywordPerformance>()
  for (const assignment of assignments) {
    const keyword = keywordMatchKey(assignment.normalizedKeyword)
    const otherPages = [...(others.get(keyword) ?? new Map<string, Accumulator>()).entries()]
      .map(([path, value]) => ({ path, impressions: value.impressions, clicks: value.clicks, position: value.impressions ? value.weightedPosition / value.impressions : null }))
      .sort((a, b) => b.impressions - a.impressions)
    result.set(assignment.normalizedKeyword, { testPeriod: toMetrics(test.get(keyword)), afterTestPeriod: toMetrics(after.get(keyword)), otherPages })
  }
  return result
}

// 取得期間の開始日。いちばん古い公開日から（上限 maxDays 日前まで）。
export function performanceStartDate(assignments: KeywordAssignment[], endDate: Date, maxDays: number): Date {
  const earliestAllowed = new Date(endDate.getTime() - maxDays * DAY_MS)
  const published = assignments.flatMap((item) => item.publishedAt ? [item.publishedAt.getTime()] : [])
  const earliest = published.length > 0 ? new Date(Math.min(...published)) : earliestAllowed
  return earliest < earliestAllowed ? earliestAllowed : earliest
}
