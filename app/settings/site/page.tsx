import { asc, eq } from "drizzle-orm"
import Link from "next/link"
import { SiteForm } from "@/components/site-form"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteSettingsPage() {
  const current = await requireSession()
  const sites = await db.select().from(site).where(eq(site.userId, current.user.id)).orderBy(asc(site.createdAt))
  return <div className="stack"><div><h1>サイト設定</h1><p className="muted">最大3サイトまで登録できます。</p></div>
    <div className="grid">{sites.map((registeredSite) => <section className="card stack" key={registeredSite.id}>
      <div><h2>{registeredSite.name}</h2><p className="muted url-text">{registeredSite.normalizedOrigin}</p></div>
      <Link href={`/dashboard/sites/${registeredSite.id}/settings`}>サイト設定を開く</Link>
    </section>)}</div>
    {sites.length < 3 && <section className="card stack"><h2>サイトを追加</h2><SiteForm submitLabel="サイトを追加" nameOptional /></section>}
  </div>
}
