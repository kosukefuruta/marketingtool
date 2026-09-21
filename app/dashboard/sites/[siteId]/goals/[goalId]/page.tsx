import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { GoalDriverTree } from "@/components/goal-driver-tree"
import { GoalKeyEventForm } from "@/components/goal-key-event-form"
import { GoalScenarios } from "@/components/goal-scenarios"
import { db } from "@/lib/db"
import { account, goal, goalKeyEvent, site } from "@/lib/db/schema"
import { googleValueForGoal, loadGoogleGoalMetrics, loadGoogleKeyEvents, type AnalyticsKeyEvent } from "@/lib/google-data"
import { groupGoalKeyEvents, keyEventStagesForMetric } from "@/lib/goal-key-events"
import { buildGoalScenarios, getGoalBreakdown } from "@/lib/goal-breakdowns"
import { formatGoalValue, goalMetrics, isGoalMetric } from "@/lib/goals"
import { requireSession } from "@/lib/session"
import { isSiteCategory, siteCategories } from "@/lib/site-categories"

export default async function GoalDetailPage({ params }: { params: Promise<{ siteId: string; goalId: string }> }) {
  const current = await requireSession()
  const { siteId, goalId } = await params
  const [[item], [registeredSite], [googleAccount], savedKeyEvents] = await Promise.all([
    db.select().from(goal).where(and(eq(goal.id, goalId), eq(goal.siteId, siteId), eq(goal.userId, current.user.id))).limit(1),
    db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1),
    db.select({ accountId: account.accountId }).from(account).where(and(eq(account.userId, current.user.id), eq(account.providerId, "google"))).limit(1),
    db.select().from(goalKeyEvent).where(eq(goalKeyEvent.goalId, goalId)),
  ])
  if (!item || !registeredSite || !isGoalMetric(item.metric)) notFound()

  const definition = goalMetrics[item.metric]
  const breakdown = getGoalBreakdown(item.metric)
  const category = registeredSite?.category && isSiteCategory(registeredSite.category) ? registeredSite.category : null
  let actuals: Awaited<ReturnType<typeof loadGoogleGoalMetrics>> | null = null
  let availableKeyEvents: AnalyticsKeyEvent[] = []
  let keyEventsError: string | null = null
  const canLoadActuals = googleAccount && (registeredSite.searchConsoleProperty || registeredSite.ga4Property)
  const canLoadKeyEvents = keyEventStagesForMetric(item.metric).length > 0 && googleAccount && registeredSite.ga4Property
  if (canLoadActuals || canLoadKeyEvents) {
    const requestHeaders = await headers()
    const keywords = item.metric === "averagePosition" && item.subjectValue ? [item.subjectValue] : []
    const [actualResult, keyEventsResult] = await Promise.allSettled([
      canLoadActuals
        ? loadGoogleGoalMetrics(googleAccount.accountId, requestHeaders, registeredSite.searchConsoleProperty, registeredSite.ga4Property, keywords)
        : Promise.resolve(null),
      canLoadKeyEvents
        ? loadGoogleKeyEvents(googleAccount.accountId, requestHeaders, registeredSite.ga4Property!)
        : Promise.resolve([] as AnalyticsKeyEvent[]),
    ])
    if (actualResult.status === "fulfilled") actuals = actualResult.value
    else {
      actuals = { values: {}, keywordValues: {}, observations: {}, numericObservations: {}, errors: ["Googleの実測値を取得できませんでした。"], period: "" }
    }
    if (keyEventsResult.status === "fulfilled") availableKeyEvents = keyEventsResult.value
    else {
      keyEventsError = "GA4のキーイベントを取得できませんでした。Google連携を確認してください。"
    }
  }
  if (keyEventStagesForMetric(item.metric).length > 0 && !canLoadKeyEvents) {
    keyEventsError = "GA4プロパティを接続するとキーイベントを選択できます。"
  }
  const scenarios = buildGoalScenarios(item.metric, item.targetValue, category, actuals?.observations, actuals?.numericObservations)
  const keywordActual = item.metric === "averagePosition" && item.subjectValue ? actuals?.keywordValues[item.subjectValue] : null
  const currentActual = keywordActual ?? googleValueForGoal(item.metric, actuals)
  return <div className="stack">
    <div><h2>{item.name}</h2><p className="muted">目標を数値ドライバーへ分解し、現在値との差から施策を考えます。</p></div>
    {actuals && <section className="status"><strong>Google実測値</strong><div className="muted">対象期間: {actuals.period || "取得できませんでした"}</div>{actuals.errors.map((error) => <div className="error" key={error}>{error}</div>)}</section>}
    <section className="card stack">
      <div className="section-heading"><h2>最終目標</h2><span className="status-label">フェーズ: {breakdown?.phase ?? "未定義"}</span></div>
      <div className="summary-grid">
        <div><span>指標</span><strong>{definition.label}</strong></div>
        <div><span>目標値</span><strong>{formatGoalValue(item.metric, item.targetValue)}</strong></div>
        <div><span>現在値</span><strong>{currentActual?.value ?? (item.baselineValue === null ? "未取得" : formatGoalValue(item.metric, item.baselineValue))}</strong></div>
      </div>
      {currentActual?.detail && <p className="muted">直近28日間: {currentActual.detail}</p>}
      {keyEventStagesForMetric(item.metric).length > 0 && <GoalKeyEventForm siteId={siteId} goalId={item.id} metric={item.metric} available={availableKeyEvents} selected={groupGoalKeyEvents(savedKeyEvents)} loadError={keyEventsError} />}
    </section>
    {breakdown ? <section className="card stack">
      <div><h2>目標のブレークダウン</h2><p className="goal-formula">{breakdown.formula}</p></div>
      <GoalDriverTree drivers={breakdown.drivers} currentValues={actuals?.values} />
      <p className="muted">各データ元を連携すると現在値を取得し、目標達成に必要な値と優先する施策を計算します。</p>
    </section> : <section className="card"><h2>目標のブレークダウン</h2><p className="muted">この指標のブレークダウンはまだ定義されていません。</p></section>}
    {scenarios.length > 0 && <section className="card stack">
      <div><h2>達成シナリオ</h2><p className="muted">CTA関連は計測設定ができるまで初期仮定を使います。取得できた割合やページRPMは、データ量に応じて実測へ補正します。</p></div>
      {category && item.metric === "adRevenue" && <p>サイトジャンル: <strong>{siteCategories[category].label}</strong></p>}
      <GoalScenarios scenarios={scenarios} />
    </section>}
    {item.metric === "adRevenue" && !category && <section className="card stack">
      <div><h2>サイトジャンルが必要です</h2><p className="muted">ジャンル別のページRPMから必要PVを計算します。</p></div>
      <Link className="button" href={`/dashboard/sites/${siteId}/settings`}>サイトジャンルを設定</Link>
    </section>}
    <Link href={`/dashboard/sites/${siteId}/goals`}>目標一覧へ戻る</Link>
  </div>
}
