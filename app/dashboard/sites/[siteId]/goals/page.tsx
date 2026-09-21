import { and, asc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { DeleteGoalForm } from "@/components/delete-goal-form"
import { GoalDriverTree } from "@/components/goal-driver-tree"
import { GoalCtaPageForm } from "@/components/goal-cta-page-form"
import { GoalForm } from "@/components/goal-form"
import { GoalKeyEventForm } from "@/components/goal-key-event-form"
import { GoalPageRpmForm } from "@/components/goal-page-rpm-form"
import { GoalScenarios } from "@/components/goal-scenarios"
import { db } from "@/lib/db"
import { account, goal, goalCtaPage, goalKeyEvent, site } from "@/lib/db/schema"
import { googleValueForGoal, loadGoogleGoalMetrics, loadGoogleKeyEvents, type AnalyticsKeyEvent, type GoalAnalyticsConfig } from "@/lib/google-data"
import { groupGoalKeyEvents, keyEventStagesForMetric } from "@/lib/goal-key-events"
import { buildGoalScenarios, getGoalBreakdown } from "@/lib/goal-breakdowns"
import { formatGoalValue, goalMetrics, goalSubjects, isGoalMetric, isGoalPeriod, isGoalSubject } from "@/lib/goals"
import { requireSession } from "@/lib/session"
import { isSiteCategory } from "@/lib/site-categories"

export default async function SiteGoalsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const current = await requireSession()
  const { siteId } = await params
  const [[registeredSite], goals, [googleAccount]] = await Promise.all([
    db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1),
    db.select().from(goal).where(and(eq(goal.siteId, siteId), eq(goal.userId, current.user.id))).orderBy(asc(goal.createdAt)),
    db.select({ accountId: account.accountId }).from(account).where(and(eq(account.userId, current.user.id), eq(account.providerId, "google"))).limit(1),
  ])
  if (!registeredSite) notFound()
  const savedKeyEvents = goals.length > 0
    ? await db.select().from(goalKeyEvent).where(inArray(goalKeyEvent.goalId, goals.map((item) => item.id)))
    : []
  const savedCtaPages = goals.length > 0
    ? await db.select().from(goalCtaPage).where(inArray(goalCtaPage.goalId, goals.map((item) => item.id))).orderBy(asc(goalCtaPage.createdAt))
    : []
  const analyticsGoalConfigs: GoalAnalyticsConfig[] = goals.flatMap((item) => {
    if (item.metric !== "conversions" && item.metric !== "paidContracts") return []
    const groupedEvents = groupGoalKeyEvents(savedKeyEvents.filter((entry) => entry.goalId === item.id))
    return [{
      goalId: item.id,
      metric: item.metric,
      ctaPaths: savedCtaPages.filter((entry) => entry.goalId === item.id).map((entry) => entry.path),
      conversionEvents: groupedEvents.conversion,
      freeRegistrationEvents: groupedEvents.free_registration,
      paidContractEvents: groupedEvents.paid_contract,
    }]
  })
  const siteCategory = registeredSite.category && isSiteCategory(registeredSite.category) ? registeredSite.category : null
  const rankingKeywords = goals.filter((item) => item.metric === "averagePosition" && item.subjectValue).map((item) => item.subjectValue!)
  let actuals: Awaited<ReturnType<typeof loadGoogleGoalMetrics>> | null = null
  let availableKeyEvents: AnalyticsKeyEvent[] = []
  let keyEventsError: string | null = null
  const canLoadActuals = goals.length > 0 && googleAccount && (registeredSite.searchConsoleProperty || registeredSite.ga4Property)
  const canLoadKeyEvents = googleAccount && registeredSite.ga4Property
  if (canLoadActuals || canLoadKeyEvents) {
    const requestHeaders = await headers()
    const [actualResult, keyEventsResult] = await Promise.allSettled([
      canLoadActuals
        ? loadGoogleGoalMetrics(googleAccount.accountId, requestHeaders, registeredSite.searchConsoleProperty, registeredSite.ga4Property, rankingKeywords, analyticsGoalConfigs)
        : Promise.resolve(null),
      canLoadKeyEvents
        ? loadGoogleKeyEvents(googleAccount.accountId, requestHeaders, registeredSite.ga4Property!)
        : Promise.resolve([] as AnalyticsKeyEvent[]),
    ])
    if (actualResult.status === "fulfilled") actuals = actualResult.value
    else {
      actuals = { values: {}, keywordValues: {}, observations: {}, goalValues: {}, goalObservations: {}, numericObservations: {}, errors: ["Googleの実測値を取得できませんでした。"], period: "" }
    }
    if (keyEventsResult.status === "fulfilled") availableKeyEvents = keyEventsResult.value
    else {
      keyEventsError = "GA4のキーイベントを取得できませんでした。Google連携を確認してください。"
    }
  }
  if (!canLoadKeyEvents) {
    keyEventsError = "GA4プロパティを接続するとキーイベントを選択できます。"
  }

  return <div className="stack">
    <div><h2>目標</h2><p className="muted">測定可能な目標を登録し、現在との差から必要な施策を逆算します。</p></div>
    {actuals && <section className="status"><strong>Google実測値</strong><div className="muted">対象期間: {actuals.period || "取得できませんでした"}</div>{actuals.errors.map((error) => <div className="error" key={error}>{error}</div>)}</section>}
    <details className={`goal-add ${goals.length ? "goal-add-collapsed" : "card"}`} open={goals.length === 0}>
      <summary>数値目標を追加</summary>
      <div className={goals.length ? "card goal-add-content" : "goal-add-content"}>
        <GoalForm site={{
          id: registeredSite.id,
          name: registeredSite.name,
          origin: registeredSite.normalizedOrigin,
          category: registeredSite.category && isSiteCategory(registeredSite.category) ? registeredSite.category : null,
        }} keyEvents={availableKeyEvents} keyEventsError={keyEventsError} />
      </div>
    </details>
    <section className="card stack">
      <div className="section-heading"><h2>登録済みの目標</h2><span className="muted">{goals.length}件</span></div>
      {goals.length ? <div className="goal-list">{goals.map((item) => {
        const metric = isGoalMetric(item.metric) ? item.metric : null
        const period = isGoalPeriod(item.period) ? item.period : null
        const subject = isGoalSubject(item.subjectType) ? item.subjectType : null
        const periodLabel = period === "monthly" ? "月間目標" : period === "weekly" ? "週間目標" : period === "daily" ? "日間目標" : "目標値"
        const breakdown = metric ? getGoalBreakdown(metric) : null
        const observations = { ...actuals?.observations, ...actuals?.goalObservations[item.id] }
        const scenarios = metric ? buildGoalScenarios(metric, item.targetValue, siteCategory, observations, actuals?.numericObservations, item.pageRpm) : []
        const currentValues = {
          ...actuals?.values,
          ...actuals?.goalValues[item.id],
          ...(item.pageRpm === null ? {} : { "page-rpm": { value: `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(item.pageRpm)}円/1,000PV`, detail: "手入力" } }),
        }
        const keywordActual = metric === "averagePosition" && item.subjectValue ? actuals?.keywordValues[item.subjectValue] : null
        const metricActual = metric ? googleValueForGoal(metric, actuals) : null
        const currentActual = keywordActual ?? actuals?.goalValues[item.id]?.["goal-total"] ?? metricActual
        const selectedKeyEvents = groupGoalKeyEvents(savedKeyEvents.filter((entry) => entry.goalId === item.id))
        const ctaPaths = savedCtaPages.filter((entry) => entry.goalId === item.id).map((entry) => entry.path)
        return <article className="goal-card stack" id={`goal-${item.id}`} key={item.id}>
          <h3>{item.name}</h3>
          <dl className="detail-grid">
            <div><dt>指標</dt><dd>{metric ? goalMetrics[metric].label : item.metric}</dd></div>
            {item.subjectValue && <div><dt>{subject ? goalSubjects[subject] : "対象"}</dt><dd>{item.subjectValue}</dd></div>}
            {(currentActual || item.baselineValue !== null) && <div><dt>現在値</dt><dd>{currentActual?.value ?? (metric ? formatGoalValue(metric, item.baselineValue!) : item.baselineValue)}</dd></div>}
            <div><dt>{periodLabel}</dt><dd><strong>{metric && goalMetrics[metric].direction === "decrease" ? "≤ " : "≥ "}{metric ? formatGoalValue(metric, item.targetValue) : item.targetValue}</strong></dd></div>
          </dl>
          {currentActual?.detail && <p className="muted">直近28日間: {currentActual.detail}</p>}
          {metric && keyEventStagesForMetric(metric).length > 0 && <GoalKeyEventForm siteId={siteId} goalId={item.id} metric={metric} available={availableKeyEvents} selected={selectedKeyEvents} loadError={keyEventsError} />}
          {metric && keyEventStagesForMetric(metric).length > 0 && <GoalCtaPageForm siteId={siteId} goalId={item.id} siteOrigin={registeredSite.normalizedOrigin} paths={ctaPaths} />}
          {metric === "adRevenue" && <GoalPageRpmForm siteId={siteId} goalId={item.id} pageRpm={item.pageRpm} />}
          {breakdown ? <div className="stack">
            <div><h4>目標のブレークダウン</h4><p className="goal-formula">{breakdown.formula}</p></div>
            <GoalDriverTree drivers={breakdown.drivers} currentValues={currentValues} />
          </div> : <p className="muted">この指標のブレークダウンはまだ定義されていません。</p>}
          {scenarios.length > 0 && <div className="stack">
            <div><h4>達成シナリオ</h4><p className="muted">CTA関連は計測設定ができるまで初期仮定を使います。取得できた割合やページRPMは、データ量に応じて実測へ補正します。</p></div>
            <GoalScenarios scenarios={scenarios} />
          </div>}
          <DeleteGoalForm goalId={item.id} goalName={item.name} siteId={siteId} />
        </article>
      })}</div> : <p className="muted">目標はまだ登録されていません。</p>}
    </section>
  </div>
}
