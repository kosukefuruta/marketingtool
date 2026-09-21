"use client"

import { deleteGoal } from "@/app/actions"

export function DeleteGoalForm({ goalId, goalName }: { goalId: string; goalName: string }) {
  return <form action={deleteGoal} onSubmit={(event) => {
    if (!window.confirm(`目標「${goalName}」を削除しますか？`)) event.preventDefault()
  }}>
    <input type="hidden" name="goalId" value={goalId} />
    <button className="text-button" type="submit">削除</button>
  </form>
}
