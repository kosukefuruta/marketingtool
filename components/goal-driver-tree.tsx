import type { GoalDriver } from "@/lib/goal-breakdowns"

function Driver({ driver }: { driver: GoalDriver }) {
  return <li className="goal-driver">
    <div className="goal-driver-card">
      <div><strong>{driver.label}</strong><p>{driver.description}</p></div>
      <dl>
        <div><dt>現在値</dt><dd>未取得</dd></div>
        <div><dt>単位</dt><dd>{driver.unit}</dd></div>
        <div><dt>データ元</dt><dd>{driver.source}</dd></div>
      </dl>
    </div>
    {driver.children?.length ? <ul>{driver.children.map((child) => <Driver driver={child} key={child.id} />)}</ul> : null}
  </li>
}

export function GoalDriverTree({ drivers }: { drivers: GoalDriver[] }) {
  return <ul className="goal-driver-tree">{drivers.map((driver) => <Driver driver={driver} key={driver.id} />)}</ul>
}
