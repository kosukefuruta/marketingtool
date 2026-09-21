import { asc, eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"
import { DeleteGoalForm } from "@/components/delete-goal-form"
import { GoalForm } from "@/components/goal-form"
import { db } from "@/lib/db"
import { goal, site } from "@/lib/db/schema"
import { formatGoalValue, goalMetrics, goalPeriods, goalSubjects, isGoalMetric, isGoalPeriod, isGoalSubject } from "@/lib/goals"
import { requireSession } from "@/lib/session"

export default async function GoalsPage() {
  const current = await requireSession()
  const [sites, goals] = await Promise.all([
    db.select().from(site).where(eq(site.userId, current.user.id)).orderBy(asc(site.createdAt)),
    db.select().from(goal).where(eq(goal.userId, current.user.id)).orderBy(asc(goal.createdAt)),
  ])
  if (!sites.length) redirect("/onboarding/site")
  const siteById = new Map(sites.map((item) => [item.id, item]))

  return <div className="stack">
    <div><h1>目標</h1><p className="muted">測定可能な目標を登録し、現在との差から必要な施策を逆算します。</p></div>
    <section className="card stack">
      <h2>数値目標を追加</h2>
      <GoalForm sites={sites.map((item) => ({ id: item.id, name: item.name, origin: item.normalizedOrigin }))} />
    </section>
    <section className="card stack">
      <div className="section-heading"><h2>登録済みの目標</h2><span className="muted">{goals.length}件</span></div>
      {goals.length ? <div className="goal-list">{goals.map((item) => {
        const metric = isGoalMetric(item.metric) ? item.metric : null
        const period = isGoalPeriod(item.period) ? item.period : null
        const subject = isGoalSubject(item.subjectType) ? item.subjectType : null
        const siteRow = siteById.get(item.siteId)
        return <article className="goal-card" key={item.id}>
          <div><p className="muted">{siteRow?.name ?? "削除済みサイト"}</p><h3>{item.name}</h3></div>
          <dl className="detail-grid">
            <div><dt>指標</dt><dd>{metric ? goalMetrics[metric].label : item.metric}</dd></div>
            <div><dt>対象</dt><dd>{subject ? goalSubjects[subject] : item.subjectType}{item.subjectValue ? `: ${item.subjectValue}` : ""}</dd></div>
            <div><dt>現在値</dt><dd>{item.baselineValue === null ? "未入力" : metric ? formatGoalValue(metric, item.baselineValue) : item.baselineValue}</dd></div>
            <div><dt>目標値</dt><dd><strong>{metric && goalMetrics[metric].direction === "decrease" ? "≤ " : "≥ "}{metric ? formatGoalValue(metric, item.targetValue) : item.targetValue}</strong></dd></div>
            <div><dt>集計期間</dt><dd>{period ? goalPeriods[period] : item.period}</dd></div>
          </dl>
          <DeleteGoalForm goalId={item.id} goalName={item.name} />
        </article>
      })}</div> : <p className="muted">目標はまだ登録されていません。</p>}
    </section>
    <Link href="/dashboard">ダッシュボードへ戻る</Link>
  </div>
}
