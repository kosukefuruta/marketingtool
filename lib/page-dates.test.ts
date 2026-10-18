import { describe, expect, it, vi } from "vitest"
import { extractPageDates, fetchPageDates, PageDatesError } from "./page-dates"

describe("extractPageDates", () => {
  it("JSON-LD の Article から公開日と更新日を読む", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","datePublished":"2026-10-15T00:00:00.000Z","dateModified":"2026-10-18T00:00:00.000Z"}</script>`
    const dates = extractPageDates(html)
    expect(dates.publishedAt?.toISOString()).toBe("2026-10-15T00:00:00.000Z")
    expect(dates.modifiedAt?.toISOString()).toBe("2026-10-18T00:00:00.000Z")
  })

  it("@graph の中の記事を、ほかの型より優先する", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","datePublished":"2020-01-01"},{"@type":["NewsArticle"],"datePublished":"2026-09-13","dateModified":"2026-10-01"}]}</script>`
    const dates = extractPageDates(html)
    expect(dates.publishedAt?.toISOString().slice(0, 10)).toBe("2026-09-13")
    expect(dates.modifiedAt?.toISOString().slice(0, 10)).toBe("2026-10-01")
  })

  it("JSON-LD が無ければ article:*_time の meta を読む", () => {
    const html = `<meta property="article:published_time" content="2026-08-04T00:00:00+09:00"><meta content="2026-10-18T00:00:00+09:00" property="article:modified_time">`
    const dates = extractPageDates(html)
    expect(dates.publishedAt?.toISOString()).toBe("2026-08-03T15:00:00.000Z")
    expect(dates.modifiedAt?.toISOString()).toBe("2026-10-17T15:00:00.000Z")
  })

  it("壊れた JSON-LD は読み飛ばし、日付が無ければ null を返す", () => {
    expect(extractPageDates(`<script type="application/ld+json">{oops</script>`)).toEqual({ publishedAt: null, modifiedAt: null })
  })
})

describe("fetchPageDates", () => {
  const html = `<meta property="article:published_time" content="2026-10-15">`

  it("同じサイト内のリダイレクトは追う", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/guides/a/" } }))
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
    const dates = await fetchPageDates("https://example.com/guides/a", "https://example.com", fetchMock as unknown as typeof fetch)
    expect(dates.publishedAt?.toISOString().slice(0, 10)).toBe("2026-10-15")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("サイトの外へのリダイレクトは追わない", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }))
    await expect(fetchPageDates("https://example.com/a/", "https://example.com", fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(PageDatesError)
  })

  it("別サイトのURLは取りに行かない", async () => {
    const fetchMock = vi.fn()
    await expect(fetchPageDates("https://other.example/a/", "https://example.com", fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(PageDatesError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
