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
    <div><h1>ダッシュボード</h1><p className="muted">{current.user.email}</p></div>
    <div className="grid">
      <section className="card stack"><div className="section-heading"><h2>登録サイト</h2><span className="muted">{registeredSites.length}/3</span></div>
        {registeredSites.map((registeredSite) => <div key={registeredSite.id}><strong>{registeredSite.name}</strong><span className="table-secondary">{registeredSite.normalizedOrigin}</span><Link href={`/dashboard/audit?siteId=${registeredSite.id}`}>このサイトを分析</Link></div>)}
        <Link href="/settings/site">サイト設定</Link>
      </section>
      <section className="card"><h2>目標と改善計画</h2><p>現在値と数値目標を登録し、達成に必要な施策を管理します。</p><Link href="/dashboard/goals">目標を設定</Link></section>
      <section className="card"><h2>契約</h2>{paid ? <><p>有料プランを利用中です。</p><Link href="/settings/billing">契約を管理</Link></> : blocksNewCheckout(plan?.status) ? <><p>契約の手続きが完了していません。契約設定から支払方法の更新または解約ができます。</p><Link href="/settings/billing">契約を管理</Link></> : <form className="stack" action={startCheckout}><p>SEO施策の管理を始めるには有料プランを契約してください。</p><button className="button">月額1,980円で始める</button></form>}</section>
    </div>
    {paid && <section className="card"><h2>SEO施策管理</h2><p className="muted">登録した数値目標から、施策候補と実行順序を導き出す機能を順次追加します。</p></section>}
    <div><SignOutButton /></div>
  </div>
}
