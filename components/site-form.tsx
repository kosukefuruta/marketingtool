"use client"

import { useActionState } from "react"
import { saveSite, type SiteFormState } from "@/app/actions"

export function SiteForm({ defaultName, defaultUrl, submitLabel, nameOptional }: {
  defaultName?: string
  defaultUrl?: string
  submitLabel: string
  nameOptional?: boolean
}) {
  const [state, action, pending] = useActionState<SiteFormState, FormData>(saveSite, {})

  return <form className="stack" action={action}>
    <label className="field">{nameOptional ? "サイト名（任意）" : "サイト名"}
      <input name="name" defaultValue={defaultName} placeholder={nameOptional ? "株式会社Owtell" : undefined} />
    </label>
    <label className="field">サイトURL
      <input name="url" type="url" defaultValue={defaultUrl} placeholder="https://example.com" required />
    </label>
    <button className="button" disabled={pending}>{pending ? "保存中…" : submitLabel}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
  </form>
}
