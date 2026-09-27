import type { GoalMetric } from "./goals"
import type { NumericObservation } from "./google-data"
import { priorFromThreePoints, updateRate } from "./bayesian-rate"
import { parsePageRpmObservation } from "./page-rpm"
import { siteCategories, type SiteCategory } from "./site-categories"

export type GoalDriver = {
  id: string
  label: string
  unit: string
  source: string
  description: string
  children?: GoalDriver[]
}

export type GoalBreakdown = {
  formula: string
  phase: string
  drivers: GoalDriver[]
}

const organicSessions: GoalDriver = {
  id: "organic-sessions",
  label: "自然検索セッション数",
  unit: "セッション/月",
  source: "GA4",
  description: "自然検索からサイトへ訪れたセッション数",
  children: [
    { id: "impressions", label: "検索表示回数", unit: "回/月", source: "Search Console", description: "検索結果にページが表示された回数" },
    { id: "ctr", label: "検索CTR", unit: "%", source: "Search Console", description: "検索表示からクリックされた割合" },
    { id: "organic-clicks", label: "検索クリック数", unit: "クリック/月", source: "Search Console", description: "検索結果からサイトへ移動した回数。GA4の自然検索セッション数との差は、同一セッション内の複数クリックや計測方式の違いによる" },
  ],
}

const ctaSessions: GoalDriver = {
  id: "cta-sessions",
  label: "CTAページ到達数（セッション）",
  unit: "セッション/月",
  source: "GA4",
  description: "自然検索経由で、設定したCTAページを閲覧したセッション数",
}

const definitions: Partial<Record<GoalMetric, GoalBreakdown>> = {
  conversions: {
    formula: "CV数 = サイト全体流入 × CTAページ到達率 × CTAページCVR",
    phase: "初期仮定による計画",
    drivers: [
      organicSessions,
      ctaSessions,
      {
        id: "cta-rate",
        label: "CTAページ到達率",
        unit: "%",
        source: "GA4",
        description: "自然検索セッションのうちCTAページを閲覧した割合",
      },
      { id: "conversion-sessions", label: "CV数（セッション）", unit: "セッション/月", source: "GA4キーイベント", description: "自然検索経由で、選択したCVキーイベントが発生したセッション数" },
      { id: "cta-cvr", label: "CTAページCVR（推定）", unit: "%", source: "GA4イベント", description: "CTA到達セッション数に対するCV発生セッション数の推定比。両者が同一セッションとは限らない" },
    ],
  },
  paidContracts: {
    formula: "有料契約数 = サイト全体流入 × CTA到達率 × 無料契約CVR × 無料→有料転換率",
    phase: "初期仮定による計画",
    drivers: [
      organicSessions,
      ctaSessions,
      { id: "cta-rate", label: "CTAページ到達率", unit: "%", source: "GA4イベント", description: "自然検索セッションから無料契約導線へ進んだ割合" },
      { id: "free-conversion-sessions", label: "無料契約CV数（セッション）", unit: "セッション/月", source: "GA4キーイベント", description: "自然検索経由で、選択した無料登録キーイベントが発生したセッション数" },
      { id: "free-cvr", label: "無料契約CVR（推定）", unit: "%", source: "GA4イベント", description: "CTA到達セッション数に対する無料登録セッション数の推定比。両者が同一セッションとは限らない" },
      { id: "paid-conversion-sessions", label: "有料契約CV数（セッション）", unit: "セッション/月", source: "GA4キーイベント", description: "自然検索経由で、選択した有料契約キーイベントが発生したセッション数" },
      { id: "paid-rate", label: "無料→有料転換率（推定）", unit: "%", source: "GA4キーイベント", description: "直近180日の無料登録イベント発生セッション数に対する有料契約イベント発生セッション数の比率。コホート転換率の代替値" },
    ],
  },
  adRevenue: {
    formula: "広告収益 = ページビュー数 ÷ 1,000 × ページRPM",
    phase: "計測準備",
    drivers: [
      {
        id: "pageviews",
        label: "ページビュー数",
        unit: "PV/月",
        source: "GA4",
        description: "広告が表示されるページの閲覧数",
        children: [
          { id: "sessions", label: "セッション数", unit: "セッション/月", source: "GA4", description: "全流入元からの訪問数" },
          { id: "pages-per-session", label: "セッションあたりPV", unit: "PV", source: "GA4", description: "1回の訪問で閲覧される平均ページ数" },
        ],
      },
      { id: "page-rpm", label: "ページRPM", unit: "円/1,000PV", source: "広告配信サービス", description: "1,000PVあたりの広告収益" },
    ],
  },
}

export function getGoalBreakdown(metric: GoalMetric): GoalBreakdown | null {
  return definitions[metric] ?? null
}

export type GoalScenario = {
  id: "conservative" | "standard" | "optimistic"
  label: string
  assumptions: Array<{ label: string; value: string }>
  requirements: Array<{ label: string; value: number; unit: string }>
}

const scenarioLabels = [
  { id: "conservative", label: "慎重" },
  { id: "standard", label: "標準" },
  { id: "optimistic", label: "好調" },
] as const

function percentage(value: number): string {
  return `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value * 100)}%`
}

export type RateObservation = { successes: number; trials: number }

function updatedRates(initial: [number, number, number], observation?: RateObservation): [number, number, number] {
  if (!observation) return initial
  const estimate = updateRate(observation.successes, observation.trials, priorFromThreePoints(...initial))
  return estimate ? [estimate.low, estimate.median, estimate.high] : initial
}

const ctaRatePrior: [number, number, number] = [0.02, 0.03, 0.05]
const ctaCvrPrior: [number, number, number] = [0.005, 0.01, 0.02]
const freeCvrPrior: [number, number, number] = [0.03, 0.05, 0.1]
const paidRatePrior: [number, number, number] = [0.05, 0.1, 0.2]

type PageRpmBand = { values: [number, number, number]; label: string; note: string | null }

function pageRpmBand(category: SiteCategory, numericObservations: Record<string, NumericObservation>, manualPageRpmRevenue?: number | null, manualPageRpmPageviews?: number | null): PageRpmBand {
  const manualObservation = parsePageRpmObservation(String(manualPageRpmRevenue ?? ""), String(manualPageRpmPageviews ?? "")).value
  const validManualObservation = manualObservation ? { value: manualObservation.rpm, weight: manualObservation.weight } : null
  const candidateRpm = numericObservations["page-rpm"]
  const measuredRpm = candidateRpm
    && Number.isFinite(candidateRpm.value) && candidateRpm.value >= 0
    && Number.isFinite(candidateRpm.weight) && candidateRpm.weight >= 0 && candidateRpm.weight <= 1
    ? candidateRpm : null
  const observation = validManualObservation ?? measuredRpm
  const values = siteCategories[category].rpm.map((initialRpm) => observation
    ? (1 - observation.weight) * initialRpm + observation.weight * observation.value
    : initialRpm) as [number, number, number]
  const note = observation ? `${validManualObservation ? "手入力・" : ""}実測補正 ${Math.round(observation.weight * 100)}%` : null
  return { values, label: note ? `ページRPM（${note}）` : "ページRPM", note }
}

function yen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`
}

export type DriverValue = { value: string; detail?: string; assumed?: boolean }

function assumedRate(prior: [number, number, number], observation?: RateObservation): DriverValue {
  const [low, median, high] = updatedRates(prior, observation)
  return {
    value: percentage(median),
    detail: `${observation ? "実測で補正した仮定値" : "初期仮定値"}（慎重 ${percentage(low)} 〜 好調 ${percentage(high)}）`,
    assumed: true,
  }
}

// Fills the drivers Google cannot measure for us, so a breakdown never shows an empty column.
export function assumedDriverValues(metric: GoalMetric, category?: SiteCategory | null, observations: Record<string, RateObservation> = {}, numericObservations: Record<string, NumericObservation> = {}, manualPageRpmRevenue?: number | null, manualPageRpmPageviews?: number | null): Record<string, DriverValue> {
  if (metric === "conversions") {
    return {
      "cta-rate": assumedRate(ctaRatePrior, observations["cta-rate"]),
      "cta-cvr": assumedRate(ctaCvrPrior, observations["cta-cvr"]),
    }
  }
  if (metric === "paidContracts") {
    return {
      "cta-rate": assumedRate(ctaRatePrior, observations["cta-rate"]),
      "free-cvr": assumedRate(freeCvrPrior, observations["free-cvr"]),
      "paid-rate": assumedRate(paidRatePrior, observations["paid-rate"]),
    }
  }
  if (metric === "adRevenue" && category) {
    const band = pageRpmBand(category, numericObservations, manualPageRpmRevenue, manualPageRpmPageviews)
    return {
      "page-rpm": {
        value: `${yen(band.values[1])}/1,000PV`,
        detail: `${band.note ?? `${siteCategories[category].label}の初期仮定値`}（慎重 ${yen(band.values[0])} 〜 好調 ${yen(band.values[2])}）`,
        assumed: true,
      },
    }
  }
  return {}
}

export function buildGoalScenarios(metric: GoalMetric, target: number, category?: SiteCategory | null, observations: Record<string, RateObservation> = {}, numericObservations: Record<string, NumericObservation> = {}, manualPageRpmRevenue?: number | null, manualPageRpmPageviews?: number | null): GoalScenario[] {
  if (metric === "conversions") {
    const ctaRates = updatedRates(ctaRatePrior, observations["cta-rate"])
    const conversionRates = updatedRates(ctaCvrPrior, observations["cta-cvr"])
    return scenarioLabels.map(({ id, label }, index) => {
      const ctaRate = ctaRates[index]; const cvr = conversionRates[index]
      return {
        id, label,
        assumptions: [{ label: "CTA到達率", value: percentage(ctaRate) }, { label: "CTAページCVR（推定）", value: percentage(cvr) }],
        requirements: [
          { label: "CTAページ流入", value: Math.ceil(target / cvr), unit: "セッション/月" },
          { label: "サイト全体流入", value: Math.ceil(target / cvr / ctaRate), unit: "セッション/月" },
        ],
      }
    })
  }
  if (metric === "paidContracts") {
    const ctaRates = updatedRates(ctaRatePrior, observations["cta-rate"])
    const freeRates = updatedRates(freeCvrPrior, observations["free-cvr"])
    const paidRates = updatedRates(paidRatePrior, observations["paid-rate"])
    return scenarioLabels.map(({ id, label }, index) => {
      const ctaRate = ctaRates[index]; const freeCvr = freeRates[index]; const paidRate = paidRates[index]
      return {
        id, label,
        assumptions: [
          { label: "CTA到達率", value: percentage(ctaRate) },
          { label: "無料契約CVR（推定）", value: percentage(freeCvr) },
          { label: "無料→有料転換率（推定）", value: percentage(paidRate) },
        ],
        requirements: [
          { label: "無料契約", value: Math.ceil(target / paidRate), unit: "件/月" },
          { label: "CTAページ流入", value: Math.ceil(target / paidRate / freeCvr), unit: "セッション/月" },
          { label: "サイト全体流入", value: Math.ceil(target / paidRate / freeCvr / ctaRate), unit: "セッション/月" },
        ],
      }
    })
  }
  if (metric === "adRevenue" && category) {
    const band = pageRpmBand(category, numericObservations, manualPageRpmRevenue, manualPageRpmPageviews)
    return scenarioLabels.map(({ id, label }, index) => {
      const rpm = band.values[index]
      return {
        id, label,
        assumptions: [{ label: band.label, value: yen(rpm) }],
        requirements: [{ label: "ページビュー数", value: Math.ceil(target / rpm * 1000), unit: "PV/月" }],
      }
    })
  }
  return []
}
