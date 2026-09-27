import type { KeywordDemand } from "@/lib/keyword-demand"

const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 })

export function KeywordDemandTable({ rows }: { rows: KeywordDemand[] }) {
  return <div className="data-table-wrap">
    <table className="data-table">
      <thead>
        <tr>
          <th>検索キーワード</th>
          <th>月間検索数</th>
          <th>表示回数</th>
          <th>表示シェア</th>
          <th>平均順位</th>
        </tr>
      </thead>
      <tbody>{rows.map((row) => <tr key={row.query}>
        <td>{row.query}</td>
        <td>{row.volume === null ? "不明" : `${number.format(row.volume)}回`}</td>
        <td>{number.format(row.impressions)}回</td>
        <td>{row.impressionShare === null ? "—" : `${number.format(row.impressionShare)}%`}</td>
        <td>{number.format(row.position)}位</td>
      </tr>)}</tbody>
    </table>
  </div>
}
