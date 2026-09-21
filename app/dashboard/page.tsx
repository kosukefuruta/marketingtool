import { asc, eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"
import { startCheckout } from "@/app/actions"
import { SignOutButton } from "@/components/sign-out-button"
import { db } from "@/lib/db"
import { site, subscription } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"
import { blocksNewCheckout } from "@/lib/subscription-access"
import { hasPaidAccess } from "@/lib/subscriptions"

export default async function DashboardPage() {
  const current = await requireSession()
  const registeredSites = await db.select().from(site).where(eq(site.userId, current.user.id)).orderBy(asc(site.createdAt))
  if (!registeredSites.length) redirect("/onboarding/site")
  const [plan] = await db.select().from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  const paid = hasPaidAccess(plan?.status, plan?.gracePeriodEndsAt)
  return <div className="stack">
    <div><h1>サイト一覧</h1><p className="muted">管理するサイトを選択してください。</p></div>
    <div className="section-heading"><h2>登録サイト</h2><span className="muted">{registeredSites.length}/3</span></div>
    <div className="grid">
      {registeredSites.map((registeredSite) => <section className="card stack" key={registeredSite.id}>
        <div><h2>{registeredSite.name}</h2><p className="muted url-text">{registeredSite.normalizedOrigin}</p></div>
        <Link className="button" href={`/dashboard/sites/${registeredSite.id}`}>このサイトを開く</Link>
      </section>)}
      {registeredSites.length < 3 && <section className="card"><h2>サイトを追加</h2><p>新しいサイトをプロジェクトとして登録します。</p><Link href="/settings/site">サイトを追加</Link></section>}
      <section className="card"><h2>契約</h2>{paid ? <><p>有料プランを利用中です。</p><Link href="/settings/billing">契約を管理</Link></> : blocksNewCheckout(plan?.status) ? <><p>契約の手続きが完了していません。契約設定から支払方法の更新または解約ができます。</p><Link href="/settings/billing">契約を管理</Link></> : <form className="stack" action={startCheckout}><p>SEO施策の管理を始めるには有料プランを契約してください。</p><button className="button">月額1,980円で始める</button></form>}</section>
    </div>
    <div><SignOutButton /></div>
  </div>
}
