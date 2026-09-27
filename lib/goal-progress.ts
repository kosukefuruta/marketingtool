import { formatGoalValue, goalMetrics, goalPeriods, isGoalPeriod, type GoalMetric } from "./goals"

export type GoalProgress = {
  current: number
  target: number
  /** 目標まで不足している量。達成済みなら0 */
  gap: number
  achieved: boolean
  /** 達成率。達成済みなら1を超えることがある */
  rate: number
  gapLabel: string
  rateLabel: string
}

/**
 * 実績はGoogleの直近28日分しか取得できない。月間目標と時点目標だけを比較対象にし、
 * 旧仕様で登録された日間・週間目標は換算せずに比較を止める。
 */
export type GoalPeriodComparison =
  | { comparable: true; note: string | null }
  | { comparable: false; reason: string }

export function goalPeriodComparison(period: string): GoalPeriodComparison {
  if (period === "point") return { comparable: true, note: null }
  if (period === "monthly") return { comparable: true, note: "直近28日の実績を月間目標と比較しています。" }
  if (isGoalPeriod(period)) return { comparable: false, reason: `${goalPeriods[period]}の目標は、直近28日の実績と比較できません。` }
  return { comparable: false, reason: "目標の集計期間が不明なため、実績と比較できません。" }
}

export function goalProgress(metric: GoalMetric, current: number | null | undefined, target: number): GoalProgress | null {
  if (current === null || current === undefined || !Number.isFinite(current) || !Number.isFinite(target)) return null

  const decreasing = goalMetrics[metric].direction === "decrease"
  const achieved = decreasing ? current <= target : current >= target
  const gap = Math.max(0, decreasing ? current - target : target - current)
  // 順位は数値が小さいほど良い。現在値0以下は目標より上位なので達成扱いにする。
  const rate = decreasing
    ? (current > 0 ? target / current : 1)
    : (target > 0 ? current / target : 1)

  return {
    current,
    target,
    gap,
    achieved,
    rate,
    gapLabel: achieved
      ? gapLabelForAchieved(metric, current, target, decreasing)
      : decreasing
        ? `あと${formatGoalValue(metric, gap)}上位へ`
        : `あと${formatGoalValue(metric, gap)}`,
    rateLabel: `達成率 ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(rate * 100)}%`,
  }
}

function gapLabelForAchieved(metric: GoalMetric, current: number, target: number, decreasing: boolean): string {
  const excess = decreasing ? target - current : current - target
  if (excess <= 0) return "目標達成"
  return decreasing
    ? `目標達成（${formatGoalValue(metric, excess)}上回る）`
    : `目標達成（+${formatGoalValue(metric, excess)}）`
}

/** 進捗バーの幅。達成率が100%を超えても振り切らせない */
export function progressBarPercent(progress: GoalProgress): number {
  return Math.max(0, Math.min(100, Math.round(progress.rate * 100)))
}
