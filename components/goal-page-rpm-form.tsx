"use client"

import { useActionState } from "react"
import { saveGoalPageRpm, type GoalPageRpmFormState } from "@/app/actions"

export function GoalPageRpmForm({ siteId, goalId, legacyPageRpm, pageRpmRevenue, pageRpmPageviews }: { siteId: string; goalId: string; legacyPageRpm: number | null; pageRpmRevenue: number | null; pageRpmPageviews: number | null }) {
  const [state, action, pending] = useActionState<GoalPageRpmFormState, FormData>(saveGoalPageRpm, {})
  return <form className="stack" action={action}>
    <input type="hidden" name="siteId" value={siteId} />
    <input type="hidden" name="goalId" value={goalId} />
    <div className="form-grid">
      <label className="field">計測期間の広告収益（円）
        <input name="pageRpmRevenue" type="number" min="0" step="any" inputMode="decimal" defaultValue={pageRpmRevenue ?? ""} placeholder="例: 1.3" />
      </label>
      <label className="field">RPMの計測PV数
        <input name="pageRpmPageviews" type="number" min="1" step="1" inputMode="numeric" defaultValue={pageRpmPageviews ?? ""} placeholder="例: 443" />
      </label>
    </div>
    {legacyPageRpm !== null && pageRpmRevenue === null && <p className="status">以前入力したページRPM（{new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(legacyPageRpm)}円／1,000PV）は、計測PV数が不明なため推定に使用していません。広告収益と計測PV数を入力し直してください。</p>}
    <small className="muted">同じ期間の広告収益とPV数からRPMを自動計算します。PV数が少ない間はジャンル別の初期値を重く使い、データが増えるほど実測RPMへ近づけます。収益0円も入力できます。両方を空欄で保存すると解除します。</small>
    <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "RPM観測値を保存"}</button></div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}
