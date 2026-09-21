export const RPM_PRIOR_PAGEVIEWS = 10_000

export type PageRpmObservation = {
  revenue: number
  pageviews: number
  rpm: number
  weight: number
}

export function parsePageRpmObservation(revenueRaw: string, pageviewsRaw: string): { value: PageRpmObservation | null; error: string | null } {
  const revenueText = revenueRaw.trim()
  const pageviewsText = pageviewsRaw.trim()
  if (!revenueText && !pageviewsText) return { value: null, error: null }
  if (!revenueText || !pageviewsText) return { value: null, error: "広告収益と計測PV数は両方入力してください。" }

  const revenue = Number(revenueText)
  const pageviews = Number(pageviewsText)
  if (!Number.isFinite(revenue) || revenue < 0) return { value: null, error: "広告収益は0以上の数値で入力してください。" }
  if (!Number.isSafeInteger(pageviews) || pageviews <= 0) return { value: null, error: "計測PV数は1以上の整数で入力してください。" }

  return {
    value: {
      revenue,
      pageviews,
      rpm: revenue / pageviews * 1000,
      weight: pageviews / (pageviews + RPM_PRIOR_PAGEVIEWS),
    },
    error: null,
  }
}
