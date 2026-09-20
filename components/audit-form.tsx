"use client"

import { Fragment, useState } from "react"

type JobResponse = { status: string; progress?: string; error?: string; reportUrl?: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function inline(value: string): React.ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>
    return <Fragment key={index}>{part.replaceAll("\\|", "|")}</Fragment>
  })
}

function cells(line: string): string[] {
  return line.trim().slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim())
}

function MarkdownReport({ markdown }: { markdown: string }) {
  const lines = markdown.replaceAll("\r", "").split("\n")
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3"
      nodes.push(<Tag key={i}>{inline(heading[2])}</Tag>); i++; continue
    }
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().startsWith("|")) {
      const header = cells(line); i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]))
      nodes.push(<table key={`table-${i}`}><thead><tr>{header.map((value, j) => <th key={j}>{inline(value)}</th>)}</tr></thead><tbody>{rows.map((row, j) => <tr key={j}>{row.map((value, k) => <td key={k}>{inline(value)}</td>)}</tr>)}</tbody></table>)
      continue
    }
    if (line.startsWith("- ")) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2))
      nodes.push(<ul key={`list-${i}`}>{items.map((item, j) => <li key={j}>{inline(item)}</li>)}</ul>); continue
    }
    nodes.push(<p key={i}>{inline(line)}</p>); i++
  }
  return <div className="report">{nodes}</div>
}

export function AuditForm() {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function submit(formData: FormData) {
    setRunning(true); setError(null); setReport(null); setStatus("診断の準備中です。")
    try {
      const response = await fetch("/api/audit", { method: "POST", body: formData })
      const started = await response.json() as { statusUrl?: string; error?: string }
      if (!response.ok || !started.statusUrl) throw new Error(started.error ?? "診断を開始できませんでした。")
      while (true) {
        await wait(2000)
        const statusResponse = await fetch(started.statusUrl, { cache: "no-store" })
        const job = await statusResponse.json() as JobResponse
        if (!statusResponse.ok) throw new Error(job.error ?? "診断状況を取得できませんでした。")
        if (job.status === "error") throw new Error(job.error ?? "診断に失敗しました。")
        if (job.status !== "done") { setStatus(job.progress ?? "診断中です。"); continue }
        if (!job.reportUrl) throw new Error("レポートが見つかりません。")
        const reportResponse = await fetch(job.reportUrl, { cache: "no-store" })
        if (!reportResponse.ok) throw new Error("レポートを取得できませんでした。")
        setReport(await reportResponse.text()); setStatus("診断が完了しました。"); break
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause)); setStatus(null)
    } finally { setRunning(false) }
  }

  return <section className="card">
    <form className="stack" action={submit}>
      <label className="field">診断するURL<input name="url" type="url" placeholder="https://example.com" required /></label>
      <label className="field">最大ページ数<input name="max" type="number" min="1" max="300" defaultValue="10" required /></label>
      <button className="button" disabled={running}>{running ? "診断中です" : "診断を開始"}</button>
    </form>
    {status && <p className="status" aria-live="polite">{status}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {report && <MarkdownReport markdown={report} />}
  </section>
}
