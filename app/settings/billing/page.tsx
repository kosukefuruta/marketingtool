import type Stripe from "stripe"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { resumeSubscription, scheduleCancellation, startCardUpdate } from "@/app/actions"
import { BillingStatusRefresh } from "@/components/billing-status-refresh"
import { db } from "@/lib/db"
import { subscription, user } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"
import { getStripe } from "@/lib/stripe"
import { hasPaidAccess } from "@/lib/subscriptions"

// Stripe rejects a cancellation change once the subscription itself has ended.
const CANCELABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "canceling"])

const STATUS_LABELS: Record<string, string> = {
  active: "利用中",
  trialing: "無料期間中",
  canceling: "解約予定",
  past_due: "支払いを確認できません",
  canceled: "解約済み",
  unpaid: "未払い",
  incomplete: "手続き中",
  incomplete_expired: "手続きが完了しませんでした",
}

function formatAmount(amount: number, currency: string): string {
  const value = currency === "jpy" ? amount : amount / 100
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: currency.toUpperCase() }).format(value)
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })
}

function cardLabel(paymentMethod: Stripe.PaymentMethod | null): string | null {
  const card = paymentMethod?.card
  if (!card) return null
  return `${card.brand.toUpperCase()} •••• ${card.last4}（有効期限 ${card.exp_month}/${card.exp_year}）`
}

type StripeDetails = { card: string | null; invoices: Stripe.Invoice[] }

async function loadStripeDetails(customerId: string): Promise<StripeDetails | null> {
  const stripe = getStripe()
  try {
    const [customer, invoices, subscriptions] = await Promise.all([
      stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] }),
      stripe.invoices.list({ customer: customerId, limit: 12 }),
      // Checkout stores the card on the subscription, so the customer default can still be empty here.
      stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1, expand: ["data.default_payment_method"] }),
    ])
    const customerDefault = customer.deleted ? null : customer.invoice_settings?.default_payment_method
    const subscriptionDefault = subscriptions.data[0]?.default_payment_method
    const method = [customerDefault, subscriptionDefault].find((value) => value && typeof value !== "string")
    return { card: method && typeof method !== "string" ? cardLabel(method) : null, invoices: invoices.data }
  } catch (error) {
    // Stripe being unreachable must not hide the contract state or the cancel button.
    console.error("[billing] could not load Stripe details", { message: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export default async function BillingSettingsPage({ searchParams }: {
  searchParams: Promise<{ card?: string; pending?: string }>
}) {
  const current = await requireSession()
  const params = await searchParams
  const [plan] = await db.select().from(subscription).where(eq(subscription.userId, current.user.id)).limit(1)
  const [account] = await db.select({ stripeCustomerId: user.stripeCustomerId }).from(user)
    .where(eq(user.id, current.user.id)).limit(1)

  const details = account?.stripeCustomerId ? await loadStripeDetails(account.stripeCustomerId) : null
  const paid = hasPaidAccess(plan?.status, plan?.gracePeriodEndsAt)
  const waiting = params.pending === "cancel" ? !plan?.cancelAtPeriodEnd
    : params.pending === "resume" ? Boolean(plan?.cancelAtPeriodEnd)
    : false

  return <div className="stack">
    <h1>契約設定</h1>

    {params.card === "success" && <p className="status" role="status">新しい支払方法を受け付けました。反映まで数秒かかることがあります。</p>}
    {params.card === "canceled" && <p className="muted">支払方法の変更を中止しました。</p>}
    {waiting && <BillingStatusRefresh withNotice />}

    <section className="card stack">
      <h2>契約状態</h2>
      {plan ? <>
        <p>状態: <strong>{STATUS_LABELS[plan.status] ?? plan.status}</strong></p>
        {plan.currentPeriodEnd && <p>{plan.cancelAtPeriodEnd ? "利用できるのは" : "次回の請求日は"} {formatDate(plan.currentPeriodEnd)}{plan.cancelAtPeriodEnd ? "までです。" : "です。"}</p>}
        {plan.status === "past_due" && plan.gracePeriodEndsAt && <p className="error">支払いを確認できませんでした。{formatDate(plan.gracePeriodEndsAt)}までに支払方法を更新してください。</p>}
        {CANCELABLE_STATUSES.has(plan.status) && (plan.cancelAtPeriodEnd
          ? <form action={resumeSubscription}><button className="button">解約予約を取り消す</button></form>
          : <form action={scheduleCancellation}><button className="button secondary">期間終了時に解約する</button></form>)}
        {!CANCELABLE_STATUSES.has(plan.status) && <Link href="/dashboard">ダッシュボードから再契約する</Link>}
      </> : <>
        <p>現在ご契約はありません。</p>
        <Link href="/dashboard">ダッシュボードから申し込む</Link>
      </>}
    </section>

    {account?.stripeCustomerId && <section className="card stack">
      <h2>支払方法</h2>
      <p>{details?.card ?? "登録されているカードはありません。"}</p>
      <form action={startCardUpdate}><button className="button secondary">支払方法を変更</button></form>
      <p className="muted">カード情報はStripeの画面で入力します。Owtellはカード番号を受け取りません。</p>
    </section>}

    {details && details.invoices.length > 0 && <section className="card stack">
      <h2>請求履歴</h2>
      <table><thead><tr><th>日付</th><th>金額</th><th>状態</th><th>領収書</th></tr></thead>
        <tbody>{details.invoices.map((invoice) => <tr key={invoice.id}>
          <td>{formatDate(new Date(invoice.created * 1000))}</td>
          <td>{formatAmount(invoice.total, invoice.currency)}</td>
          <td>{invoice.status === "paid" ? "支払い済み" : invoice.status === "open" ? "未払い" : invoice.status}</td>
          <td>{invoice.hosted_invoice_url ? <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">表示</a> : "—"}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    <Link href="/dashboard">ダッシュボードへ戻る</Link>
  </div>
}
