import { describe, expect, it } from "vitest"
import { measurementStatus, normalizeKeyword, parseKeywordAssignments, TEST_PERIOD_DAYS } from "./site-keywords"

const origin = "https://example.com"

describe("normalizeKeyword", () => {
  it("全角・大文字・空白の揺れをそろえる", () => {
    expect(normalizeKeyword("  YouTube　収益化   条件 ")).toBe("youtube 収益化 条件")
  })
})

describe("parseKeywordAssignments", () => {
  it("タブ区切りと行末のURLの両方を読む", () => {
    const result = parseKeywordAssignments([
      "youtube 収益化 条件\thttps://example.com/guides/a/",
      "youtube 収益化 昔 https://example.com/guides/b/",
      "youtube 収益化 審査, /guides/c/",
      "youtube スパチャ",
    ].join("\n"), origin)
    expect(result.error).toBeUndefined()
    expect(result.items).toEqual([
      { keyword: "youtube 収益化 条件", normalizedKeyword: "youtube 収益化 条件", pagePath: "/guides/a/" },
      { keyword: "youtube 収益化 昔", normalizedKeyword: "youtube 収益化 昔", pagePath: "/guides/b/" },
      { keyword: "youtube 収益化 審査", normalizedKeyword: "youtube 収益化 審査", pagePath: "/guides/c/" },
      { keyword: "youtube スパチャ", normalizedKeyword: "youtube スパチャ", pagePath: null },
    ])
  })

  it("同じキーワードはURLのあるほうを残す", () => {
    const result = parseKeywordAssignments("youtube 収益化\nYouTube　収益化\t/guides/a/", origin)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].pagePath).toBe("/guides/a/")
  })

  it("別サイトのURLは受け付けない", () => {
    const result = parseKeywordAssignments("youtube 収益化\thttps://other.example/guides/a/", origin)
    expect(result.items).toEqual([])
    expect(result.error).toContain("同じサイト")
  })

  it("空行は読み飛ばす", () => {
    expect(parseKeywordAssignments("\n\n  \n", origin).items).toEqual([])
  })
})

describe("measurementStatus", () => {
  const now = new Date("2026-10-18T00:00:00Z")

  it("記事が無ければ未割り当て", () => {
    expect(measurementStatus(null, null, now)).toEqual({ state: "unassigned" })
  })

  it("公開日が分からなければ日付不明", () => {
    expect(measurementStatus("/a/", null, now)).toEqual({ state: "unknownDate" })
  })

  it(`公開から${TEST_PERIOD_DAYS}日まではテスト期間`, () => {
    const status = measurementStatus("/a/", new Date("2026-10-10T00:00:00Z"), now)
    expect(status).toMatchObject({ state: "testPeriod", daysSincePublished: 8 })
    if (status.state === "testPeriod") expect(status.measurableFrom.toISOString()).toBe("2026-10-24T00:00:00.000Z")
  })

  it(`公開から${TEST_PERIOD_DAYS}日を過ぎたら測定できる`, () => {
    expect(measurementStatus("/a/", new Date("2026-09-20T00:00:00Z"), now)).toMatchObject({ state: "measurable", daysSincePublished: 28 })
  })
})
