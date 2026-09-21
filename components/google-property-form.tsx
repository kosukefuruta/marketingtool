"use client"

import { useActionState, useEffect, useRef } from "react"
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const defaultSearchConsole = selectedSearchConsole ?? searchConsoleSites.find((item) => searchConsoleSiteMatches(item.siteUrl, siteOrigin))?.siteUrl
  const defaultAnalytics = selectedAnalytics ?? (analyticsProperties.length === 1 ? analyticsProperties[0].property : undefined)
  const canUpdate = !searchConsoleError || !analyticsError
  const selectedAnalyticsName = analyticsProperties.find((item) => item.property === selectedAnalytics)?.displayName

  useEffect(() => {
    if (state.success) dialogRef.current?.close()
  }, [state])

  return <>
    <section className="card stack">
      <div className="section-heading"><h2>使用するプロパティ</h2><span className="status-label">{selectedSearchConsole || selectedAnalytics ? "設定済み" : "未設定"}</span></div>
      <dl className="detail-grid">
        <div><dt>Search Console</dt><dd>{selectedSearchConsole ?? "使用しない"}</dd></div>
        <div><dt>Google Analytics 4</dt><dd>{selectedAnalyticsName ?? selectedAnalytics ?? "使用しない"}</dd></div>
      </dl>
      <button className="button secondary" type="button" onClick={() => dialogRef.current?.showModal()}>{selectedSearchConsole || selectedAnalytics ? "選択を変更" : "プロパティを選択"}</button>
      {state.success && <p className="status" role="status">{state.success}</p>}
    </section>
    <dialog className="property-dialog" ref={dialogRef} onClose={() => formRef.current?.reset()}>
      <form className="property-dialog-content stack" action={action} ref={formRef}>
        <input type="hidden" name="siteId" value={siteId} />
        <div className="section-heading"><div><h2>使用するプロパティを選択</h2><p className="muted">このサイトの分析に使用するデータ元を指定します。</p></div><button className="dialog-close" type="button" aria-label="閉じる" onClick={() => dialogRef.current?.close()}>×</button></div>
        <section className="stack"><h3>Search Console</h3>
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
        <section className="stack"><h3>Google Analytics 4</h3>
      {analyticsError ? <p className="error" role="alert">{analyticsError} 現在の選択は維持されます。</p> : <div className="goal-list">
        <label className="goal-card"><span><input type="radio" name="ga4Property" value="" defaultChecked={!defaultAnalytics} /> 使用しない</span></label>
        {analyticsProperties.map((item) => <label className="goal-card" key={item.property}>
          <span><input type="radio" name="ga4Property" value={item.property} defaultChecked={item.property === defaultAnalytics} /> <strong>{item.displayName}</strong></span>
          <span className="muted">{item.accountName} / {item.property}</span>
        </label>)}
      </div>}
        </section>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={() => dialogRef.current?.close()}>キャンセル</button>
          {canUpdate && <button className="button" disabled={pending}>{pending ? "確認・保存中…" : "選択したプロパティを保存"}</button>}
        </div>
      </form>
    </dialog>
  </>
}
