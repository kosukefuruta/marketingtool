import { describe, expect, it } from "vitest"
import { keywordRegexChunks, performanceStartDate, summarizeKeywordPerformance, type SearchKeywordRow } from "./keyword-performance"

const row = (query: string, page: string, date: string, impressions: number, position: number, clicks = 0): SearchKeywordRow => ({ query, page, date, impressions, position, clicks })

describe("keywordRegexChunks", () => {
  it("完全一致の正規表現にまとめ、記号はエスケープし、空白は全角も許す", () => {
    expect(keywordRegexChunks(["youtube 収益化", "c++ 入門"])).toEqual(["^(?:youtube[\\s　]+収益化|c\\+\\+[\\s　]+入門)$"])
  })

  it("長くなったら分ける", () => {
    const keywords = Array.from({ length: 400 }, (_, index) => `keyword number ${index}`)
    const chunks = keywordRegexChunks(keywords)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 3_500)).toBe(true)
  })
})

describe("summarizeKeywordPerformance", () => {
  const assignments = [
    { normalizedKeyword: "youtube 収益化 昔", pagePath: "/guides/history/", publishedAt: new Date("2026-10-01T00:00:00Z") },
    { normalizedKeyword: "youtube スパチャ", pagePath: null, publishedAt: null },
  ]

  it("割り当てた記事の行をテスト期間とそれ以降に分け、順位を表示回数で重み付けする", () => {
    const result = summarizeKeywordPerformance([
      row("youtube 収益化 昔", "https://example.com/guides/history/", "2026-10-03", 10, 3, 1),
      row("youtube 収益化 昔", "https://example.com/guides/history/", "2026-10-14", 10, 5),
      row("youtube 収益化 昔", "https://example.com/guides/history/", "2026-10-15", 30, 10, 2),
      row("YouTube 収益化 昔", "https://example.com/guides/history/", "2026-10-16", 10, 20),
    ], assignments, 14)
    const value = result.get("youtube 収益化 昔")!
    expect(value.testPeriod).toEqual({ impressions: 20, clicks: 1, position: 4 })
    expect(value.afterTestPeriod).toEqual({ impressions: 40, clicks: 2, position: 12.5 })
    expect(value.otherPages).toEqual([])
  })

  it("割り当てていないページは別に集計する", () => {
    const result = summarizeKeywordPerformance([
      row("youtube 収益化 昔", "https://example.com/guides/pillar/", "2026-10-15", 5, 30),
      row("youtube 収益化 昔", "https://example.com/guides/hard/", "2026-10-15", 8, 12),
      row("youtube スパチャ", "https://example.com/guides/live/", "2026-10-15", 3, 9),
      row("関係ない語", "https://example.com/guides/live/", "2026-10-15", 100, 1),
    ], assignments, 14)
    expect(result.get("youtube 収益化 昔")!.otherPages.map((page) => page.path)).toEqual(["/guides/hard/", "/guides/pillar/"])
    expect(result.get("youtube 収益化 昔")!.afterTestPeriod).toBeNull()
    expect(result.get("youtube スパチャ")!.otherPages).toEqual([{ path: "/guides/live/", impressions: 3, clicks: 0, position: 9 }])
  })
})

describe("performanceStartDate", () => {
  const end = new Date("2026-10-16T00:00:00Z")
  it("いちばん古い公開日から取る", () => {
    expect(performanceStartDate([{ normalizedKeyword: "a", pagePath: "/a/", publishedAt: new Date("2026-09-13T00:00:00Z") }], end, 180).toISOString().slice(0, 10)).toBe("2026-09-13")
  })
  it("上限より古ければ上限で切る", () => {
    expect(performanceStartDate([{ normalizedKeyword: "a", pagePath: "/a/", publishedAt: new Date("2025-01-01T00:00:00Z") }], end, 30).toISOString().slice(0, 10)).toBe("2026-09-16")
  })
})
