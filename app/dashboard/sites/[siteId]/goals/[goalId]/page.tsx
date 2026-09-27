import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { GoalDriverTree } from "@/components/goal-driver-tree"
import { GoalEditForm } from "@/components/goal-edit-form"
import { GoalCtaPageForm } from "@/components/goal-cta-page-form"
import { GoalKeyEventForm } from "@/components/goal-key-event-form"
import { GoalPageRpmForm } from "@/components/goal-page-rpm-form"
import { GoalProgressBar } from "@/components/goal-progress-bar"
import { GoalScenarios } from "@/components/goal-scenarios"
import { db } from "@/lib/db"
import { account, goal, goalCtaPage, goalKeyEvent, site } from "@/lib/db/schema"
import { googleValueForGoal, loadGoogleGoalMetrics, loadGoogleKeyEvents, type AnalyticsKeyEvent, type GoalAnalyticsConfig } from "@/lib/google-data"
import { groupGoalKeyEvents, keyEventStagesForMetric } from "@/lib/goal-key-events"
import { assumedDriverValues, buildGoalScenarios, getGoalBreakdown, isScenarioId, measuredDriverAmounts, requiredDriverValues, type DriverValue, type ScenarioId } from "@/lib/goal-breakdowns"
import { formatGoalValue, goalMetrics, isGoalMetric } from "@/lib/goals"
import { goalPeriodComparison, goalProgress } from "@/lib/goal-progress"
import { requireSession } from "@/lib/session"
import { isSiteCategory, siteCategories } from "@/lib/site-categories"

const scenarioChoices = [
  { id: "conservative", label: "慎重", description: "率が現状の下振れで推移する前提。必要な流入が最も多くなる。" },
  { id: "standard", label: "標準", description: "率が現在の推定水準で推移する前提。" },
  { id: "optimistic", label: "好調", description: "率を上振れまで改善する前提。必要な流入は減るが、率を上げる施策が要る。" },
] as const

export default async function GoalDetailPage({ params, searchParams }: { params: Promise<{ siteId: string; goalId: string }>; searchParams: Promise<{ scenario?: string }> }) {
  const current = await requireSession()
  const { siteId, goalId } = await params
  const requestedScenario = (await searchParams).scenario ?? ""
  const scenario: ScenarioId = isScenarioId(requestedScenario) ? requestedScenario : "standard"
  const [[item], [registeredSite], [googleAccount], savedKeyEvents, savedCtaPages] = await Promise.all([
    db.select().from(goal).where(and(eq(goal.id, goalId), eq(goal.siteId, siteId), eq(goal.userId, current.user.id))).limit(1),
    db.select().from(site).where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1),
    db.select({ accountId: account.accountId }).from(account).where(and(eq(account.userId, current.user.id), eq(account.providerId, "google"))).limit(1),
    db.select().from(goalKeyEvent).where(eq(goalKeyEvent.goalId, goalId)),
    db.select().from(goalCtaPage).where(eq(goalCtaPage.goalId, goalId)).orderBy(asc(goalCtaPage.createdAt)),
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
    const groupedEvents = groupGoalKeyEvents(savedKeyEvents)
    const analyticsGoalConfigs: GoalAnalyticsConfig[] = item.metric === "conversions" || item.metric === "paidContracts" ? [{
      goalId: item.id,
      metric: item.metric,
      ctaPaths: savedCtaPages.map((entry) => entry.path),
      conversionEvents: groupedEvents.conversion,
      freeRegistrationEvents: groupedEvents.free_registration,
      paidContractEvents: groupedEvents.paid_contract,
    }] : []
    const [actualResult, keyEventsResult] = await Promise.allSettled([
      canLoadActuals
        ? loadGoogleGoalMetrics(googleAccount.accountId, requestHeaders, registeredSite.searchConsoleProperty, registeredSite.ga4Property, keywords, analyticsGoalConfigs)
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
  if (keyEventStagesForMetric(item.metric).length > 0 && !canLoadKeyEvents) {
    keyEventsError = "GA4プロパティを接続するとキーイベントを選択できます。"
  }
  const observations = { ...actuals?.observations, ...actuals?.goalObservations[item.id] }
  const scenarios = buildGoalScenarios(item.metric, item.targetValue, category, observations, actuals?.numericObservations, item.pageRpmRevenue, item.pageRpmPageviews)
  const currentValues: Record<string, DriverValue> = {
    ...assumedDriverValues(item.metric, category, observations, actuals?.numericObservations, item.pageRpmRevenue, item.pageRpmPageviews),
    ...actuals?.values,
    ...actuals?.goalValues[item.id],
    ...(item.pageRpmRevenue === null || item.pageRpmPageviews === null ? {} : { "page-rpm": { value: `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(item.pageRpmRevenue / item.pageRpmPageviews * 1000)}円/1,000PV`, detail: `広告収益 ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(item.pageRpmRevenue)}円 / ${new Intl.NumberFormat("ja-JP").format(item.pageRpmPageviews)}PV`, amount: item.pageRpmRevenue / item.pageRpmPageviews * 1000 } }),
  }
  const keywordActual = item.metric === "averagePosition" && item.subjectValue ? actuals?.keywordValues[item.subjectValue] : null
  const currentActual = keywordActual ?? actuals?.goalValues[item.id]?.["goal-total"] ?? googleValueForGoal(item.metric, actuals)
  const measuredAmounts = measuredDriverAmounts(currentValues)
  const comparison = goalPeriodComparison(item.period)
  // 実測はGoogleの直近28日分なので、最終目標と同じ期間の判定に従う。
  const requirements = comparison.comparable
    ? requiredDriverValues(item.metric, item.targetValue, category, observations, actuals?.numericObservations, item.pageRpmRevenue, item.pageRpmPageviews, measuredAmounts, scenario)
    : {}
  const progress = comparison.comparable ? goalProgress(item.metric, currentActual?.amount, item.targetValue) : null
  const phase = actuals?.goalObservations[item.id] && Object.keys(actuals.goalObservations[item.id]).length > 0 ? "実測補正中" : breakdown?.phase ?? "未定義"
  return <div className="stack">
    <div><h2>{item.name}</h2><p className="muted">目標を数値ドライバーへ分解し、現在値との差から施策を考えます。</p></div>
    {actuals && <section className="status"><strong>Google実測値</strong><div className="muted">対象期間: {actuals.period || "取得できませんでした"}</div>{actuals.errors.map((error) => <div className="error" key={error}>{error}</div>)}</section>}
    <section className="card stack">
      <div className="section-heading"><h2>最終目標</h2><span className="status-label">フェーズ: {phase}</span></div>
      <div className="summary-grid">
        <div><span>指標</span><strong>{definition.label}</strong></div>
        <div><span>目標値</span><strong>{formatGoalValue(item.metric, item.targetValue)}</strong></div>
        <div><span>現在値</span><strong>{currentActual?.value ?? (item.baselineValue === null ? "未取得" : formatGoalValue(item.metric, item.baselineValue))}</strong></div>
      </div>
      {currentActual?.detail && <p className="muted">直近28日間: {currentActual.detail}</p>}
      {progress && <GoalProgressBar progress={progress} note={comparison.comparable ? comparison.note ?? undefined : undefined} />}
      {!comparison.comparable && currentActual?.amount !== undefined && <p className="muted">{comparison.reason}</p>}
      <GoalEditForm siteId={siteId} goal={{ id: item.id, metric: item.metric, subjectValue: item.subjectValue, targetValue: item.targetValue }} siteCategory={category} />
      {keyEventStagesForMetric(item.metric).length > 0 && <GoalKeyEventForm siteId={siteId} goalId={item.id} metric={item.metric} available={availableKeyEvents} selected={groupGoalKeyEvents(savedKeyEvents)} loadError={keyEventsError} />}
      {keyEventStagesForMetric(item.metric).length > 0 && <GoalCtaPageForm siteId={siteId} goalId={item.id} siteOrigin={registeredSite.normalizedOrigin} paths={savedCtaPages.map((entry) => entry.path)} />}
      {item.metric === "adRevenue" && <GoalPageRpmForm siteId={siteId} goalId={item.id} legacyPageRpm={item.pageRpm} pageRpmRevenue={item.pageRpmRevenue} pageRpmPageviews={item.pageRpmPageviews} />}
    </section>
    {breakdown ? <section className="card stack">
      <div><h2>目標のブレークダウン</h2><p className="goal-formula">{breakdown.formula}</p>
        <div className="scenario-picker">
          <span className="muted">目指す状態</span>
          {scenarioChoices.map((choice) => choice.id === scenario
            ? <strong key={choice.id}>{choice.label}</strong>
            : <Link href={`/dashboard/sites/${siteId}/goals/${goalId}?scenario=${choice.id}`} key={choice.id}>{choice.label}</Link>)}
        </div>
        <p className="muted">{scenarioChoices.find((choice) => choice.id === scenario)?.description}</p>
        {comparison.comparable
          ? comparison.note && <p className="muted">必要値との差分も{comparison.note}</p>
          : <p className="muted">{comparison.reason}必要値との差分は表示していません。</p>}
      </div>
      <GoalDriverTree drivers={breakdown.drivers} currentValues={currentValues} requirements={requirements} />
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
