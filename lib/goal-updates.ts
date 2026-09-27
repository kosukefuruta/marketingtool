import { keyEventStagesForMetric, type GoalKeyEventStage } from "./goal-key-events"
import type { GoalMetric } from "./goals"

export type GoalMetricChange = {
  keptKeyEventStages: GoalKeyEventStage[]
  removesKeyEvents: boolean
  removesCtaPages: boolean
  removesPageRpm: boolean
}

export function goalMetricChange(previous: GoalMetric, next: GoalMetric): GoalMetricChange {
  const previousStages = keyEventStagesForMetric(previous)
  const nextStages = keyEventStagesForMetric(next)
  const keptKeyEventStages = previousStages.filter((stage) => nextStages.includes(stage))
  return {
    keptKeyEventStages,
    removesKeyEvents: keptKeyEventStages.length < previousStages.length,
    removesCtaPages: previousStages.length > 0 && nextStages.length === 0,
    removesPageRpm: previous === "adRevenue" && next !== "adRevenue",
  }
}

export function goalMetricChangeNotice(previous: GoalMetric, next: GoalMetric): string | null {
  if (previous === next) return null
  const change = goalMetricChange(previous, next)
  const removed = [
    change.removesKeyEvents ? "キーイベントの設定" : null,
    change.removesCtaPages ? "CTAページの設定" : null,
    change.removesPageRpm ? "ページRPMの観測値" : null,
  ].filter((label): label is string => label !== null)
  if (removed.length === 0) return null
  return `指標を変更すると、この指標では使わない${removed.join("と")}を削除します。`
}
