export const goalMetrics = {
  conversions: { label: "コンバージョン数", unit: "件", defaultPeriod: "monthly", direction: "increase" },
  paidContracts: { label: "有料契約数", unit: "件", defaultPeriod: "monthly", direction: "increase" },
  revenue: { label: "売上高", unit: "円", defaultPeriod: "monthly", direction: "increase" },
  adRevenue: { label: "広告収益", unit: "円", defaultPeriod: "monthly", direction: "increase" },
  pageviews: { label: "ページビュー数", unit: "PV", defaultPeriod: "monthly", direction: "increase" },
  organicSessions: { label: "自然検索セッション数", unit: "セッション", defaultPeriod: "monthly", direction: "increase" },
  organicClicks: { label: "自然検索クリック数", unit: "クリック", defaultPeriod: "monthly", direction: "increase" },
  impressions: { label: "検索表示回数", unit: "回", defaultPeriod: "monthly", direction: "increase" },
  ctr: { label: "検索クリック率", unit: "%", defaultPeriod: "monthly", direction: "increase" },
  conversionRate: { label: "コンバージョン率", unit: "%", defaultPeriod: "monthly", direction: "increase" },
  averagePosition: { label: "平均掲載順位", unit: "位", defaultPeriod: "point", direction: "decrease" },
  publishedPages: { label: "公開ページ数", unit: "ページ", defaultPeriod: "point", direction: "increase" },
  indexedPages: { label: "インデックスページ数", unit: "ページ", defaultPeriod: "point", direction: "increase" },
} as const

export type GoalMetric = keyof typeof goalMetrics

export const goalPeriods = {
  point: "時点値",
  daily: "1日あたり",
  weekly: "1週間あたり",
  monthly: "1か月あたり",
} as const

export type GoalPeriod = keyof typeof goalPeriods

export const goalSubjects = {
  site: "サイト全体",
  keyword: "特定キーワード",
  page: "特定ページ",
} as const

export type GoalSubject = keyof typeof goalSubjects

export function goalSubjectForMetric(metric: GoalMetric): GoalSubject {
  return metric === "averagePosition" ? "keyword" : "site"
}

export function goalNameFor(metric: GoalMetric, target: number, subjectValue: string | null): string {
  const formattedTarget = formatGoalValue(metric, target)
  if (metric === "averagePosition" && subjectValue) return `「${subjectValue}」で${formattedTarget}を目指す`
  return `${goalMetrics[metric].label}を${formattedTarget}にする`
}

export function isGoalMetric(value: string): value is GoalMetric {
  return value in goalMetrics
}

export function isGoalPeriod(value: string): value is GoalPeriod {
  return value in goalPeriods
}

export function isGoalSubject(value: string): value is GoalSubject {
  return value in goalSubjects
}

export function validateGoalValues(metric: GoalMetric, baseline: number | null, target: number): string | null {
  if (!Number.isFinite(target) || target < 0) return "目標値は0以上の数値で入力してください。"
  if (baseline !== null && (!Number.isFinite(baseline) || baseline < 0)) return "現在値は0以上の数値で入力してください。"
  if ((metric === "ctr" || metric === "conversionRate") && (target > 100 || (baseline !== null && baseline > 100))) {
    return "率は0〜100%で入力してください。"
  }
  if (metric === "averagePosition" && (target < 1 || (baseline !== null && baseline < 1))) {
    return "平均掲載順位は1以上で入力してください。"
  }
  if (baseline !== null && goalMetrics[metric].direction === "increase" && target <= baseline) {
    return "目標値は現在値より大きい数値を入力してください。"
  }
  if (baseline !== null && goalMetrics[metric].direction === "decrease" && target >= baseline) {
    return "目標順位は現在の順位より上位の数値を入力してください。"
  }
  return null
}

export function formatGoalValue(metric: GoalMetric, value: number): string {
  return `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value)}${goalMetrics[metric].unit}`
}
