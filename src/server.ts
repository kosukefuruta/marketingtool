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
  progress?: string
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
    #result { margin-top: 32px; }
    [hidden] { display: none !important; }
    .report { margin-top: 20px; }
    .report h1, .report h2, .report h3 { margin-top: 1.5em; }
    .report table { width: 100%; border-collapse: collapse; margin: 12px 0 28px; }
    .report th, .report td { padding: 10px; border: 1px solid #8886; text-align: left; vertical-align: top; }
    .report th { background: #8882; }
    .report code { padding: 2px 5px; border-radius: 4px; background: #8882; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>Owtell SEO診断ツール</h1>
  <p>公開サイトのURLを入力すると、技術SEO上の問題をMarkdownで返します。</p>
  ${message ? `<p class="message">${message}</p>` : ''}
  <form id="audit-form" method="post" action="/audit">
    <label>診断するURL
      <input name="url" type="url" placeholder="https://example.com" required>
    </label>
    <label>最大ページ数
      <input name="max" type="number" min="1" max="300" value="100" required>
    </label>
    <button type="submit">診断を開始</button>
  </form>
  <section id="result" hidden aria-live="polite">
    <h2 id="result-title">診断中です</h2>
    <p id="result-status">この画面を開いたままお待ちください。</p>
    <p><a id="report-link" hidden>Markdownレポートを表示</a></p>
    <div id="report" class="report" hidden></div>
  </section>
  <script>
    const form = document.querySelector('#audit-form')
    const button = form.querySelector('button')
    const result = document.querySelector('#result')
    const resultTitle = document.querySelector('#result-title')
    const resultStatus = document.querySelector('#result-status')
    const reportLink = document.querySelector('#report-link')
    const report = document.querySelector('#report')

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    const appendInline = (element, value) => {
      const text = value.replaceAll(String.fromCharCode(92) + '|', '|')
      const pattern = /([*][*][^*]+[*][*]|\x60[^\x60]+\x60)/g
      let offset = 0
      for (const match of text.matchAll(pattern)) {
        element.append(document.createTextNode(text.slice(offset, match.index)))
        const token = match[0]
        const child = document.createElement(token.startsWith('**') ? 'strong' : 'code')
        child.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1)
        element.append(child)
        offset = match.index + token.length
      }
      element.append(document.createTextNode(text.slice(offset)))
    }

    const tableCells = (line) => {
      const cells = []
      let cell = ''
      let escaped = false
      for (const character of line.trim().slice(1, -1)) {
        if (character === '|' && !escaped) {
          cells.push(cell.trim())
          cell = ''
        } else {
          cell += character
        }
        escaped = character === String.fromCharCode(92) && !escaped
      }
      cells.push(cell.trim())
      return cells
    }

    const isTableSeparator = (line) => {
      const trimmed = line?.trim() || ''
      return trimmed.startsWith('|') && tableCells(trimmed).every((cell) => /^:?-+:?$/.test(cell))
    }

    const renderMarkdown = (markdown, container) => {
      container.replaceChildren()
      const lines = markdown.split(String.fromCharCode(10)).map((line) => line.replaceAll(String.fromCharCode(13), ''))
      let index = 0
      while (index < lines.length) {
        const line = lines[index]
        if (!line.trim()) {
          index++
          continue
        }

        const heading = line.match(/^(#{1,3})[ ]+(.+)$/)
        if (heading) {
          const element = document.createElement('h' + heading[1].length)
          appendInline(element, heading[2])
          container.append(element)
          index++
          continue
        }

        if (line.trim().startsWith('|') && isTableSeparator(lines[index + 1])) {
          const table = document.createElement('table')
          const thead = document.createElement('thead')
          const headRow = document.createElement('tr')
          for (const value of tableCells(line)) {
            const cell = document.createElement('th')
            appendInline(cell, value)
            headRow.append(cell)
          }
          thead.append(headRow)
          table.append(thead)
          index += 2
          const tbody = document.createElement('tbody')
          while (index < lines.length && lines[index].trim().startsWith('|')) {
            const row = document.createElement('tr')
            for (const value of tableCells(lines[index])) {
              const cell = document.createElement('td')
              appendInline(cell, value)
              row.append(cell)
            }
            tbody.append(row)
            index++
          }
          table.append(tbody)
          container.append(table)
          continue
        }

        if (line.startsWith('- ')) {
          const list = document.createElement('ul')
          while (index < lines.length && lines[index].startsWith('- ')) {
            const item = document.createElement('li')
            appendInline(item, lines[index].slice(2))
            list.append(item)
            index++
          }
          container.append(list)
          continue
        }

        const paragraph = document.createElement('p')
        appendInline(paragraph, line)
        container.append(paragraph)
        index++
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      button.disabled = true
      result.hidden = false
      resultTitle.textContent = '診断中です'
      resultStatus.textContent = 'サイトを巡回しています。この画面を開いたままお待ちください。'
      reportLink.hidden = true
      report.hidden = true
      report.textContent = ''

      try {
        const response = await fetch('/audit', {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || '診断を開始できませんでした。')

        while (true) {
          await wait(2000)
          const statusResponse = await fetch(body.statusUrl, { headers: { accept: 'application/json' }, cache: 'no-store' })
          const job = await statusResponse.json()
          if (!statusResponse.ok) throw new Error(job.error || '診断状況を取得できませんでした。')
          if (job.status === 'error') throw new Error(job.error || '診断に失敗しました。')
          if (job.status !== 'done') {
            if (job.progress) resultStatus.textContent = job.progress
            continue
          }

          const reportResponse = await fetch(job.reportUrl, { cache: 'no-store' })
          if (!reportResponse.ok) throw new Error('レポートを取得できませんでした。')
          renderMarkdown(await reportResponse.text(), report)
          report.hidden = false
          reportLink.href = job.reportUrl
          reportLink.hidden = false
          resultTitle.textContent = '診断が完了しました'
          resultStatus.textContent = '結果をこのページに表示しています。'
          break
        }
      } catch (error) {
        resultTitle.textContent = '診断に失敗しました'
        resultStatus.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        button.disabled = false
      }
    })
  </script>
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

function runAudit(url: string, max: number, output: string, onProgress: (progress: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/audit.ts', url, `--max=${max}`, `--output=${output}`], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    })
    let stdoutBuffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      process.stdout.write(chunk)
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const match = line.match(/^\[(\d+)\/(\d+)\]\s+(.+)$/)
        if (match) onProgress(`${match[1]}/${match[2]}ページを診断中: ${match[3]}`)
      }
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
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(page())
    return
  }

  const apiJobMatch = request.method === 'GET' ? request.url?.match(/^\/api\/jobs\/([a-f0-9-]+)$/) : null
  if (apiJobMatch) {
    const job = jobs.get(apiJobMatch[1])
    response.writeHead(job ? 200 : 404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    if (!job) response.end(JSON.stringify({ error: '診断ジョブが見つかりません。' }))
    else response.end(JSON.stringify({
      status: job.status,
      progress: job.progress,
      error: job.error,
      reportUrl: job.status === 'done' ? `/jobs/${apiJobMatch[1]}/report` : undefined,
    }))
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
    const wantsJson = request.headers.accept?.includes('application/json') ?? false
    if (auditing) {
      response.writeHead(503, {
        'content-type': wantsJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        'retry-after': '30',
      })
      response.end(wantsJson
        ? JSON.stringify({ error: '現在、別の診断を実行中です。少し待ってから再実行してください。' })
        : page('現在、別の診断を実行中です。少し待ってから再実行してください。'))
      return
    }

    try {
      const params = new URLSearchParams(await collectBody(request))
      const url = params.get('url')?.trim() ?? ''
      const max = Number(params.get('max') ?? 100)
      if (!url || !Number.isInteger(max) || max < 1 || max > 300) throw new Error('URLとページ数（1〜300）を正しく入力してください。')

      const id = randomUUID()
      const output = join(tmpdir(), `seo-report-${id}.md`)
      jobs.set(id, { status: 'running', createdAt: Date.now(), progress: '診断の準備中です。' })
      auditing = true
      void runAudit(url, max, output, (progress) => {
        const job = jobs.get(id)
        if (job?.status === 'running') job.progress = progress
      }).then(async () => {
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

      if (wantsJson) {
        response.writeHead(202, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        response.end(JSON.stringify({ id, statusUrl: `/api/jobs/${id}` }))
      } else {
        response.writeHead(303, { location: `/jobs/${id}`, 'cache-control': 'no-store' })
        response.end()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      response.writeHead(400, {
        'content-type': wantsJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end(wantsJson ? JSON.stringify({ error: message }) : page(message))
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
