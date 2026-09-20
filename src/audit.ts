import { chromium, type Page } from 'playwright'
import { writeFileSync } from 'node:fs'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const input = process.argv[2]
const maxArg = process.argv.find((arg) => arg.startsWith('--max='))
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const maxPages = Number(maxArg?.slice('--max='.length) ?? 100)
const outputPath = outputArg?.slice('--output='.length) || 'seo-report.md'

if (!input) {
  console.error('使い方: pnpm seo:audit <URL> [--max=100] [--output=seo-report.md]')
  process.exit(1)
}

if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
  console.error('--max は1〜1000の整数で指定してください。')
  process.exit(1)
}

let startUrl: URL
try {
  startUrl = new URL(input.includes('://') ? input : `https://${input}`)
} catch {
  console.error(`URLが正しくありません: ${input}`)
  process.exit(1)
}

if (!['http:', 'https:'].includes(startUrl.protocol)) {
  console.error('http または https のURLを指定してください。')
  process.exit(1)
}

type PageResult = {
  url: string
  finalUrl: string
  status: number | null
  title: string
  description: string
  h1s: string[]
  canonical: string
  robots: string
  lang: string
  textLength: number
  links: string[]
  images: number
  imagesWithoutAlt: number
  error?: string
}

type Finding = {
  severity: '高' | '中' | '低'
  url: string
  issue: string
}

function normalizeUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || ['gclid', 'fbclid'].includes(key)) url.searchParams.delete(key)
    }
    if ([...url.searchParams].length === 0) url.search = ''
    return url.href
  } catch {
    return null
  }
}

function sameSite(value: string): boolean {
  try {
    return new URL(value).origin === startUrl.origin
  } catch {
    return false
  }
}

function isCrawlablePage(value: string): boolean {
  const pathname = new URL(value).pathname.toLowerCase()
  return !/\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mp3|mp4|mov|pdf|png|pptx?|svg|tar|tiff?|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/.test(pathname)
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase()
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (isIP(value) === 6) {
    if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7))
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value)
  }
  return true
}

const publicHostChecks = new Map<string, Promise<void>>()

async function assertPublicUrl(value: string): Promise<void> {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`許可されていないURL: ${value}`)
  if (url.username || url.password) throw new Error('認証情報を含むURLは指定できません。')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('ローカルアドレスは診断できません。')
  let check = publicHostChecks.get(hostname)
  if (!check) {
    check = (async () => {
      const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true })
      if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new Error(`プライベートアドレスへのアクセスはできません: ${hostname}`)
      }
    })()
    publicHostChecks.set(hostname, check)
  }
  await check
}

async function safeFetch(value: string): Promise<Response> {
  let current = value
  for (let redirects = 0; redirects <= 5; redirects++) {
    await assertPublicUrl(current)
    const response = await fetch(current, { signal: AbortSignal.timeout(15_000), redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    current = new URL(location, current).href
  }
  throw new Error('リダイレクト回数が上限を超えました。')
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

async function loadSitemaps(robotsText: string): Promise<Set<string>> {
  const discovered = new Set<string>()
  const visitedSitemaps = new Set<string>()
  const queue = [...robotsText.matchAll(/^sitemap:\s*(\S+)/gim)].map((match) => match[1])
  if (queue.length === 0) queue.push(new URL('/sitemap.xml', startUrl.origin).href)

  while (queue.length > 0 && visitedSitemaps.size < 20) {
    const sitemapUrl = queue.shift()
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue
    visitedSitemaps.add(sitemapUrl)

    try {
      const response = await safeFetch(sitemapUrl)
      if (!response.ok) continue
      const xml = await response.text()
      const locations = [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)]
        .map((match) => decodeXml(match[1].trim()))
      if (/<sitemapindex[\s>]/i.test(xml)) {
        for (const location of locations) queue.push(location)
      } else {
        for (const location of locations) {
          const normalized = normalizeUrl(location)
          if (normalized && sameSite(normalized) && isCrawlablePage(normalized)) discovered.add(normalized)
        }
      }
    } catch {
      // サイトマップが無くても、トップページからのリンク巡回は続行する。
    }
  }

  return discovered
}

async function inspectPage(page: Page, url: string): Promise<PageResult> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 })
    // DOMContentLoaded後に短く待ち、一般的なクライアント描画を取り込む。
    // networkidle待ちは広告や計測通信のあるページで毎回タイムアウトし、巡回を大幅に遅くするため使わない。
    await page.waitForTimeout(500)
    const data = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map((link) => link.href)
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
      return {
        title: document.title.trim(),
        description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content.trim() ?? '',
        h1s: Array.from(document.querySelectorAll('h1')).map((node) => node.textContent?.trim() ?? '').filter(Boolean),
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '',
        robots: document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content.trim() ?? '',
        lang: document.documentElement.lang.trim(),
        textLength: document.body?.innerText.trim().length ?? 0,
        links,
        images: images.length,
        imagesWithoutAlt: images.filter((image) => !image.hasAttribute('alt')).length,
      }
    })
    return {
      url,
      finalUrl: page.url(),
      status: response?.status() ?? null,
      ...data,
    }
  } catch (error) {
    return {
      url,
      finalUrl: page.url(),
      status: null,
      title: '',
      description: '',
      h1s: [],
      canonical: '',
      robots: '',
      lang: '',
      textLength: 0,
      links: [],
      images: 0,
      imagesWithoutAlt: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

console.log(`診断開始: ${startUrl.href}`)
console.log(`最大ページ数: ${maxPages}`)

await assertPublicUrl(startUrl.href)

let robotsText = ''
let robotsStatus: number | null = null
try {
  const robotsResponse = await safeFetch(new URL('/robots.txt', startUrl.origin).href)
  robotsStatus = robotsResponse.status
  if (robotsResponse.ok) robotsText = await robotsResponse.text()
} catch {
  // レポート内で取得不能として扱う。
}

const sitemapUrls = await loadSitemaps(robotsText)
const initialUrl = normalizeUrl(startUrl.href)!
const queue = [...new Set([initialUrl, ...sitemapUrls])]
const queued = new Set(queue)
const results: PageResult[] = []

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route('**/*', async (route) => {
    try {
      const request = route.request()
      const requestUrl = request.url()
      const resourceType = request.resourceType()
      await assertPublicUrl(requestUrl)
      if (['image', 'media', 'font'].includes(resourceType)) {
        await route.abort('blockedbyclient')
        return
      }
      if (resourceType !== 'document' && new URL(requestUrl).origin !== startUrl.origin) {
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    } catch {
      await route.abort('blockedbyclient')
    }
  })
  const page = await context.newPage()
  while (queue.length > 0 && results.length < maxPages) {
    const url = queue.shift()!
    console.log(`[${results.length + 1}/${maxPages}] ${url}`)
    const result = await inspectPage(page, url)
    results.push(result)

    for (const link of result.links) {
      const normalized = normalizeUrl(link, result.finalUrl)
      if (!normalized || !sameSite(normalized) || !isCrawlablePage(normalized) || queued.has(normalized)) continue
      queued.add(normalized)
      queue.push(normalized)
    }
  }
} finally {
  await browser.close()
}

const findings: Finding[] = []
for (const page of results) {
  if (page.error) {
    findings.push({ severity: '高', url: page.url, issue: `ページを取得できない: ${page.error}` })
    continue
  }
  if (page.status !== null && page.status >= 400) findings.push({ severity: '高', url: page.url, issue: `HTTP ${page.status}` })
  if (/\bnoindex\b/i.test(page.robots)) findings.push({ severity: '高', url: page.url, issue: 'meta robots に noindex が指定されている' })
  if (!page.title) findings.push({ severity: '高', url: page.url, issue: 'titleがない' })
  if (page.h1s.length === 0) findings.push({ severity: '中', url: page.url, issue: 'H1がない' })
  if (page.h1s.length > 1) findings.push({ severity: '低', url: page.url, issue: `H1が複数ある（${page.h1s.length}個）` })
  if (!page.description) findings.push({ severity: '中', url: page.url, issue: 'meta descriptionがない' })
  if (!page.canonical) findings.push({ severity: '中', url: page.url, issue: 'canonicalがない' })
  else if (!sameSite(page.canonical)) findings.push({ severity: '高', url: page.url, issue: `canonicalが別ドメインを指している: ${page.canonical}` })
  if (!page.lang) findings.push({ severity: '低', url: page.url, issue: 'html要素にlang属性がない' })
  if (page.textLength < 200) findings.push({ severity: '中', url: page.url, issue: `可視テキストが少ない（${page.textLength}文字）` })
  if (page.imagesWithoutAlt > 0) findings.push({ severity: '低', url: page.url, issue: `alt属性のない画像が${page.imagesWithoutAlt}件ある` })
  if (page.finalUrl !== page.url) findings.push({ severity: '低', url: page.url, issue: `別URLへ移動する: ${page.finalUrl}` })
}

for (const field of ['title', 'description'] as const) {
  const groups = new Map<string, string[]>()
  for (const page of results) {
    const value = page[field]
    if (!value) continue
    groups.set(value, [...(groups.get(value) ?? []), page.url])
  }
  for (const [value, urls] of groups) {
    if (urls.length < 2) continue
    for (const url of urls) {
      findings.push({ severity: '中', url, issue: `${field}が${urls.length}ページで重複: ${value}` })
    }
  }
}

const audited = new Set(results.map((page) => page.url))
const missingFromCrawl = [...sitemapUrls].filter((url) => !audited.has(url) && results.length < maxPages)
for (const url of missingFromCrawl) findings.push({ severity: '中', url, issue: 'サイトマップにあるが巡回できなかった' })

const severityOrder = { 高: 0, 中: 1, 低: 2 }
findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.url.localeCompare(b.url))

const counts = {
  high: findings.filter((item) => item.severity === '高').length,
  medium: findings.filter((item) => item.severity === '中').length,
  low: findings.filter((item) => item.severity === '低').length,
}
const generatedAt = new Date().toISOString()
const report = `# SEO診断レポート

- 対象: ${startUrl.href}
- 実行日時: ${generatedAt}
- 診断ページ数: ${results.length}
- 発見URL数: ${queued.size}
- サイトマップ掲載URL数: ${sitemapUrls.size}
- robots.txt: ${robotsStatus ?? '取得不能'}
- 問題: 高 ${counts.high}件 / 中 ${counts.medium}件 / 低 ${counts.low}件

## 診断結果

${findings.length === 0 ? '問題は見つかりませんでした。' : `| 優先度 | URL | 問題 |\n|---|---|---|\n${findings.map((item) => `| ${item.severity} | ${escapeCell(item.url)} | ${escapeCell(item.issue)} |`).join('\n')}`}

## ページ一覧

| Status | URL | Title | H1 | 本文文字数 |
|---:|---|---|---:|---:|
${results.map((page) => `| ${page.status ?? '-'} | ${escapeCell(page.url)} | ${escapeCell(page.title || '-')} | ${page.h1s.length} | ${page.textLength} |`).join('\n')}

## 判定について

このレポートは機械的に確認できる技術項目を診断したものです。検索順位の保証や、コンテンツ品質の最終判断を行うものではありません。
`

writeFileSync(outputPath, report, 'utf8')
console.log(`診断完了: ${outputPath}`)
console.log(`問題: 高 ${counts.high}件 / 中 ${counts.medium}件 / 低 ${counts.low}件`)
