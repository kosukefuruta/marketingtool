"use client"

import { useActionState } from "react"
import { saveSite, type SiteFormState } from "@/app/actions"

export function SiteForm({ siteId, defaultName, defaultUrl, submitLabel, nameOptional }: {
  siteId?: string
  defaultName?: string
  defaultUrl?: string
  submitLabel: string
  nameOptional?: boolean
}) {
  const [state, action, pending] = useActionState<SiteFormState, FormData>(saveSite, {})

  return <form className="stack" action={action}>
    {siteId && <input name="siteId" type="hidden" value={siteId} />}
    <label className="field">{nameOptional ? "サイト名（任意）" : "サイト名"}
      <input name="name" defaultValue={defaultName} placeholder={nameOptional ? "株式会社Owtell" : undefined} />
    </label>
    {siteId ? <div className="field"><span>サイトURL</span><strong className="url-text">{defaultUrl}</strong><small className="muted">サイトURLは変更できません。別のURLは新しいサイトとして登録してください。</small></div> : <label className="field">サイトURL
      <input name="url" type="url" defaultValue={defaultUrl} placeholder="https://example.com" required />
    </label>}
    <button className="button" disabled={pending}>{pending ? "保存中…" : submitLabel}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
  </form>
}
