export const SITE_KEYWORD_LIMIT = 2_000
export const KEYWORD_INPUT_LINE_LIMIT = 1_000
const KEYWORD_LENGTH_LIMIT = 200
const PAGE_URL_LENGTH_LIMIT = 2_048
const KEYWORD_INPUT_LIMIT = KEYWORD_INPUT_LINE_LIMIT * (KEYWORD_LENGTH_LIMIT + PAGE_URL_LENGTH_LIMIT + 2)

// 公開直後は一時的に上位へ出ることがあるため、この日数を過ぎるまでは効果測定に使わない。
export const TEST_PERIOD_DAYS = 14

export type KeywordAssignmentInput = {
  keyword: string
  normalizedKeyword: string
  pagePath: string | null
}

// Search Console のクエリと突き合わせられるよう、全角・半角と大文字小文字、空白の揺れをそろえる。
export function normalizeKeyword(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()
}

export function parsePagePath(value: string, siteOrigin: string): { path: string } | { error: string } {
  if (value.length > PAGE_URL_LENGTH_LIMIT) return { error: "記事のURLは2,048文字以内で入力してください。" }
  let origin: URL
  try {
    origin = new URL(siteOrigin)
  } catch {
    return { error: "登録サイトのURLが正しくありません。" }
  }
  let url: URL
  try {
    url = new URL(value, origin)
  } catch {
    return { error: `正しい記事のURLを入力してください: ${value}` }
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== origin.origin) {
    return { error: `記事には登録サイトと同じサイトのURLを入力してください: ${value}` }
  }
  return { path: url.pathname || "/" }
}

function splitLine(line: string): { keyword: string; url: string | null } {
  if (line.includes("\t")) {
    const [keyword, url] = line.split("\t")
    return { keyword: keyword.trim(), url: url?.trim() || null }
  }
  const match = line.match(/^(.*?)[\s,]+((?:https?:\/\/|\/)\S*)$/)
  if (match) return { keyword: match[1].replace(/,$/, "").trim(), url: match[2] }
  return { keyword: line.trim(), url: null }
}

// 1行に1キーワード。記事のURLは、タブ区切りか行末に書く（省略可）。
export function parseKeywordAssignments(input: string, siteOrigin: string): { items: KeywordAssignmentInput[]; error?: string } {
  if (input.length > KEYWORD_INPUT_LIMIT) return { items: [], error: "入力が長すぎます。" }
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length > KEYWORD_INPUT_LINE_LIMIT) return { items: [], error: `一度に登録できるのは${KEYWORD_INPUT_LINE_LIMIT}行までです。` }

  const byKeyword = new Map<string, KeywordAssignmentInput>()
  for (const line of lines) {
    const { keyword, url } = splitLine(line)
    if (!keyword) continue
    if (keyword.length > KEYWORD_LENGTH_LIMIT) return { items: [], error: `キーワードは${KEYWORD_LENGTH_LIMIT}文字以内で入力してください: ${keyword.slice(0, 40)}…` }
    let pagePath: string | null = null
    if (url) {
      const parsed = parsePagePath(url, siteOrigin)
      if ("error" in parsed) return { items: [], error: parsed.error }
      pagePath = parsed.path
    }
    const normalizedKeyword = normalizeKeyword(keyword)
    const existing = byKeyword.get(normalizedKeyword)
    // 同じキーワードが2回出たら、URLのあるほうを残す。
    if (!existing || (!existing.pagePath && pagePath)) byKeyword.set(normalizedKeyword, { keyword: keyword.replace(/\s+/g, " "), normalizedKeyword, pagePath })
  }
  return { items: [...byKeyword.values()] }
}

export type MeasurementStatus =
  | { state: "unassigned" }
  | { state: "unknownDate" }
  | { state: "testPeriod"; measurableFrom: Date; daysSincePublished: number }
  | { state: "measurable"; measurableFrom: Date; daysSincePublished: number }

const DAY_MS = 24 * 60 * 60 * 1000

export function measurementStatus(pagePath: string | null, publishedAt: Date | null, now: Date): MeasurementStatus {
  if (!pagePath) return { state: "unassigned" }
  if (!publishedAt) return { state: "unknownDate" }
  const measurableFrom = new Date(publishedAt.getTime() + TEST_PERIOD_DAYS * DAY_MS)
  const daysSincePublished = Math.max(0, Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS))
  return now < measurableFrom
    ? { state: "testPeriod", measurableFrom, daysSincePublished }
    : { state: "measurable", measurableFrom, daysSincePublished }
}
