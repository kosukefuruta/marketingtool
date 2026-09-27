import { driverGapLabel, formatDriverAmount, type DriverTarget, type DriverValue, type GoalDriver } from "@/lib/goal-breakdowns"

type DriverProps = {
  driver: GoalDriver
  currentValues: Record<string, DriverValue>
  requirements: Record<string, DriverTarget>
}

function Driver({ driver, currentValues, requirements }: DriverProps) {
  const current = currentValues[driver.id]
  const required = requirements[driver.id]
  // 仮定値との差は差分ではないので、実測があるときだけ不足量を出す。
  const gap = required ? driverGapLabel(required.value, current?.assumed ? undefined : current?.amount, driver.unit) : null
  return <li className="goal-driver">
    <div className="goal-driver-card">
      <div>
        <strong>{driver.label}</strong>
        <p>{driver.description}</p>
        {current?.detail && <p>{current.detail}</p>}
        {required?.note && <p>必要値の前提: {required.note}</p>}
      </div>
      <dl>
        <div><dt>{current?.assumed ? "仮定値" : "現在値"}</dt><dd>{current?.value ?? "未取得"}</dd></div>
        <div><dt>必要値</dt><dd>{required ? formatDriverAmount(required.value, driver.unit) : "—"}</dd></div>
        <div><dt>差分</dt><dd>{gap ?? "—"}</dd></div>
        <div><dt>データ元</dt><dd>{driver.source}</dd></div>
      </dl>
    </div>
    {driver.children?.length ? <ul>{driver.children.map((child) => <Driver driver={child} currentValues={currentValues} requirements={requirements} key={child.id} />)}</ul> : null}
  </li>
}

export function GoalDriverTree({ drivers, currentValues = {}, requirements = {} }: { drivers: GoalDriver[]; currentValues?: Record<string, DriverValue>; requirements?: Record<string, DriverTarget> }) {
  return <ul className="goal-driver-tree">{drivers.map((driver) => <Driver driver={driver} currentValues={currentValues} requirements={requirements} key={driver.id} />)}</ul>
}
