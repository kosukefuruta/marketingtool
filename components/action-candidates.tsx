import { actionTypes } from "@/lib/action-types"
import type { ActionCandidate } from "@/lib/action-candidates"

export function ActionCandidates({ candidates }: { candidates: ActionCandidate[] }) {
  return <ul className="action-candidates">{candidates.map((candidate) => {
    const type = actionTypes[candidate.actionTypeId]
    return <li className="action-candidate" key={`${candidate.actionTypeId}-${candidate.page}`}>
      <div>
        <strong>{type.label}</strong>
        <p className="action-candidate-page">{candidate.page}</p>
        <p className="muted">{candidate.evidence}</p>
      </div>
      <div>
        <p>{type.operation}</p>
        <p className="muted">{type.reason}</p>
      </div>
    </li>
  })}</ul>
}
