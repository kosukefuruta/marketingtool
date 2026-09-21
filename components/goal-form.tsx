"use client"

import { useActionState, useState } from "react"
import { createGoal, type GoalFormState } from "@/app/actions"
import { KeyEventFields } from "@/components/key-event-fields"
import { keyEventStagesForMetric } from "@/lib/goal-key-events"
import { goalMetrics, type GoalMetric } from "@/lib/goals"
import { siteCategories, type SiteCategory } from "@/lib/site-categories"
import type { AnalyticsKeyEvent } from "@/lib/google-data"

type SiteOption = { id: string; name: string; origin: string; category: SiteCategory | null }

export function GoalForm({ site, keyEvents = [], keyEventsError = null }: { site: SiteOption; keyEvents?: AnalyticsKeyEvent[]; keyEventsError?: string | null }) {
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
      {metric === "adRevenue" && <label className="field">サイトジャンル
        <select name="category" defaultValue={site.category ?? ""} required>
          <option value="" disabled>選択してください</option>
          {Object.entries(siteCategories).map(([value, category]) => <option value={value} key={value}>{category.label}</option>)}
        </select>
        <small className="muted">ジャンル別のページRPMから必要PVを計算します。</small>
      </label>}
      {metric === "adRevenue" && <label className="field">計測期間の広告収益（円・任意）
        <input name="pageRpmRevenue" type="number" min="0" step="any" inputMode="decimal" placeholder="例: 1.3" />
        <small className="muted">同じ期間の計測PV数と合わせてRPMを自動計算します。収益0円も入力できます。</small>
      </label>}
      {metric === "adRevenue" && <label className="field">RPMの計測PV数（任意）
        <input name="pageRpmPageviews" type="number" min="1" step="1" inputMode="numeric" placeholder="例: 443" />
        <small className="muted">データ量に応じてジャンル別の初期値から実測RPMへ近づけます。</small>
      </label>}
      <KeyEventFields stages={keyEventStagesForMetric(metric)} available={keyEvents} loadError={keyEventsError} />
      <label className="field">目標値（{definition.unit}）
        <input name="targetValue" type="number" min={needsKeyword ? 1 : 0} max={isRate ? 100 : undefined} step="any" inputMode="decimal" placeholder={needsKeyword ? "1" : "10"} required />
      </label>
    </div>
    <p className="muted">{definition.defaultPeriod === "monthly" ? "1か月あたりの目標として登録します。" : "目標とする時点の値として登録します。"}</p>
    <button className="button" disabled={pending}>{pending ? "生成中…" : "登録してブレークダウンを表示"}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
  </form>
}
