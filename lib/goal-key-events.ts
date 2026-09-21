import type { GoalMetric } from "./goals"

export const goalKeyEventStages = {
  conversion: { label: "CVを表すキーイベント" },
  free_registration: { label: "無料登録を表すキーイベント" },
  paid_contract: { label: "有料契約を表すキーイベント" },
} as const

export type GoalKeyEventStage = keyof typeof goalKeyEventStages

export function keyEventStagesForMetric(metric: GoalMetric): GoalKeyEventStage[] {
  if (metric === "conversions") return ["conversion"]
  if (metric === "paidContracts") return ["free_registration", "paid_contract"]
  return []
}

export function keyEventFieldName(stage: GoalKeyEventStage): string {
  return `${stage}KeyEvent`
}

export function manualKeyEventFieldName(stage: GoalKeyEventStage): string {
  return `${stage}ManualKeyEvents`
}

export function isValidGoogleEventName(eventName: string): boolean {
  return /^\p{L}[\p{L}\p{N}_]{0,39}$/u.test(eventName)
}

export function groupGoalKeyEvents(entries: Array<{ stage: string; eventName: string }>): Partial<Record<GoalKeyEventStage, string[]>> {
  const grouped: Partial<Record<GoalKeyEventStage, string[]>> = {}
  for (const entry of entries) {
    if (!Object.hasOwn(goalKeyEventStages, entry.stage)) continue
    const stage = entry.stage as GoalKeyEventStage
    grouped[stage] = [...(grouped[stage] ?? []), entry.eventName]
  }
  return grouped
}
