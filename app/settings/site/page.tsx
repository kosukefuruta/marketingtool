import { eq } from "drizzle-orm"
import { SiteForm } from "@/components/site-form"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteSettingsPage() {
  const current = await requireSession()
  const [registeredSite] = await db.select().from(site).where(eq(site.userId, current.user.id)).limit(1)
  return <section className="card narrow stack"><h1>サイト設定</h1>
    <SiteForm submitLabel="保存" defaultName={registeredSite?.name ?? ""} defaultUrl={registeredSite?.normalizedOrigin ?? ""} />
  </section>
}
