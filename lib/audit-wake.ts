// 眠っている audit-worker を起こす。web と worker は scripts/start-processes.ts が ipc 付きで起動し、
// この合図を worker へ中継する。ipc が無い起動（pnpm dev など）では何もしない。
export function wakeAuditWorker(): void {
  if (typeof process.send !== "function") {
    if (process.env.NODE_ENV === "production") {
      // 本番でここに来る=合図が届かない。worker は次の期限（最長で翌日の保持期限の掃除）まで起きない
      console.warn("[audit] no ipc channel; audit-worker will not be woken")
    }
    return
  }
  try {
    process.send({ type: "audit:wake" })
  } catch (error) {
    console.warn("[audit] could not wake audit-worker", { message: error instanceof Error ? error.message : String(error) })
  }
}
