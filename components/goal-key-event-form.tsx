"use client"

import { useActionState } from "react"
import { saveGoalKeyEvents, type GoalKeyEventFormState } from "@/app/actions"
import { KeyEventFields } from "@/components/key-event-fields"
import { keyEventStagesForMetric, type GoalKeyEventStage } from "@/lib/goal-key-events"
import type { GoalMetric } from "@/lib/goals"
import type { AnalyticsKeyEvent } from "@/lib/google-data"

export function GoalKeyEventForm({ siteId, goalId, metric, available, selected, loadError }: {
  siteId: string
  goalId: string
  metric: GoalMetric
  available: AnalyticsKeyEvent[]
  selected: Partial<Record<GoalKeyEventStage, string[]>>
  loadError?: string | null
}) {
  const [state, action, pending] = useActionState<GoalKeyEventFormState, FormData>(saveGoalKeyEvents, {})

  return <form className="stack" action={action}>
    <input type="hidden" name="siteId" value={siteId} />
    <input type="hidden" name="goalId" value={goalId} />
    <KeyEventFields stages={keyEventStagesForMetric(metric)} available={available} selected={selected} loadError={loadError} />
    <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "キーイベントを保存"}</button></div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}
