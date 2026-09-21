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
      keywordValues: {}, observations: {}, goalValues: {}, goalObservations: {}, numericObservations: {}, errors: [], period: "test",
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

  it("builds goal-specific CTA and conversion observations from GA4", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        metrics?: Array<{ name?: string }>
        dimensionFilter?: { filter?: { fieldName?: string }; andGroup?: { expressions?: Array<{ filter?: { fieldName?: string } }> } }
      }
      const metric = body.metrics?.[0]?.name
      const fields = body.dimensionFilter?.andGroup?.expressions?.map((expression) => expression.filter?.fieldName) ?? []
      if (fields.includes("pagePath")) return jsonResponse({ rows: [{ metricValues: [{ value: "100" }] }] })
      if (fields.includes("eventName")) return jsonResponse({ rows: [{ metricValues: [{ value: "4" }] }] })
      if (fields.includes("sessionDefaultChannelGroup") || body.dimensionFilter?.filter?.fieldName === "sessionDefaultChannelGroup") {
        return jsonResponse({ rows: [{ metricValues: [{ value: "1000" }] }] })
      }
      return jsonResponse({})
    })

    const result = await loadGoogleGoalMetrics("goal-funnel-account", new Headers(), null, "properties/123", [], [{
      goalId: "goal-1",
      metric: "conversions",
      ctaPaths: ["/", "/contact"],
      conversionEvents: ["generate_lead"],
    }])

    expect(result.goalObservations["goal-1"]).toEqual({
      "cta-rate": { successes: 100, trials: 1000 },
      "cta-cvr": { successes: 4, trials: 100 },
    })
    expect(result.goalValues["goal-1"]?.["goal-total"]?.value).toBe("4件")
    expect(result.goalValues["goal-1"]?.["cta-sessions"]?.value).toBe("100セッション")
    expect(result.goalValues["goal-1"]?.["conversion-sessions"]?.value).toBe("4セッション")
  })

  it("uses a 180-day event-count ratio for the paid-contract proxy", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dateRanges?: Array<{ startDate: string; endDate: string }>
        metrics?: Array<{ name?: string }>
        dimensionFilter?: { filter?: { fieldName?: string; inListFilter?: { values?: string[] } }; andGroup?: { expressions?: Array<{ filter?: { fieldName?: string; inListFilter?: { values?: string[] } } }> } }
      }
      const metric = body.metrics?.[0]?.name
      const expressions = body.dimensionFilter?.andGroup?.expressions ?? []
      const pageFilter = expressions.find((expression) => expression.filter?.fieldName === "pagePath")
      const eventNames = expressions.find((expression) => expression.filter?.fieldName === "eventName")?.filter?.inListFilter?.values
        ?? (body.dimensionFilter?.filter?.fieldName === "eventName" ? body.dimensionFilter.filter.inListFilter?.values : undefined)
        ?? []
      const range = body.dateRanges?.[0]
      const days = range ? (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 + 1 : 0
      if (pageFilter) return jsonResponse({ rows: [{ metricValues: [{ value: "50" }] }] })
      if (eventNames.includes("sign_up")) return jsonResponse({ rows: [{ metricValues: [{ value: days === 180 ? "20" : "3" }] }] })
      if (eventNames.includes("purchase")) return jsonResponse({ rows: [{ metricValues: [{ value: days === 180 ? "4" : "2" }] }] })
      if (body.dimensionFilter?.filter?.fieldName === "sessionDefaultChannelGroup") return jsonResponse({ rows: [{ metricValues: [{ value: "500" }] }] })
      if (metric) return jsonResponse({})
      return jsonResponse({})
    })

    const result = await loadGoogleGoalMetrics("paid-funnel-account", new Headers(), null, "properties/123", [], [{
      goalId: "paid-goal",
      metric: "paidContracts",
      ctaPaths: ["/pricing"],
      freeRegistrationEvents: ["sign_up"],
      paidContractEvents: ["purchase"],
    }])

    expect(result.goalObservations["paid-goal"]).toEqual({
      "cta-rate": { successes: 50, trials: 500 },
      "free-cvr": { successes: 3, trials: 50 },
      "paid-rate": { successes: 4, trials: 20 },
    })
    expect(result.goalValues["paid-goal"]?.["goal-total"]?.value).toBe("2件")
    expect(result.goalValues["paid-goal"]?.["cta-sessions"]?.value).toBe("50セッション")
    expect(result.goalValues["paid-goal"]?.["free-conversion-sessions"]?.value).toBe("3セッション")
    expect(result.goalValues["paid-goal"]?.["paid-conversion-sessions"]?.value).toBe("2セッション")
  })

  it("shares identical goal reports and limits goal-specific measurement", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({}))
    const configs = Array.from({ length: 11 }, (_, index) => ({
      goalId: `goal-${index}`,
      metric: "conversions" as const,
      ctaPaths: ["/contact"],
      conversionEvents: ["generate_lead"],
    }))

    const result = await loadGoogleGoalMetrics("limited-goals-account", new Headers(), null, "properties/123", [], configs)

    expect(result.errors).toContain("GA4の目標別計測は先頭10件まで取得します。")
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("reports a shared goal-request failure only once", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        dimensionFilter?: { filter?: { fieldName?: string }; andGroup?: { expressions?: Array<{ filter?: { fieldName?: string } }> } }
      }
      const fields = body.dimensionFilter?.andGroup?.expressions?.map((expression) => expression.filter?.fieldName)
        ?? [body.dimensionFilter?.filter?.fieldName]
      return fields.some((field) => field === "pagePath" || field === "eventName") ? jsonResponse({}, 500) : jsonResponse({})
    })

    const result = await loadGoogleGoalMetrics("shared-error-account", new Headers(), null, "properties/123", [], [
      { goalId: "goal-1", metric: "conversions", ctaPaths: ["/contact"], conversionEvents: ["generate_lead"] },
      { goalId: "goal-2", metric: "conversions", ctaPaths: ["/contact"], conversionEvents: ["generate_lead"] },
    ])

    expect(result.errors).toEqual(["GA4（目標計測）: Google APIから情報を取得できませんでした（500）。"])
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
