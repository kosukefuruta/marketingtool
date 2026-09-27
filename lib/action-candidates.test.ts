import { describe, expect, it } from "vitest"
import { rankImprovementCandidates, RANK_CANDIDATE_MIN_IMPRESSIONS } from "./action-candidates"
import type { SearchPageMetric } from "./google-data"

function page(overrides: Partial<SearchPageMetric> & { page: string }): SearchPageMetric {
  return { impressions: 500, clicks: 5, ctr: 1, position: 12, ...overrides }
}

describe("rank improvement candidates", () => {
  it("picks the pages sitting just off the first result page", () => {
    const candidates = rankImprovementCandidates([
      page({ page: "https://example.com/a", position: 12.3, impressions: 1200, clicks: 18 }),
      page({ page: "https://example.com/b", position: 3.1 }),
      page({ page: "https://example.com/c", position: 34.0 }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toEqual({
      actionTypeId: "RANK-001",
      page: "https://example.com/a",
      evidence: "平均12.3位、表示1,200回、クリック18回",
      impressions: 1200,
    })
  })

  it("includes both ends of the 10 to 20 range", () => {
    const candidates = rankImprovementCandidates([
      page({ page: "https://example.com/at-10", position: 10 }),
      page({ page: "https://example.com/at-20", position: 20 }),
      page({ page: "https://example.com/at-21", position: 20.1 }),
      page({ page: "https://example.com/at-9", position: 9.9 }),
    ])
    expect(candidates.map((candidate) => candidate.page)).toEqual([
      "https://example.com/at-10",
      "https://example.com/at-20",
    ])
  })

  it("ignores pages with too little to judge by", () => {
    const candidates = rankImprovementCandidates([
      page({ page: "https://example.com/quiet", impressions: RANK_CANDIDATE_MIN_IMPRESSIONS - 1 }),
      page({ page: "https://example.com/loud", impressions: RANK_CANDIDATE_MIN_IMPRESSIONS }),
    ])
    expect(candidates.map((candidate) => candidate.page)).toEqual(["https://example.com/loud"])
  })

  it("puts the largest headroom first and caps the list", () => {
    const pages = Array.from({ length: 12 }, (_, index) => page({ page: `https://example.com/${index}`, impressions: 100 + index }))
    const candidates = rankImprovementCandidates(pages)
    expect(candidates).toHaveLength(10)
    expect(candidates[0].page).toBe("https://example.com/11")
    expect(candidates.at(-1)?.page).toBe("https://example.com/2")
  })

  it("returns nothing without page data", () => {
    expect(rankImprovementCandidates([])).toEqual([])
  })
})
