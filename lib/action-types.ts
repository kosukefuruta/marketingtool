/**
 * 施策型。定義の全体は docs/action-type-catalog.md にあり、ここには候補生成を実装した型だけを置く。
 * サイトに依存しない条件と操作だけを持ち、対象URLなどは利用者のデータから決まる。
 */
export const actionTypes = {
  "RANK-001": {
    label: "10〜20位のページを強化する",
    driver: "impressions",
    operation: "検索意図に対して不足している情報を補い、内容を強化する",
    reason: "10〜20位は検索結果の2ページ目付近で、1ページ目へ入ると表示回数とクリック数が大きく伸びる",
  },
} as const

export type ActionTypeId = keyof typeof actionTypes

export function actionTypeLabel(id: ActionTypeId): string {
  return actionTypes[id].label
}
