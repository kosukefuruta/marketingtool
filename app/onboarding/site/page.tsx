import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { saveSite } from "@/app/actions"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteOnboardingPage() {
  const current = await requireSession()
  const [existing] = await db.select().from(site).where(eq(site.userId, current.user.id)).limit(1)
  if (existing) redirect("/dashboard")
  return <section className="card narrow stack">
    <div><p className="muted">初期設定 1/2</p><h1>サイトを登録</h1><p>SEO施策を管理する自社サイトを登録してください。</p></div>
    <form className="stack" action={saveSite}>
      <label className="field">サイト名（任意）<input name="name" placeholder="株式会社Owtell" /></label>
      <label className="field">サイトURL<input name="url" type="url" placeholder="https://example.com" required /></label>
      <button className="button">登録して次へ</button>
    </form>
  </section>
}
