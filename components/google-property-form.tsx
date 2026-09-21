"use client"

import { useActionState } from "react"
import { saveGoogleProperties, type GooglePropertiesFormState } from "@/app/actions"
import type { AnalyticsProperty, SearchConsoleSite } from "@/lib/google-data"
import { searchConsoleSiteMatches } from "@/lib/google-property-match"

export function GooglePropertyForm({ siteId, siteOrigin, searchConsoleSites, analyticsProperties, searchConsoleError, analyticsError, selectedSearchConsole, selectedAnalytics }: {
  siteId: string
  siteOrigin: string
  searchConsoleSites: SearchConsoleSite[]
  analyticsProperties: AnalyticsProperty[]
  searchConsoleError: string | null
  analyticsError: string | null
  selectedSearchConsole: string | null
  selectedAnalytics: string | null
}) {
  const [state, action, pending] = useActionState<GooglePropertiesFormState, FormData>(saveGoogleProperties, {})
  const defaultSearchConsole = selectedSearchConsole ?? searchConsoleSites.find((item) => searchConsoleSiteMatches(item.siteUrl, siteOrigin))?.siteUrl
  const defaultAnalytics = selectedAnalytics ?? (analyticsProperties.length === 1 ? analyticsProperties[0].property : undefined)
  const canUpdate = !searchConsoleError || !analyticsError

  return <form className="stack" action={action}>
    <input type="hidden" name="siteId" value={siteId} />
    <section className="card stack"><h2>Search Console</h2>
      {searchConsoleError ? <p className="error" role="alert">{searchConsoleError} 現在の選択は維持されます。</p> : <div className="goal-list">
        <label className="goal-card"><span><input type="radio" name="searchConsoleProperty" value="" defaultChecked={!defaultSearchConsole} /> 使用しない</span></label>
        {searchConsoleSites.map((item) => {
          const matches = searchConsoleSiteMatches(item.siteUrl, siteOrigin)
          return <label className="goal-card" key={item.siteUrl}>
            <span><input type="radio" name="searchConsoleProperty" value={item.siteUrl} defaultChecked={item.siteUrl === defaultSearchConsole} disabled={!matches} /> <strong>{item.siteUrl}</strong></span>
            <span className="muted">権限: {item.permissionLevel}</span>
            {matches ? <span className="status-label">登録サイトと一致</span> : <span className="muted">このサイトには使用できません</span>}
          </label>
        })}
      </div>}
    </section>
    <section className="card stack"><h2>Google Analytics 4</h2>
      {analyticsError ? <p className="error" role="alert">{analyticsError} 現在の選択は維持されます。</p> : <div className="goal-list">
        <label className="goal-card"><span><input type="radio" name="ga4Property" value="" defaultChecked={!defaultAnalytics} /> 使用しない</span></label>
        {analyticsProperties.map((item) => <label className="goal-card" key={item.property}>
          <span><input type="radio" name="ga4Property" value={item.property} defaultChecked={item.property === defaultAnalytics} /> <strong>{item.displayName}</strong></span>
          <span className="muted">{item.accountName} / {item.property}</span>
        </label>)}
      </div>}
    </section>
    {canUpdate && <button className="button" disabled={pending}>{pending ? "確認・保存中…" : "選択したプロパティを保存"}</button>}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}
