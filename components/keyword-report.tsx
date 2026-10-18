import { per30Days, type WindowMetrics } from "@/lib/keyword-performance"
import type { MeasurementStatus } from "@/lib/site-keywords"

export const number = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 })

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })

export function formatDate(value: Date | null): string {
  return value ? dateFormat.format(value) : "—"
}

export function formatPosition(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${number.format(value)}位`
}

export function formatRate(monthlyImpressions: number, volume: number): string {
  const rate = monthlyImpressions / volume * 100
  return rate > 0 && rate < 0.1 ? "0.1%未満" : `${number.format(rate)}%`
}

export function Metrics({ value, days, volume }: { value: WindowMetrics | null; days: number; volume?: number | null }) {
  if (days === 0) return <span className="muted">—</span>
  if (!value) return <><span className="muted">データなし</span><span className="table-secondary">{days}日間</span></>
  const monthly = per30Days(value.impressions, days)
  return <>
    <span className="table-primary">{formatPosition(value.position)}</span>
    <span className="table-secondary">{days}日間で表示 {number.format(value.impressions)}・クリック {number.format(value.clicks)}</span>
    {monthly !== null && <span className="table-secondary">30日換算 表示 {number.format(monthly)}{volume ? `（表示率 ${formatRate(monthly, volume)}）` : ""}</span>}
  </>
}

export function StatusLabel({ status, datesError }: { status: MeasurementStatus; datesError: string | null }) {
  switch (status.state) {
    case "unassigned": return <span className="status-label">記事未割り当て</span>
    case "unknownDate": return <span className="status-label" title={datesError ?? undefined}>公開日不明</span>
    case "testPeriod": return <span className="status-label">テスト期間中（{formatDate(status.measurableFrom)}から測定）</span>
    case "measurable": return <span className="status-label">測定できる（公開{status.daysSincePublished}日）</span>
  }
}
