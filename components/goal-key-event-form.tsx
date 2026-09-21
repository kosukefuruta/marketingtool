"use client"

import { useActionState, useEffect, useRef } from "react"
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
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const selectedCount = Object.values(selected).reduce((total, eventNames) => total + (eventNames?.length ?? 0), 0)

  useEffect(() => {
    if (state.success && detailsRef.current) detailsRef.current.open = false
  }, [state.success])

  return <div className="stack">
    <details className="goal-inline-editor" open={selectedCount === 0 ? true : undefined} ref={detailsRef}>
      <summary>{selectedCount > 0 ? `キーイベントを変更（${selectedCount}件）` : "キーイベントを設定"}</summary>
      <form className="stack goal-inline-editor-content" action={action}>
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="goalId" value={goalId} />
        <KeyEventFields stages={keyEventStagesForMetric(metric)} available={available} selected={selected} loadError={loadError} />
        <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "キーイベントを保存"}</button></div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
    </details>
    {state.success && <p className="status" role="status">{state.success}</p>}
  </div>
}
