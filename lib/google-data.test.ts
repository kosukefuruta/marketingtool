import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./auth", () => ({
  auth: { api: { getAccessToken: vi.fn(async () => ({ accessToken: "test-token" })) } },
}))

import { googleValueForGoal, loadGoogleGoalMetrics, loadGoogleKeyEvents, type GoogleGoalMetrics } from "./google-data"
import { searchConsoleSiteMatches } from "./google-property-match"

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("Google goal metrics", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("distinguishes a successful empty Search Console result from an acquisition failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({}))
    const result = await loadGoogleGoalMetrics("empty-account", new Headers(), "sc-domain:example.com", null, ["keyword"])

    expect(result.values.impressions).toEqual({ value: "0回" })
    expect(result.values["organic-clicks"]).toEqual({ value: "0クリック" })
    expect(result.keywordValues.keyword).toEqual({
      value: "データなし",
      detail: "対象期間に、このキーワードの検索表示データはありません。",
    })
    expect(result.errors).toEqual([])

    await loadGoogleGoalMetrics("empty-account", new Headers(), "sc-domain:example.com", null, ["keyword"])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps successful keyword data when the aggregate request fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ rows: [{ position: 4.2, impressions: 100, clicks: 10, ctr: 0.1 }] }))

    const result = await loadGoogleGoalMetrics("partial-account", new Headers(), "sc-domain:example.com", null, ["keyword"])
    expect(result.keywordValues.keyword?.value).toBe("4.2位")
    expect(result.errors).toHaveLength(1)
  })

  it("does not share a cache entry between complete and truncated keyword requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({}))
    const keywords = Array.from({ length: 21 }, (_, index) => `keyword-${index}`)

    const complete = await loadGoogleGoalMetrics("keyword-limit-account", new Headers(), "sc-domain:example.com", null, keywords.slice(0, 20))
    const truncated = await loadGoogleGoalMetrics("keyword-limit-account", new Headers(), "sc-domain:example.com", null, keywords)

    expect(complete.errors).toEqual([])
    expect(truncated.errors).toContain("順位を取得できる対象キーワードは先頭20件までです。")
    expect(fetchMock).toHaveBeenCalledTimes(42)
  })

  it("maps directly measurable goal metrics to their current values", () => {
    const metrics: GoogleGoalMetrics = {
      values: { "organic-sessions": { value: "123セッション" }, "ad-revenue": { value: "456円" } },
      keywordValues: {}, observations: {}, numericObservations: {}, errors: [], period: "test",
    }
    expect(googleValueForGoal("organicSessions", metrics)?.value).toBe("123セッション")
    expect(googleValueForGoal("adRevenue", metrics)?.value).toBe("456円")
    expect(googleValueForGoal("conversions", metrics)).toBeNull()
  })

  it("treats a successful empty organic GA4 report as zero sessions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({}))
    const result = await loadGoogleGoalMetrics("empty-ga-account", new Headers(), null, "properties/123")
    expect(result.values["organic-sessions"]).toEqual({ value: "0セッション" })
    expect(result.errors).toEqual([])
  })

  it("loads and sorts GA4 key events", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ keyEvents: [
      { name: "properties/123/keyEvents/2", eventName: "sign_up" },
      { name: "properties/123/keyEvents/1", eventName: "generate_lead" },
    ] }))
    const result = await loadGoogleKeyEvents("key-event-account", new Headers(), "properties/123")
    expect(result.map((item) => item.eventName)).toEqual(["generate_lead", "sign_up"])
    expect(fetchMock).toHaveBeenCalledWith(
      "https://analyticsadmin.googleapis.com/v1beta/properties/123/keyEvents?pageSize=200",
      expect.objectContaining({ cache: "no-store" }),
    )
    await loadGoogleKeyEvents("key-event-account", new Headers(), "properties/123")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await loadGoogleKeyEvents("key-event-account", new Headers(), "properties/123", { fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("Search Console property matching", () => {
  it("matches URL-prefix and domain properties", () => {
    expect(searchConsoleSiteMatches("https://example.com/", "https://example.com")).toBe(true)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://example.com")).toBe(true)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://www.example.com")).toBe(true)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://news.jp.example.com")).toBe(true)
  })

  it("does not match another domain", () => {
    expect(searchConsoleSiteMatches("sc-domain:other.example", "https://example.com")).toBe(false)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://notexample.com")).toBe(false)
  })
})
