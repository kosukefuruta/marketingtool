import { startAudit } from "@/lib/audit-jobs"
import { clientAddress } from "@/lib/client-address"
import { SlidingWindowLimiter } from "@/lib/rate-limit"
import { checkSharedRateLimit } from "@/lib/shared-rate-limit"

export const runtime = "nodejs"

const FREE_MAX_PAGES = 10
const fallbackLimiter = new SlidingWindowLimiter(60 * 60 * 1000, 3)

export async function POST(request: Request) {
  try {
    const address = clientAddress(request)
    const limit = await checkSharedRateLimit(`public-audit:${address}`, 60 * 60 * 1000, 3).catch((error: unknown) => {
      console.error("[audit] shared rate limiter unavailable", { message: error instanceof Error ? error.message : String(error) })
      return fallbackLimiter.checkAndRecord(address)
    })
    if (!limit.allowed) {
      return Response.json({ error: "無料診断の利用回数が上限に達しました。時間をおいて再実行してください。" }, {
        status: 429,
        headers: { "retry-after": String(limit.retryAfter) },
      })
    }
    const form = await request.formData()
    const url = String(form.get("url") ?? "").trim()
    const max = Number(form.get("max") ?? FREE_MAX_PAGES)
    if (!url || !Number.isInteger(max) || max < 1 || max > FREE_MAX_PAGES) {
      return Response.json({ error: `URLとページ数（1〜${FREE_MAX_PAGES}）を正しく入力してください。` }, { status: 400 })
    }
    const id = startAudit(url, max)
    return Response.json({ id, statusUrl: `/api/jobs/${id}` }, { status: 202 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 })
  }
}
