type CheckCounts = {
  goodCount: number | null
  reviewCount: number | null
  improveCount: number | null
  unreachableCount: number | null
}

export function summarizeCheckCounts(input: CheckCounts): string {
  const counts = [input.goodCount, input.reviewCount, input.improveCount, input.unreachableCount]
  if (counts.every((value) => value === null)) return "集計結果なし"

  const issues = [
    input.improveCount ? `要改善${input.improveCount}件` : null,
    input.reviewCount ? `要確認${input.reviewCount}件` : null,
    input.unreachableCount ? `取得不能${input.unreachableCount}件` : null,
  ].filter(Boolean)
  return issues.length ? issues.join("・") : "全て良好"
}

export function summarizeAudit(input: CheckCounts & { status: string }): string {
  if (input.status === "queued") return "診断待ち"
  if (input.status === "running") return "診断中"
  if (input.status === "error") return "診断失敗"
  return summarizeCheckCounts(input)
}
