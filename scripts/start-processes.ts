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
  const child = spawn(process.execPath, [file], { stdio: "inherit", env: process.env })
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

start("web", "server.js")
start("audit-worker", "audit-worker.mjs")

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
