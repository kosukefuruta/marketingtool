import { startAudit } from "@/lib/audit-jobs"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const url = String(form.get("url") ?? "").trim()
    const max = Number(form.get("max") ?? 10)
    if (!url || !Number.isInteger(max) || max < 1 || max > 300) {
      return Response.json({ error: "URLとページ数（1〜300）を正しく入力してください。" }, { status: 400 })
    }
    const id = startAudit(url, max)
    return Response.json({ id, statusUrl: `/api/jobs/${id}` }, { status: 202 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 })
  }
}
