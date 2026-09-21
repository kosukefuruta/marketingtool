import { goalKeyEventStages, keyEventFieldName, manualKeyEventFieldName, type GoalKeyEventStage } from "@/lib/goal-key-events"
import type { AnalyticsKeyEvent } from "@/lib/google-data"

export function KeyEventFields({ stages, available, selected = {}, loadError }: {
  stages: GoalKeyEventStage[]
  available: AnalyticsKeyEvent[]
  selected?: Partial<Record<GoalKeyEventStage, string[]>>
  loadError?: string | null
}) {
  const availableNames = new Set(available.map((item) => item.eventName))
  return <>{stages.map((stage) => {
    const selectedNames = selected[stage] ?? []
    const options = [...available.map((item) => item.eventName)]
    for (const eventName of selectedNames) if (!options.includes(eventName)) options.push(eventName)
    return <fieldset className="field checkbox-group" key={stage}>
      <legend>{goalKeyEventStages[stage].label}（複数選択可・最大20件）</legend>
      {options.length > 0 ? options.map((eventName) => <label key={eventName}>
        <input type="checkbox" name={keyEventFieldName(stage)} value={eventName} defaultChecked={selectedNames.includes(eventName)} />
        <span>{eventName} <small className={availableNames.has(eventName) ? "status-label" : "muted"}>{availableNames.has(eventName) ? "GA4確認済み" : "GA4未確認"}</small></span>
      </label>) : <small className="muted">{loadError ?? "GA4から取得できるキーイベントはまだありません。"}</small>}
      <label className="field key-event-manual">一覧にないイベント名
        <textarea name={manualKeyEventFieldName(stage)} rows={2} placeholder="例: sign_up&#10;1行に1件入力" />
      </label>
      <small className="muted">まだ発生していないイベントも保存できます。GA4で同じ名前をキーイベントとして設定してください。</small>
    </fieldset>
  })}</>
}
