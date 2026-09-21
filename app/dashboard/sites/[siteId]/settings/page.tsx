import { and, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import Link from "next/link"
import { DeleteSiteForm } from "@/components/delete-site-form"
import { SiteForm } from "@/components/site-form"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"
import { isSiteCategory } from "@/lib/site-categories"

export default async function SiteSettingsPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ error?: string }> }) {
  const current = await requireSession()
  const { siteId } = await params
  const query = await searchParams
  const [registeredSite] = await db.select().from(site)
    .where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1)
  if (!registeredSite) notFound()

  return <div className="stack">
    <section className="card stack">
      <div><h2>サイト設定</h2><p className="muted">サイト名を変更できます。サイトURLは変更できません。</p></div>
      <SiteForm siteId={registeredSite.id} submitLabel="変更を保存" defaultName={registeredSite.name} defaultUrl={registeredSite.normalizedOrigin} defaultCategory={registeredSite.category && isSiteCategory(registeredSite.category) ? registeredSite.category : null} />
    </section>
    <section className="card stack">
      <div><h2>データ連携</h2><p className="muted">Search ConsoleとGA4から目標の現在値を取得します。</p></div>
      <Link href={`/dashboard/sites/${siteId}/integrations/google`}>Google連携を設定</Link>
    </section>
    <section className="card danger-zone stack">
      <div><h2>サイトを削除</h2><p className="muted">このサイトに紐づく目標と診断履歴もすべて削除され、元に戻せません。</p></div>
      {query.error === "audit-running" && <p className="error" role="alert">診断中のため削除できません。診断完了後にもう一度お試しください。</p>}
      <DeleteSiteForm siteId={registeredSite.id} siteName={registeredSite.name} />
    </section>
  </div>
}
