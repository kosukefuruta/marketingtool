"use client"

import { useActionState } from "react"
import { saveGoalPageRpm, type GoalPageRpmFormState } from "@/app/actions"

export function GoalPageRpmForm({ siteId, goalId, pageRpm }: { siteId: string; goalId: string; pageRpm: number | null }) {
  const [state, action, pending] = useActionState<GoalPageRpmFormState, FormData>(saveGoalPageRpm, {})
  return <form className="stack" action={action}>
    <input type="hidden" name="siteId" value={siteId} />
    <input type="hidden" name="goalId" value={goalId} />
    <label className="field">ページRPM（円／1,000PV）
      <input name="pageRpm" type="number" min="0.01" step="any" inputMode="decimal" defaultValue={pageRpm ?? ""} placeholder="例: 500" />
      <small className="muted">広告管理画面などで確認した値を入力してください。空欄で保存するとジャンル別の初期値に戻します。</small>
    </label>
    <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "ページRPMを保存"}</button></div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}
