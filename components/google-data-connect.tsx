"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"

const GOOGLE_DATA_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
]

export function GoogleDataConnect({ siteId, connected }: { siteId: string; connected: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    setLoading(true); setError(null)
    try {
      const result = await authClient.linkSocial({
        provider: "google",
        callbackURL: `/dashboard/sites/${siteId}/integrations/google`,
        errorCallbackURL: `/dashboard/sites/${siteId}/integrations/google?error=oauth`,
        scopes: GOOGLE_DATA_SCOPES,
      })
      if (result.error) throw new Error(result.error.message ?? "Google連携を開始できませんでした。")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google連携を開始できませんでした。")
      setLoading(false)
    }
  }

  return <div className="stack">
    <button className="button" type="button" disabled={loading} onClick={connect}>{loading ? "Googleへ移動中…" : connected ? "Google権限を再設定" : "Googleと接続"}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>
}
