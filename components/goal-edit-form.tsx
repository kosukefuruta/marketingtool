"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { updateGoal, type GoalEditFormState } from "@/app/actions"
import { goalMetricChangeNotice } from "@/lib/goal-updates"
import { goalMetrics, type GoalMetric } from "@/lib/goals"
import { siteCategories, type SiteCategory } from "@/lib/site-categories"

type EditableGoal = { id: string; metric: GoalMetric; subjectValue: string | null; targetValue: number }

export function GoalEditForm({ siteId, goal, siteCategory }: { siteId: string; goal: EditableGoal; siteCategory: SiteCategory | null }) {
  const [state, action, pending] = useActionState<GoalEditFormState, FormData>(updateGoal, {})
  const [metric, setMetric] = useState<GoalMetric>(goal.metric)
  const [savedMetric, setSavedMetric] = useState<GoalMetric>(goal.metric)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  if (savedMetric !== goal.metric) {
    // Follow the saved goal once the server sends the updated value.
    setSavedMetric(goal.metric)
    setMetric(goal.metric)
  }
  const definition = goalMetrics[metric]
  const needsKeyword = metric === "averagePosition"
  const isRate = metric === "ctr" || metric === "conversionRate"
  const notice = goalMetricChangeNotice(goal.metric, metric)

  useEffect(() => {
    if (state.success && detailsRef.current) detailsRef.current.open = false
  }, [state.success])

  return <div className="stack">
    <details className="goal-inline-editor" ref={detailsRef} onToggle={(event) => {
      if (!event.currentTarget.open) setMetric(goal.metric)
    }}>
      <summary>目標を変更</summary>
      <form className="stack goal-inline-editor-content" action={action}>
        <input name="siteId" type="hidden" value={siteId} />
        <input name="goalId" type="hidden" value={goal.id} />
        <div className="form-grid">
          <label className="field">指標
            <select name="metric" required value={metric} onChange={(event) => setMetric(event.target.value as GoalMetric)}>
              {Object.entries(goalMetrics).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
            </select>
          </label>
          {needsKeyword && <label className="field">キーワード
            <input name="subjectValue" defaultValue={goal.subjectValue ?? ""} placeholder="SEOツール" maxLength={200} required />
          </label>}
          {metric === "adRevenue" && <label className="field">サイトジャンル
            <select name="category" defaultValue={siteCategory ?? ""} required>
              <option value="" disabled>選択してください</option>
              {Object.entries(siteCategories).map(([value, category]) => <option value={value} key={value}>{category.label}</option>)}
            </select>
            <small className="muted">ジャンル別のページRPMから必要PVを計算します。</small>
          </label>}
          <label className="field">目標値（{definition.unit}）
            <input name="targetValue" type="number" min={needsKeyword ? 1 : 0} max={isRate ? 100 : undefined} step="any" inputMode="decimal" defaultValue={goal.targetValue} required />
          </label>
        </div>
        <p className="muted">{definition.defaultPeriod === "monthly" ? "1か月あたりの目標として保存します。" : "目標とする時点の値として保存します。"}</p>
        {notice && <p className="status" role="status">{notice}</p>}
        <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "目標を保存"}</button></div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
    </details>
    {state.success && <p className="status" role="status">{state.success}</p>}
  </div>
}
