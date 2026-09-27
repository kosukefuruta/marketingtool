import { fetchSearchVolumes, hasDataForSeoCredentials, type SearchVolume } from "./dataforseo"
import type { SearchQueryMetric } from "./google-data"

/** ボリュームを引くクエリ数の上限。1リクエストで足り、費用が読める範囲に抑える。 */
export const DEMAND_QUERY_LIMIT = 50

export type KeywordDemand = SearchQueryMetric & {
  volume: number | null
  /**
   * 需要のうち、実際に検索結果へ表示された割合の目安。順位が低いほど小さくなる。
   * 実績は直近28日、ボリュームは月平均なので、実績を30日相当へ換算して比べる。
   * 国・端末の条件が揃わないため100%を超えることがあり、厳密なシェアではない。
   */
  impressionShare: number | null
}

/** Search Consoleの取得期間（日）。docs上の28日窓に合わせる。 */
const SEARCH_WINDOW_DAYS = 28
const MONTH_DAYS = 30

function normalize(keyword: string): string {
  return keyword.trim().toLowerCase()
}

export function topQueriesByImpressions(queries: SearchQueryMetric[], limit = DEMAND_QUERY_LIMIT): SearchQueryMetric[] {
  return [...queries].sort((left, right) => right.impressions - left.impressions).slice(0, limit)
}

/** DataForSEOはキーワードを正規化して返すことがあるため、小文字化した値で突き合わせる。 */
export function mergeVolumes(queries: SearchQueryMetric[], volumes: SearchVolume[]): KeywordDemand[] {
  const byKeyword = new Map(volumes.map((entry) => [normalize(entry.keyword), entry.volume]))
  return queries
    .map((query) => {
      const volume = byKeyword.get(normalize(query.query)) ?? null
      const monthlyImpressions = query.impressions * MONTH_DAYS / SEARCH_WINDOW_DAYS
      return {
        ...query,
        volume,
        impressionShare: volume !== null && volume > 0 ? monthlyImpressions / volume * 100 : null,
      }
    })
    .sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1))
}

/**
 * クエリ別の実績に検索ボリュームを付ける。
 * DataForSEOが使えないときは実績だけを返し、理由を添える。需要が分からなくても画面は成立させる。
 */
export async function loadKeywordDemand(queries: SearchQueryMetric[]): Promise<{ rows: KeywordDemand[]; error: string | null }> {
  const top = topQueriesByImpressions(queries)
  if (top.length === 0) return { rows: [], error: null }
  // 未設定は運用側の話であり、利用者に見せる情報ではない。実績だけ出す。
  if (!hasDataForSeoCredentials()) return { rows: mergeVolumes(top, []), error: null }
  try {
    const volumes = await fetchSearchVolumes(top.map((query) => query.query))
    return { rows: mergeVolumes(top, volumes), error: null }
  } catch {
    // 失敗の詳細はログ（[dataforseo]）にある。画面には外部サービスの内部メッセージを出さない。
    return { rows: mergeVolumes(top, []), error: "検索ボリュームを取得できませんでした。実績のみ表示しています。" }
  }
}
