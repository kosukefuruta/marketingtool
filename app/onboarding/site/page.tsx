import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { SiteForm } from "@/components/site-form"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteOnboardingPage() {
  const current = await requireSession()
  const [existing] = await db.select().from(site).where(eq(site.userId, current.user.id)).limit(1)
  if (existing) redirect("/dashboard")
  return <section className="card narrow stack">
    <div><p className="muted">初期設定 1/2</p><h1>サイトを登録</h1><p>SEO施策を管理する自社サイトを登録してください。</p></div>
    <SiteForm submitLabel="登録して次へ" nameOptional />
  </section>
}
