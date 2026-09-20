import { createServer, type IncomingMessage } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const port = Number(process.env.PORT ?? 8000)
const host = '0.0.0.0'
let auditing = false
type Job = {
  status: 'running' | 'done' | 'error'
  createdAt: number
  report?: string
  error?: string
}
const jobs = new Map<string, Job>()

function page(message = ''): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Owtell SEO診断ツール</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { max-width: 720px; margin: 64px auto; padding: 0 20px; line-height: 1.6; }
    form { display: grid; gap: 16px; }
    input, button { box-sizing: border-box; width: 100%; padding: 12px; font: inherit; }
    button { cursor: pointer; }
    .message { color: #b42318; }
  </style>
</head>
<body>
  <h1>Owtell SEO診断ツール</h1>
  <p>公開サイトのURLを入力すると、技術SEO上の問題をMarkdownで返します。</p>
  ${message ? `<p class="message">${message}</p>` : ''}
  <form method="post" action="/audit">
    <label>診断するURL
      <input name="url" type="url" placeholder="https://example.com" required>
    </label>
    <label>最大ページ数
      <input name="max" type="number" min="1" max="300" value="100" required>
    </label>
    <button type="submit">診断を開始</button>
  </form>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function jobPage(id: string, job: Job): string {
  if (job.status === 'running') {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>診断中｜Owtell SEO診断ツール</title></head><body><main><h1>診断中です</h1><p>ページを閉じずにお待ちください。この画面は3秒ごとに更新されます。</p></main></body></html>`
  }
  if (job.status === 'error') {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>診断失敗｜Owtell SEO診断ツール</title></head><body><main><h1>診断に失敗しました</h1><p>${escapeHtml(job.error ?? '不明なエラー')}</p><p><a href="/">戻る</a></p></main></body></html>`
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>診断完了｜Owtell SEO診断ツール</title></head><body><main><h1>診断が完了しました</h1><p><a href="/jobs/${id}/report">Markdownレポートを表示</a></p><p><a href="/">別のサイトを診断する</a></p></main></body></html>`
}

function collectBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 10_000) reject(new Error('リクエストが大きすぎます。'))
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function runAudit(url: string, max: number, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/audit.ts', url, `--max=${max}`, `--output=${output}`], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('診断が制限時間を超えました。ページ数を減らしてください。'))
    }, 600_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`診断処理が終了コード${code ?? '不明'}で失敗しました。`))
    })
  })
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('ok\n')
    return
  }

  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(page())
    return
  }

  const reportMatch = request.method === 'GET' ? request.url?.match(/^\/jobs\/([a-f0-9-]+)\/report$/) : null
  if (reportMatch) {
    const job = jobs.get(reportMatch[1])
    if (!job || job.status !== 'done' || !job.report) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('レポートが見つかりません。\n')
      return
    }
    response.writeHead(200, {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline; filename="seo-report.md"',
      'cache-control': 'no-store',
    })
    response.end(job.report)
    return
  }

  const jobMatch = request.method === 'GET' ? request.url?.match(/^\/jobs\/([a-f0-9-]+)$/) : null
  if (jobMatch) {
    const job = jobs.get(jobMatch[1])
    if (!job) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('診断ジョブが見つかりません。\n')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(jobPage(jobMatch[1], job))
    return
  }

  if (request.method === 'POST' && request.url === '/audit') {
    if (auditing) {
      response.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '30' })
      response.end(page('現在、別の診断を実行中です。少し待ってから再実行してください。'))
      return
    }

    try {
      const params = new URLSearchParams(await collectBody(request))
      const url = params.get('url')?.trim() ?? ''
      const max = Number(params.get('max') ?? 100)
      if (!url || !Number.isInteger(max) || max < 1 || max > 300) throw new Error('URLとページ数（1〜300）を正しく入力してください。')

      const id = randomUUID()
      const output = join(tmpdir(), `seo-report-${id}.md`)
      jobs.set(id, { status: 'running', createdAt: Date.now() })
      auditing = true
      void runAudit(url, max, output).then(async () => {
        const report = await readFile(output, 'utf8')
        jobs.set(id, { status: 'done', createdAt: Date.now(), report })
      }).catch((error: unknown) => {
        jobs.set(id, {
          status: 'error',
          createdAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        })
      }).finally(async () => {
        auditing = false
        await unlink(output).catch(() => {})
      })

      response.writeHead(303, { location: `/jobs/${id}`, 'cache-control': 'no-store' })
      response.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      response.end(page(message))
    }
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not Found\n')
})

server.listen(port, host, () => {
  console.log(`SEO診断ツール: http://${host}:${port}`)
})

setInterval(() => {
  const expiresBefore = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.createdAt < expiresBefore) jobs.delete(id)
  }
}, 10 * 60 * 1000).unref()
