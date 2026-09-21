import { eq } from "drizzle-orm"
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
  const [registeredSite] = await db.select().from(site).where(eq(site.userId, current.user.id)).limit(1)
  if (!registeredSite) redirect("/onboarding/site")
  const [plan] = await db.select().from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  const paid = hasPaidAccess(plan?.status, plan?.gracePeriodEndsAt)
  return <div className="stack">
    <div><h1>ダッシュボード</h1><p className="muted">{current.user.email}</p></div>
    <div className="grid">
      <section className="card"><h2>登録サイト</h2><p><strong>{registeredSite.name}</strong></p><p>{registeredSite.normalizedOrigin}</p><Link href="/settings/site">サイト設定</Link></section>
      <section className="card"><h2>契約</h2>{paid ? <><p>有料プランを利用中です。</p><Link href="/settings/billing">契約を管理</Link></> : blocksNewCheckout(plan?.status) ? <><p>契約の手続きが完了していません。契約設定から支払方法の更新または解約ができます。</p><Link href="/settings/billing">契約を管理</Link></> : <form className="stack" action={startCheckout}><p>SEO施策の管理を始めるには有料プランを契約してください。</p><button className="button">月額1,980円で始める</button></form>}</section>
    </div>
    {paid && <section className="card"><h2>SEO施策管理</h2><p className="muted">次の実装で、施策の登録と進捗管理が利用できるようになります。</p></section>}
    <div><SignOutButton /></div>
  </div>
}
