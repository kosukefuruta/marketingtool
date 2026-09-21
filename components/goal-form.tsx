"use client"

import { useActionState, useState } from "react"
import { createGoal, type GoalFormState } from "@/app/actions"
import { goalMetrics, type GoalMetric } from "@/lib/goals"

type SiteOption = { id: string; name: string; origin: string }

export function GoalForm({ site }: { site: SiteOption }) {
  const [state, action, pending] = useActionState<GoalFormState, FormData>(createGoal, {})
  const [metric, setMetric] = useState<GoalMetric>("conversions")
  const definition = goalMetrics[metric]
  const needsKeyword = metric === "averagePosition"
  const isRate = metric === "ctr" || metric === "conversionRate"

  return <form className="stack" action={action}>
    <input name="siteId" type="hidden" value={site.id} />
    <div className="form-grid">
      <label className="field">指標
        <select name="metric" required value={metric} onChange={(event) => setMetric(event.target.value as GoalMetric)}>
          {Object.entries(goalMetrics).map(([value, definition]) => <option key={value} value={value}>{definition.label}</option>)}
        </select>
      </label>
      {needsKeyword && <label className="field">キーワード
        <input name="subjectValue" placeholder="SEOツール" maxLength={200} required />
      </label>}
      <label className="field">目標値（{definition.unit}）
        <input name="targetValue" type="number" min={needsKeyword ? 1 : 0} max={isRate ? 100 : undefined} step="any" inputMode="decimal" placeholder={needsKeyword ? "1" : "10"} required />
      </label>
    </div>
    <p className="muted">{definition.defaultPeriod === "monthly" ? "1か月あたりの目標として登録します。" : "目標とする時点の値として登録します。"}</p>
    <button className="button" disabled={pending}>{pending ? "生成中…" : "登録してブレークダウンを表示"}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
  </form>
}
