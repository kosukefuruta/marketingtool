import { spawn } from "node:child_process"
import { readFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { db } from "../lib/db/index.js"
import { auditJob } from "../lib/db/schema.js"
import { retryDelayMs, shouldRetry, shouldStopWorker } from "../lib/audit-worker-policy.js"
import { claimAuditJob, recoverInterruptedAuditJobs, type ClaimedAuditJob } from "../lib/audit-queue.js"
import { deleteExpiredAuditData } from "../lib/audit-retention.js"
import { saveAuditResult, type StructuredAuditResult } from "../lib/audit-result-store.js"

const workerId = `${process.env.HOSTNAME ?? "worker"}-${process.pid}`
const pollMs = 2_000
const retentionIntervalMs = 24 * 60 * 60 * 1000

async function run(job: ClaimedAuditJob): Promise<void> {
  const reportPath = join(tmpdir(), `seo-report-${job.id}.md`)
  const jsonPath = join(tmpdir(), `seo-result-${job.id}.json`)
  const script = process.env.AUDIT_SCRIPT ? [process.env.AUDIT_SCRIPT] : ["--import", "tsx", "src/audit.ts"]
  const child = spawn(process.execPath, [...script, job.target_url, `--max=${job.max_pages}`, `--output=${reportPath}`, `--json-output=${jsonPath}`], {
    stdio: ["ignore", "pipe", "inherit"], env: process.env,
  })
  let buffer = ""
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const match = line.match(/^\[(\d+)\/(\d+)\]\s+(.+)$/)
      if (match) void db.update(auditJob).set({ progress: `${match[1]}/${match[2]}ページを診断中: ${match[3]}`, updatedAt: new Date() })
        .where(sql`${auditJob.id} = ${job.id}`).catch((error: unknown) => {
          console.warn("[audit-worker] progress update failed", { id: job.id, message: error instanceof Error ? error.message : String(error) })
        })
    }
  })

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
    let timedOut = false
    let forceKill: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      forceKill = setTimeout(() => child.kill("SIGKILL"), 10_000)
    }, 10 * 60 * 1000)
    child.once("error", (error) => { clearTimeout(timer); if (forceKill) clearTimeout(forceKill); reject(error) })
    child.once("exit", (code) => {
      clearTimeout(timer)
      if (forceKill) clearTimeout(forceKill)
      if (timedOut) reject(new Error("診断が制限時間を超えました。"))
      else resolve(code)
    })
    })
    if (exitCode !== 0) throw new Error(`診断処理が終了コード${exitCode ?? "不明"}で失敗しました。`)

    const [report, json] = await Promise.all([readFile(reportPath, "utf8"), readFile(jsonPath, "utf8")])
    const result = JSON.parse(json) as StructuredAuditResult
    await saveAuditResult(job.id, report, result)
  } finally {
    await Promise.all([unlink(reportPath).catch(() => undefined), unlink(jsonPath).catch(() => undefined)])
  }
}

async function main(): Promise<void> {
  console.log(`[audit-worker] started ${workerId}`)
  let infrastructureFailures = 0
  let nextRetentionCleanupAt = 0
  while (true) {
    try {
      if (Date.now() >= nextRetentionCleanupAt) {
        const deleted = await deleteExpiredAuditData()
        if (deleted) console.log("[audit-worker] expired audit data deleted", { count: deleted })
        nextRetentionCleanupAt = Date.now() + retentionIntervalMs
      }
      await recoverInterruptedAuditJobs()
      const job = await claimAuditJob()
      infrastructureFailures = 0
      if (!job) { await new Promise((resolve) => setTimeout(resolve, pollMs)); continue }
      try {
        await run(job)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[audit-worker] job failed", { id: job.id, message })
        const retry = shouldRetry(job.attempt_count)
        await db.update(auditJob).set({
          status: retry ? "queued" : "error",
          progress: retry ? `診断に失敗しました。再試行します（${job.attempt_count}/3）。` : null,
          error: retry ? null : message.slice(0, 500),
          nextAttemptAt: retry ? new Date(Date.now() + retryDelayMs(job.attempt_count)) : null,
          updatedAt: new Date(), completedAt: retry ? null : new Date(),
        }).where(sql`${auditJob.id} = ${job.id}`)
      }
    } catch (error) {
      infrastructureFailures += 1
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(infrastructureFailures, 5))
      console.error("[audit-worker] infrastructure failure", { failures: infrastructureFailures, delay, message: error instanceof Error ? error.message : String(error) })
      if (shouldStopWorker(infrastructureFailures)) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

await main()
