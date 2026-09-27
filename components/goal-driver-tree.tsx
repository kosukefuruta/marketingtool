import type { DriverValue, GoalDriver } from "@/lib/goal-breakdowns"

function Driver({ driver, currentValues }: { driver: GoalDriver; currentValues: Record<string, DriverValue> }) {
  const current = currentValues[driver.id]
  return <li className="goal-driver">
    <div className="goal-driver-card">
      <div><strong>{driver.label}</strong><p>{driver.description}</p>{current?.detail && <p>{current.detail}</p>}</div>
      <dl>
        <div><dt>{current?.assumed ? "仮定値" : "現在値"}</dt><dd>{current?.value ?? "未取得"}</dd></div>
        <div><dt>データ元</dt><dd>{driver.source}</dd></div>
      </dl>
    </div>
    {driver.children?.length ? <ul>{driver.children.map((child) => <Driver driver={child} currentValues={currentValues} key={child.id} />)}</ul> : null}
  </li>
}

export function GoalDriverTree({ drivers, currentValues = {} }: { drivers: GoalDriver[]; currentValues?: Record<string, DriverValue> }) {
  return <ul className="goal-driver-tree">{drivers.map((driver) => <Driver driver={driver} currentValues={currentValues} key={driver.id} />)}</ul>
}
