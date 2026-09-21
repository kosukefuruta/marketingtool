"use client"

import { deleteGoal } from "@/app/actions"

export function DeleteGoalForm({ goalId, goalName, siteId }: { goalId: string; goalName: string; siteId: string }) {
  return <form action={deleteGoal} onSubmit={(event) => {
    if (!window.confirm(`目標「${goalName}」を削除しますか？`)) event.preventDefault()
  }}>
    <input type="hidden" name="goalId" value={goalId} />
    <input type="hidden" name="siteId" value={siteId} />
    <button className="text-button" type="submit">削除</button>
  </form>
}
