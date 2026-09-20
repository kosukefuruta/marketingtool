import { eq } from "drizzle-orm"
import { openBillingPortal } from "@/app/actions"
import { db } from "@/lib/db"
import { subscription } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function BillingSettingsPage() {
  const current = await requireSession()
  const [plan] = await db.select().from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  return <section className="card narrow stack"><h1>契約設定</h1>
    <p>状態: <strong>{plan?.status ?? "未契約"}</strong></p>
    {plan?.currentPeriodEnd && <p>現在の契約期間: {plan.currentPeriodEnd.toLocaleDateString("ja-JP")}まで</p>}
    {plan?.cancelAtPeriodEnd && <p>期間終了時に解約されます。</p>}
    {plan && <form action={openBillingPortal}><button className="button">支払方法・解約を管理</button></form>}
  </section>
}
