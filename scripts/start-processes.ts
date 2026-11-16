import { spawn, type ChildProcess } from "node:child_process"

const children: ChildProcess[] = []
let stopping = false
let forceKillTimer: ReturnType<typeof setTimeout> | undefined

function stopped(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function stopChildren(signal: NodeJS.Signals = "SIGTERM"): void {
  for (const child of children) if (!stopped(child)) child.kill(signal)
  if (!forceKillTimer) {
    forceKillTimer = setTimeout(() => {
      for (const child of children) if (!stopped(child)) child.kill("SIGKILL")
    }, 10_000)
  }
}

function start(label: string, file: string): ChildProcess {
  // ipc: web が診断を受け付けたら worker を起こす合図をここで中継する（下の relay）。
  const child = spawn(process.execPath, [file], { stdio: ["inherit", "inherit", "inherit", "ipc"], env: process.env })
  children.push(child)
  child.once("exit", (code, signal) => {
    if (stopping) return
    stopping = true
    console.error(`[supervisor] ${label} exited`, { code, signal })
    stopChildren()
    process.exitCode = code ?? 1
  })
  return child
}

const web = start("web", "server.js")
const worker = start("audit-worker", "audit-worker.mjs")

// worker は仕事が無いと次の期限まで眠る（2秒ごとに空振りで DB を見ると Neon が停止できない）。
// web がキューに入れた直後の合図を worker へ渡して起こす。
web.on("message", (message: unknown) => {
  if ((message as { type?: string } | null)?.type !== "audit:wake" || !worker.connected) return
  worker.send({ type: "audit:wake" }, (error) => {
    if (error) console.warn("[supervisor] could not wake audit-worker", { message: error.message })
  })
})

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    stopChildren(signal)
  })
}

await new Promise<void>((resolve) => {
  const timer = setInterval(() => {
    if (children.every(stopped)) { clearInterval(timer); if (forceKillTimer) clearTimeout(forceKillTimer); resolve() }
  }, 100)
})
