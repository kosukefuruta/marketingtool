"use client"

import { useActionState, useEffect, useRef } from "react"
import { deleteSiteKeyword, refreshSiteKeywordPageDates, saveKeywordTestPeriod, saveSiteKeywords, updateSiteKeyword, type SiteKeywordFormState } from "@/app/actions"

export function SiteKeywordBulkForm({ siteId, siteOrigin }: { siteId: string; siteOrigin: string }) {
  const [state, action, pending] = useActionState<SiteKeywordFormState, FormData>(saveSiteKeywords, {})
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return <form className="stack" action={action} ref={formRef}>
    <input type="hidden" name="siteId" value={siteId} />
    <label className="field">狙うキーワード（1行に1つ。記事のURLはタブ区切りか行末に書く）
      <textarea name="keywords" rows={6} placeholder={`youtube 収益化 条件\t${siteOrigin}/guides/youtube/\nyoutube スパチャ ${siteOrigin}/guides/super-chat/\nyoutube メンバーシップ`} />
      <small className="muted">スプレッドシートの2列（キーワード・URL）をそのまま貼り付けられます。登録済みのキーワードを貼り直すと、URLを書いた行だけ割り当てを上書きします。</small>
    </label>
    <div><button className="button" disabled={pending}>{pending ? "登録中…（記事の日付も取得しています）" : "キーワードを登録"}</button></div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}

export function SiteKeywordEditor({ siteId, keywordId, keyword, pageUrl, memo }: { siteId: string; keywordId: string; keyword: string; pageUrl: string; memo: string }) {
  const [state, action, pending] = useActionState<SiteKeywordFormState, FormData>(updateSiteKeyword, {})
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (state.success && detailsRef.current) detailsRef.current.open = false
  }, [state.success])

  return <details className="goal-inline-editor" ref={detailsRef}>
    <summary>変更</summary>
    <div className="stack goal-inline-editor-content">
      <form className="stack" action={action}>
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="keywordId" value={keywordId} />
        <label className="field">記事のURL（空にすると割り当てを外す）
          <input name="pageUrl" defaultValue={pageUrl} />
        </label>
        <label className="field">メモ
          <textarea name="memo" rows={2} defaultValue={memo} />
        </label>
        <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "保存"}</button></div>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
      <form action={deleteSiteKeyword} onSubmit={(event) => {
        if (!window.confirm(`キーワード「${keyword}」を削除しますか？`)) event.preventDefault()
      }}>
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="keywordId" value={keywordId} />
        <button className="text-button" type="submit">このキーワードを削除</button>
      </form>
    </div>
  </details>
}

export function SitePageDatesRefreshForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState<SiteKeywordFormState, FormData>(refreshSiteKeywordPageDates, {})
  return <form className="stack" action={action}>
    <input type="hidden" name="siteId" value={siteId} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button secondary" name="mode" value="missing" disabled={pending}>{pending ? "取得中…" : "未取得の日付を取得"}</button>
      <button className="button secondary" name="mode" value="all" disabled={pending}>すべて取り直す</button>
    </div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="status" role="status">{state.success}</p>}
  </form>
}

export function KeywordTestPeriodForm({ siteId, days }: { siteId: string; days: number }) {
  const [state, action, pending] = useActionState<SiteKeywordFormState, FormData>(saveKeywordTestPeriod, {})
  return <details className="goal-inline-editor">
    <summary>テスト期間を変更（いまは{days}日）</summary>
    <form className="stack goal-inline-editor-content" action={action}>
      <input type="hidden" name="siteId" value={siteId} />
      <label className="field">公開日から何日目までをテスト期間とするか
        <input name="testPeriodDays" type="number" min={1} max={90} defaultValue={days} />
        <small className="muted">テスト期間中の数字も表示しますが、評価にはそれ以降の数字を使います。</small>
      </label>
      <div><button className="button secondary" disabled={pending}>{pending ? "保存中…" : "保存"}</button></div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.success && <p className="status" role="status">{state.success}</p>}
    </form>
  </details>
}
