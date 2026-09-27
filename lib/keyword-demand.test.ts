import { describe, expect, it } from "vitest"
import { DEMAND_QUERY_LIMIT, mergeVolumes, topQueriesByImpressions } from "./keyword-demand"
import type { SearchQueryMetric } from "./google-data"

function query(overrides: Partial<SearchQueryMetric> & { query: string }): SearchQueryMetric {
  return { impressions: 100, clicks: 2, ctr: 2, position: 12, ...overrides }
}

describe("keyword demand", () => {
  it("keeps the most visible queries within the request limit", () => {
    const queries = Array.from({ length: DEMAND_QUERY_LIMIT + 5 }, (_, index) => query({ query: `q-${index}`, impressions: index }))
    const top = topQueriesByImpressions(queries)
    expect(top).toHaveLength(DEMAND_QUERY_LIMIT)
    expect(top[0].query).toBe(`q-${DEMAND_QUERY_LIMIT + 4}`)
  })

  it("compares a 28-day actual against a monthly volume on the same basis", () => {
    const [row] = mergeVolumes(
      [query({ query: "seo ツール", impressions: 2800 })],
      [{ keyword: "seo ツール", volume: 9000, competition: 10 }],
    )
    expect(row.volume).toBe(9000)
    // 2,800回/28日 = 3,000回/30日 に換算してから比べる
    expect(row.impressionRate).toBeCloseTo(33.33, 1)
  })

  it("matches a keyword the API returned in a different case", () => {
    const [row] = mergeVolumes(
      [query({ query: "SEO ツール" })],
      [{ keyword: "seo ツール", volume: 9000, competition: null }],
    )
    expect(row.volume).toBe(9000)
  })

  it("leaves the share unknown when the volume is missing or zero", () => {
    const rows = mergeVolumes(
      [query({ query: "a" }), query({ query: "b" })],
      [{ keyword: "a", volume: null, competition: null }, { keyword: "b", volume: 0, competition: null }],
    )
    expect(rows.every((row) => row.impressionRate === null)).toBe(true)
  })

  it("puts the largest demand first and keeps unknown volumes last", () => {
    const rows = mergeVolumes(
      [query({ query: "small" }), query({ query: "unknown" }), query({ query: "large" })],
      [{ keyword: "small", volume: 100, competition: null }, { keyword: "large", volume: 5000, competition: null }],
    )
    expect(rows.map((row) => row.query)).toEqual(["large", "small", "unknown"])
  })

  it("keeps the queries when no volume could be fetched", () => {
    const rows = mergeVolumes([query({ query: "seo" })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].volume).toBeNull()
  })
})
