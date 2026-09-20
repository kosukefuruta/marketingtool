import { eq } from "drizzle-orm"
import { saveSite } from "@/app/actions"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteSettingsPage() {
  const current = await requireSession()
  const [registeredSite] = await db.select().from(site).where(eq(site.userId, current.user.id)).limit(1)
  return <section className="card narrow stack"><h1>サイト設定</h1><form className="stack" action={saveSite}>
    <label className="field">サイト名<input name="name" defaultValue={registeredSite?.name ?? ""} /></label>
    <label className="field">サイトURL<input name="url" type="url" defaultValue={registeredSite?.normalizedOrigin ?? ""} required /></label>
    <button className="button">保存</button>
  </form></section>
}
