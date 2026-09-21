import { asc, eq } from "drizzle-orm"
import { SiteForm } from "@/components/site-form"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteSettingsPage() {
  const current = await requireSession()
  const sites = await db.select().from(site).where(eq(site.userId, current.user.id)).orderBy(asc(site.createdAt))
  return <div className="stack"><div><h1>サイト設定</h1><p className="muted">最大3サイトまで登録できます。</p></div>
    <div className="grid">{sites.map((registeredSite) => <section className="card stack" key={registeredSite.id}>
      <h2>{registeredSite.name}</h2>
      <SiteForm siteId={registeredSite.id} submitLabel="変更を保存" defaultName={registeredSite.name} defaultUrl={registeredSite.normalizedOrigin} />
    </section>)}</div>
    {sites.length < 3 && <section className="card narrow stack"><h2>サイトを追加</h2><SiteForm submitLabel="サイトを追加" nameOptional /></section>}
  </div>
}
