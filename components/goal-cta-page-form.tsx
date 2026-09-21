"use client"

import { useActionState, useEffect, useRef } from "react"
import { saveGoalCtaPages, type GoalCtaPageFormState } from "@/app/actions"

export function GoalCtaPageForm({ siteId, goalId, siteOrigin, paths }: { siteId: string; goalId: string; siteOrigin: string; paths: string[] }) {
  const [state, action, pending] = useActionState<GoalCtaPageFormState, FormData>(saveGoalCtaPages, {})
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (state.success && detailsRef.current) detailsRef.current.open = false
  }, [state.success])

  return <div className="stack">
    <details className="goal-inline-editor" open={paths.length === 0 ? true : undefined} ref={detailsRef}>
      <summary>{paths.length > 0 ? `CTAページを変更（${paths.length}件）` : "CTAページを設定"}</summary>
      <form className="stack goal-inline-editor-content" action={action}>
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="goalId" value={goalId} />
        <label className="field">CTAページURL（1行に1ページ）
          <textarea name="ctaPages" rows={4} defaultValue={paths.map((path) => new URL(path, siteOrigin).href).join("\n")} placeholder={`${siteOrigin}/\n${siteOrigin}/contact`} />
          <small className="muted">TOPページやLPなど、CVへ誘導する主要ページだけを登録してください。最大20件です。</small>
        </label>
        <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "CTAページを保存"}</button></div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
    </details>
    {state.success && <p className="status" role="status">{state.success}</p>}
  </div>
}
