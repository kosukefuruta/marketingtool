"use client"

import { useActionState, useState } from "react"
import { createGoal, type GoalFormState } from "@/app/actions"
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
      {metric === "conversions" && <fieldset className="field checkbox-group">
        <legend>CVとなるGA4キーイベント（複数選択可・最大20件）</legend>
        {keyEvents.length > 0 ? keyEvents.map((item) => <label key={item.name || item.eventName}>
          <input type="checkbox" name="keyEvent" value={item.eventName} /> {item.eventName}
        </label>) : <small className="muted">{keyEventsError ?? "選択できるキーイベントがありません。GA4でキーイベントを設定すると、ここから選択できます。"}</small>}
      </fieldset>}
      <label className="field">目標値（{definition.unit}）
        <input name="targetValue" type="number" min={needsKeyword ? 1 : 0} max={isRate ? 100 : undefined} step="any" inputMode="decimal" placeholder={needsKeyword ? "1" : "10"} required />
      </label>
    </div>
    <p className="muted">{definition.defaultPeriod === "monthly" ? "1か月あたりの目標として登録します。" : "目標とする時点の値として登録します。"}</p>
    <button className="button" disabled={pending}>{pending ? "生成中…" : "登録してブレークダウンを表示"}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
  </form>
}
