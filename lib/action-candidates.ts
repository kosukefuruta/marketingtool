import type { ActionTypeId } from "./action-types"
import type { SearchPageMetric } from "./google-data"

/** 観測量が少ないページで順位を論じないための下限。 */
export const RANK_CANDIDATE_MIN_IMPRESSIONS = 100
export const RANK_CANDIDATE_RANGE = { from: 10, to: 20 } as const
const RANK_CANDIDATE_LIMIT = 10

export type ActionCandidate = {
  actionTypeId: ActionTypeId
  page: string
  evidence: string
  impressions: number
}

const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 })

/**
 * RANK-001の候補。10〜20位で表示回数が下限以上のページを、表示回数の多い順に返す。
 * 表示回数が多いほど1ページ目へ入ったときの伸び代が大きいため、その順に並べる。
 */
export function rankImprovementCandidates(pages: SearchPageMetric[], limit = RANK_CANDIDATE_LIMIT): ActionCandidate[] {
  return pages
    .filter((page) => page.impressions >= RANK_CANDIDATE_MIN_IMPRESSIONS
      && page.position >= RANK_CANDIDATE_RANGE.from
      && page.position <= RANK_CANDIDATE_RANGE.to)
    .sort((left, right) => right.impressions - left.impressions)
    .slice(0, limit)
    .map((page) => ({
      actionTypeId: "RANK-001",
      page: page.page,
      evidence: `平均${number.format(page.position)}位、表示${number.format(page.impressions)}回、クリック${number.format(page.clicks)}回`,
      impressions: page.impressions,
    }))
}
