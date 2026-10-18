export type PageDates = {
  publishedAt: Date | null
  modifiedAt: Date | null
  title: string | null
}

const ARTICLE_TYPES = new Set(["article", "newsarticle", "blogposting", "techarticle", "report", "webpage", "faqpage", "howto"])
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const MAX_HTML_BYTES = 2_000_000

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null
  const date = new Date(value.trim())
  return Number.isNaN(date.getTime()) ? null : date
}

function decodeEntities(value: string): string {
  return value.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

type Candidate = { publishedAt: Date | null; modifiedAt: Date | null; preferred: boolean }

function collectJsonLd(node: unknown, out: Candidate[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLd(item, out)
    return
  }
  if (!node || typeof node !== "object") return
  const record = node as Record<string, unknown>
  const publishedAt = toDate(record.datePublished)
  const modifiedAt = toDate(record.dateModified)
  if (publishedAt || modifiedAt) {
    const types = (Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]])
      .filter((type): type is string => typeof type === "string").map((type) => type.toLowerCase())
    out.push({ publishedAt, modifiedAt, preferred: types.some((type) => ARTICLE_TYPES.has(type)) })
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "@graph" || (value && typeof value === "object")) collectJsonLd(value, out)
  }
}

function metaContent(html: string, names: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (!key || !names.includes(key)) continue
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]
    if (content) return decodeEntities(content)
  }
  return null
}

// 構造化データ（JSON-LD）を優先し、無ければ article:*_time などの meta から読む。
export function extractPageDates(html: string): PageDates {
  const candidates: Candidate[] = []
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectJsonLd(JSON.parse(match[1].trim()), candidates)
    } catch {
      // 壊れた JSON-LD は読み飛ばす
    }
  }
  const best = candidates.find((item) => item.preferred) ?? candidates[0]
  const publishedAt = best?.publishedAt ?? toDate(metaContent(html, ["article:published_time", "datepublished", "og:published_time"]))
  const modifiedAt = best?.modifiedAt ?? toDate(metaContent(html, ["article:modified_time", "datemodified", "og:updated_time"]))
  return { publishedAt, modifiedAt, title: extractTitle(html) }
}

const TITLE_LENGTH_LIMIT = 300

// 記事のタイトル。<title> を優先し、無ければ og:title を読む。
export function extractTitle(html: string): string | null {
  const raw = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? metaContent(html, ["og:title"])
  const title = raw ? decodeEntities(raw).replace(/\s+/g, " ").trim() : ""
  return title ? title.slice(0, TITLE_LENGTH_LIMIT) : null
}

export class PageDatesError extends Error {}

// 登録サイトと同じ origin のページだけを取りに行く。リダイレクトも同じ origin の範囲でだけ追う。
export async function fetchPageDates(pageUrl: string, siteOrigin: string, fetchImpl: typeof fetch = fetch): Promise<PageDates> {
  const origin = new URL(siteOrigin).origin
  let url = new URL(pageUrl)
  if (url.origin !== origin) throw new PageDatesError("登録サイトと違うサイトのURLです。")
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; OwtellBot/1.0; +https://tool.owtell.com)", accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location || redirects >= MAX_REDIRECTS) throw new PageDatesError(`リダイレクトを追えませんでした（HTTP ${response.status}）。`)
      url = new URL(location, url)
      if (url.origin !== origin) throw new PageDatesError("登録サイトの外へリダイレクトされました。")
      continue
    }
    if (!response.ok) throw new PageDatesError(`ページを取得できませんでした（HTTP ${response.status}）。`)
    const html = (await response.text()).slice(0, MAX_HTML_BYTES)
    return extractPageDates(html)
  }
}
