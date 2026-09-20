import { spawn } from "node:child_process"
import { readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

export type AuditJob = {
  status: "running" | "done" | "error"
  createdAt: number
  progress?: string
  report?: string
  error?: string
}

declare global {
  var __auditJobs: Map<string, AuditJob> | undefined
  var __auditRunning: boolean | undefined
  var __auditCleanup: ReturnType<typeof setInterval> | undefined
}

export const auditJobs = globalThis.__auditJobs ?? new Map<string, AuditJob>()
globalThis.__auditJobs = auditJobs

if (!globalThis.__auditCleanup) {
  globalThis.__auditCleanup = setInterval(() => {
    const before = Date.now() - 60 * 60 * 1000
    for (const [id, job] of auditJobs) if (job.createdAt < before) auditJobs.delete(id)
  }, 10 * 60 * 1000)
  globalThis.__auditCleanup.unref()
}

export function isAuditRunning(): boolean {
  return globalThis.__auditRunning === true
}

function runAudit(url: string, max: number, output: string, onProgress: (value: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // The production image ships a bundled audit script; local development runs the TypeScript source.
    const script = process.env.AUDIT_SCRIPT ? [process.env.AUDIT_SCRIPT] : ["--import", "tsx", "src/audit.ts"]
    const child = spawn(process.execPath, [...script, url, `--max=${max}`, `--output=${output}`], {
      stdio: ["ignore", "pipe", "inherit"],
      env: process.env,
    })
    let buffer = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const match = line.match(/^\[(\d+)\/(\d+)\]\s+(.+)$/)
        if (match) onProgress(`${match[1]}/${match[2]}ページを診断中: ${match[3]}`)
      }
    })
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("診断が制限時間を超えました。ページ数を減らしてください。"))
    }, 600_000)
    child.once("error", (error) => { clearTimeout(timer); reject(error) })
    child.once("exit", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`診断処理が終了コード${code ?? "不明"}で失敗しました。`))
    })
  })
}

export function startAudit(url: string, max: number): string {
  if (isAuditRunning()) throw new Error("現在、別の診断を実行中です。少し待ってから再実行してください。")
  const id = crypto.randomUUID()
  const output = join(tmpdir(), `seo-report-${id}.md`)
  auditJobs.set(id, { status: "running", createdAt: Date.now(), progress: "診断の準備中です。" })
  globalThis.__auditRunning = true
  void runAudit(url, max, output, (progress) => {
    const job = auditJobs.get(id)
    if (job?.status === "running") job.progress = progress
  }).then(async () => {
    auditJobs.set(id, { status: "done", createdAt: Date.now(), report: await readFile(output, "utf8") })
  }).catch((error: unknown) => {
    auditJobs.set(id, { status: "error", createdAt: Date.now(), error: error instanceof Error ? error.message : String(error) })
  }).finally(async () => {
    globalThis.__auditRunning = false
    await unlink(output).catch(() => undefined)
  })
  return id
}
