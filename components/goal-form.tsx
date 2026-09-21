"use client"

import { useActionState } from "react"
import { createGoal, type GoalFormState } from "@/app/actions"
import { goalMetrics, goalPeriods, goalSubjects } from "@/lib/goals"

type SiteOption = { id: string; name: string; origin: string }

export function GoalForm({ site }: { site: SiteOption }) {
  const [state, action, pending] = useActionState<GoalFormState, FormData>(createGoal, {})

  return <form className="stack" action={action}>
    <input name="siteId" type="hidden" value={site.id} />
    <div className="field"><span>対象サイト</span><strong>{site.name}（{site.origin}）</strong></div>
    <label className="field">目標名
      <input name="name" placeholder="自然検索セッションを月1,000にする" maxLength={120} required />
    </label>
    <div className="form-grid">
      <label className="field">目標の対象
        <select name="subjectType" required defaultValue="site">
          {Object.entries(goalSubjects).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">対象の値
        <input name="subjectValue" placeholder="キーワードまたはページURL。サイト全体なら空欄" maxLength={2000} />
      </label>
      <label className="field">測定指標
        <select name="metric" required defaultValue="conversions">
          {Object.entries(goalMetrics).map(([value, definition]) => <option key={value} value={value}>{definition.label}</option>)}
        </select>
      </label>
      <label className="field">集計期間
        <select name="period" required defaultValue="monthly">
          {Object.entries(goalPeriods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">現在値（任意）
        <input name="baselineValue" type="number" min="0" step="any" inputMode="decimal" placeholder="0" />
      </label>
      <label className="field">目標値
        <input name="targetValue" type="number" min="0" step="any" inputMode="decimal" placeholder="10" required />
      </label>
    </div>
    <p className="muted">「SEOツールで1位」なら対象をキーワード、指標を平均掲載順位、目標値を1にします。現在値は後からGSC・GA4の実測値で更新できます。</p>
    <button className="button" disabled={pending}>{pending ? "保存中…" : "数値目標を登録"}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
  </form>
}
