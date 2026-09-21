"use client"

import { useActionState } from "react"
import { saveGoalKeyEvents, type GoalKeyEventFormState } from "@/app/actions"
import type { AnalyticsKeyEvent } from "@/lib/google-data"

export function GoalKeyEventForm({ siteId, goalId, available, selected, loadError }: {
  siteId: string
  goalId: string
  available: AnalyticsKeyEvent[]
  selected: string[]
  loadError?: string | null
}) {
  const [state, action, pending] = useActionState<GoalKeyEventFormState, FormData>(saveGoalKeyEvents, {})
  const options = [...available]
  for (const eventName of selected) {
    if (!options.some((item) => item.eventName === eventName)) options.push({ name: eventName, eventName })
  }

  return <form className="stack" action={action}>
    <input type="hidden" name="siteId" value={siteId} />
    <input type="hidden" name="goalId" value={goalId} />
    <fieldset className="field checkbox-group">
      <legend>CVとなるGA4キーイベント（複数選択可・最大20件）</legend>
      {options.length > 0 ? options.map((item) => <label key={item.name || item.eventName}>
        <input type="checkbox" name="keyEvent" value={item.eventName} defaultChecked={selected.includes(item.eventName)} /> {item.eventName}
      </label>) : <small className="muted">{loadError ?? "選択できるキーイベントがありません。GA4でキーイベントを設定してください。"}</small>}
    </fieldset>
    <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "キーイベントを保存"}</button></div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}
