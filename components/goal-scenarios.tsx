import type { GoalScenario } from "@/lib/goal-breakdowns"

export function GoalScenarios({ scenarios }: { scenarios: GoalScenario[] }) {
  return <div className="scenario-grid">{scenarios.map((scenario) => <article className={`scenario-card${scenario.id === "standard" ? " recommended" : ""}`} key={scenario.id}>
    <div className="section-heading"><h3>{scenario.label}</h3>{scenario.id === "standard" && <span className="status-label">初期案</span>}</div>
    <div><p className="scenario-label">仮定</p><dl>{scenario.assumptions.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></div>
    <div><p className="scenario-label">必要値</p><dl>{scenario.requirements.map((item) => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value.toLocaleString("ja-JP")}</strong> {item.unit}</dd></div>)}</dl></div>
  </article>)}</div>
}
