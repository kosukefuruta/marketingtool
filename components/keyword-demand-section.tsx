import { KeywordDemandTable } from "@/components/keyword-demand-table"
import type { SearchQueryMetric } from "@/lib/google-data"
import { loadKeywordDemand } from "@/lib/keyword-demand"

/**
 * Suspenseで囲むと、ストリーミングの差し替えが本番環境で完了せず、フォールバックのまま固定された。
 * 他のGoogleデータと同じくページ内で待つ。取得は10秒で打ち切り、ボリュームは7日キャッシュする。
 */
export async function KeywordDemandSection({ queries }: { queries: SearchQueryMetric[] }) {
  const demand = await loadKeywordDemand(queries)
  if (demand.rows.length === 0) return null

  return <section className="card stack">
    <div>
      <h2>検索需要</h2>
      <p className="muted">表示回数の多いキーワードに月間検索数を突き合わせています。表示率は月間検索数に対する表示回数の割合で、順位が低いほど小さくなります。検索数は過去12か月の平均のため、直近の需要が平均を上回るときは100%を超えます。</p>
    </div>
    {demand.error && <p className="error" role="alert">{demand.error}</p>}
    <KeywordDemandTable rows={demand.rows} />
  </section>
}
