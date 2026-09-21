import type { GoalMetric } from "./goals"
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
  ],
}

const definitions: Partial<Record<GoalMetric, GoalBreakdown>> = {
  conversions: {
    formula: "CV数 = サイト全体流入 × CTAページ到達率 × CTAページCVR",
    phase: "初期仮定による計画",
    drivers: [
      organicSessions,
      {
        id: "cta-rate",
        label: "CTAページ到達率",
        unit: "%",
        source: "GA4",
        description: "自然検索セッションのうちCTAページを閲覧した割合",
      },
      { id: "cta-cvr", label: "CTAページCVR", unit: "%", source: "GA4イベント", description: "CTAページを閲覧したセッションがCVを完了した割合" },
    ],
  },
  paidContracts: {
    formula: "有料契約数 = サイト全体流入 × CTA到達率 × 無料契約CVR × 無料→有料転換率",
    phase: "初期仮定による計画",
    drivers: [
      organicSessions,
      { id: "cta-rate", label: "CTAページ到達率", unit: "%", source: "GA4イベント", description: "自然検索セッションから無料契約導線へ進んだ割合" },
      { id: "free-cvr", label: "無料契約CVR", unit: "%", source: "GA4・アプリ", description: "CTAページを閲覧したセッションが無料契約した割合" },
      { id: "paid-rate", label: "無料→有料転換率", unit: "%", source: "Stripe・アプリ", description: "無料契約から有料契約へ転換した割合" },
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

export function buildGoalScenarios(metric: GoalMetric, target: number, category?: SiteCategory | null): GoalScenario[] {
  if (metric === "conversions") {
    const assumptions = [[0.02, 0.005], [0.03, 0.01], [0.05, 0.02]]
    return scenarioLabels.map(({ id, label }, index) => {
      const [ctaRate, cvr] = assumptions[index]
      return {
        id, label,
        assumptions: [{ label: "CTA到達率", value: percentage(ctaRate) }, { label: "CTAページCVR", value: percentage(cvr) }],
        requirements: [
          { label: "CTAページ流入", value: Math.ceil(target / cvr), unit: "セッション/月" },
          { label: "サイト全体流入", value: Math.ceil(target / cvr / ctaRate), unit: "セッション/月" },
        ],
      }
    })
  }
  if (metric === "paidContracts") {
    const assumptions = [[0.02, 0.03, 0.05], [0.03, 0.05, 0.1], [0.05, 0.1, 0.2]]
    return scenarioLabels.map(({ id, label }, index) => {
      const [ctaRate, freeCvr, paidRate] = assumptions[index]
      return {
        id, label,
        assumptions: [
          { label: "CTA到達率", value: percentage(ctaRate) },
          { label: "無料契約CVR", value: percentage(freeCvr) },
          { label: "無料→有料転換率", value: percentage(paidRate) },
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
    return scenarioLabels.map(({ id, label }, index) => {
      const rpm = siteCategories[category].rpm[index]
      return {
        id, label,
        assumptions: [{ label: "ページRPM", value: `${rpm.toLocaleString("ja-JP")}円` }],
        requirements: [{ label: "ページビュー数", value: Math.ceil(target / rpm * 1000), unit: "PV/月" }],
      }
    })
  }
  return []
}
