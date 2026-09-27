import { KeywordDemandTable } from "@/components/keyword-demand-table"
import type { SearchQueryMetric } from "@/lib/google-data"
import { loadKeywordDemand } from "@/lib/keyword-demand"

/** 検索ボリュームの取得は外部APIに依存するため、Suspenseで囲んでページ全体を待たせない。 */
export async function KeywordDemandSection({ queries }: { queries: SearchQueryMetric[] }) {
  const demand = await loadKeywordDemand(queries)
  if (demand.rows.length === 0) return null

  return <section className="card stack">
    <div>
      <h2>検索需要</h2>
      <p className="muted">表示回数の多いキーワードに月間検索数を突き合わせています。表示シェアは需要のうち実際に検索結果へ表示された割合の目安で、順位が低いほど小さくなります。国や端末の条件が揃わないため100%を超えることがあります。</p>
    </div>
    {demand.error && <p className="error" role="alert">{demand.error}</p>}
    <KeywordDemandTable rows={demand.rows} />
  </section>
}

export function KeywordDemandFallback() {
  return <section className="card stack">
    <div><h2>検索需要</h2><p className="muted">検索ボリュームを取得しています…</p></div>
  </section>
}
