import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { GoogleDataConnect } from "@/components/google-data-connect"
import { db } from "@/lib/db"
import { account, site } from "@/lib/db/schema"
import { GOOGLE_DATA_SCOPES, loadGoogleProperties } from "@/lib/google-data"
import { searchConsoleSiteMatches } from "@/lib/google-property-match"
import { requireSession } from "@/lib/session"

export default async function GoogleIntegrationPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const current = await requireSession()
  const { siteId } = await params
  const query = await searchParams
  const [[registeredSite], [googleAccount]] = await Promise.all([
    db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1),
    db.select({ accountId: account.accountId, scope: account.scope }).from(account).where(and(eq(account.userId, current.user.id), eq(account.providerId, "google"))).limit(1),
  ])
  if (!registeredSite) notFound()

  const grantedScopes = new Set((googleAccount?.scope ?? "").split(/[ ,]+/).filter(Boolean))
  const connected = GOOGLE_DATA_SCOPES.every((scope) => grantedScopes.has(scope))
  let data: Awaited<ReturnType<typeof loadGoogleProperties>> | null = null
  let loadError: string | null = null
  if (googleAccount && connected) {
    try {
      data = await loadGoogleProperties(googleAccount.accountId, await headers())
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Google APIから情報を取得できませんでした。"
    }
  }

  return <div className="stack">
    <div><h2>Googleデータ連携</h2><p className="muted">Search ConsoleとGA4の読み取り専用データを、このサイトの目標計算に利用します。</p></div>
    <section className="card stack">
      <div className="section-heading"><h2>接続状態</h2><span className="status-label">{connected ? "接続済み" : "未接続"}</span></div>
      {query.error && <p className="error" role="alert">Googleとの接続を完了できませんでした。</p>}
      {loadError && <p className="error" role="alert">{loadError} 権限を再設定してください。</p>}
      <GoogleDataConnect siteId={siteId} connected={connected} />
    </section>
    {data && <>
      <section className="card stack"><h2>Search Console</h2>
        {data.searchConsoleError ? <p className="error" role="alert">{data.searchConsoleError}</p> : data.searchConsoleSites.length ? <div className="goal-list">{data.searchConsoleSites.map((item) => <div className="goal-card" key={item.siteUrl}>
          <div><strong>{item.siteUrl}</strong><p className="muted">権限: {item.permissionLevel}</p></div>
          {searchConsoleSiteMatches(item.siteUrl, registeredSite.normalizedOrigin) && <span className="status-label">登録サイトと一致</span>}
        </div>)}</div> : <p className="muted">利用可能なSearch Consoleプロパティがありません。</p>}
      </section>
      <section className="card stack"><h2>Google Analytics 4</h2>
        {data.analyticsError ? <p className="error" role="alert">{data.analyticsError}</p> : data.analyticsProperties.length ? <div className="goal-list">{data.analyticsProperties.map((item) => <div className="goal-card" key={item.property}>
          <strong>{item.displayName}</strong><p className="muted">{item.accountName} / {item.property}</p>
        </div>)}</div> : <p className="muted">利用可能なGA4プロパティがありません。</p>}
      </section>
    </>}
    <Link href={`/dashboard/sites/${siteId}/settings`}>サイト設定へ戻る</Link>
  </div>
}
