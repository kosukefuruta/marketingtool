import { progressBarPercent, type GoalProgress } from "@/lib/goal-progress"

export function GoalProgressBar({ progress, note }: { progress: GoalProgress; note?: string }) {
  return <div className={progress.achieved ? "goal-progress goal-progress-achieved" : "goal-progress"}>
    <div className="goal-progress-heading">
      <strong>{progress.gapLabel}</strong>
      <span className="muted">{progress.rateLabel}</span>
    </div>
    <div className="goal-progress-track">
      <div className="goal-progress-fill" style={{ width: `${progressBarPercent(progress)}%` }} />
    </div>
    {note && <p className="muted">{note}</p>}
  </div>
}
