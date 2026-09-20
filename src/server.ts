import { createServer, type IncomingMessage } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const port = Number(process.env.PORT ?? 8000)
const host = '0.0.0.0'
let auditing = false

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

  if (request.method === 'POST' && request.url === '/audit') {
    if (auditing) {
      response.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '30' })
      response.end(page('現在、別の診断を実行中です。少し待ってから再実行してください。'))
      return
    }

    let output = ''
    try {
      const params = new URLSearchParams(await collectBody(request))
      const url = params.get('url')?.trim() ?? ''
      const max = Number(params.get('max') ?? 100)
      if (!url || !Number.isInteger(max) || max < 1 || max > 300) throw new Error('URLとページ数（1〜300）を正しく入力してください。')

      output = join(tmpdir(), `seo-report-${randomUUID()}.md`)
      auditing = true
      await runAudit(url, max, output)
      const report = await readFile(output, 'utf8')
      response.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline; filename="seo-report.md"',
        'cache-control': 'no-store',
      })
      response.end(report)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      response.end(page(message))
    } finally {
      auditing = false
      if (output) await unlink(output).catch(() => {})
    }
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not Found\n')
})

server.listen(port, host, () => {
  console.log(`SEO診断ツール: http://${host}:${port}`)
})
