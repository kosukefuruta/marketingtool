import { auditJobs } from "@/lib/audit-jobs"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = auditJobs.get(id)
  if (!job) return Response.json({ error: "診断ジョブが見つかりません。" }, { status: 404 })
  return Response.json({
    status: job.status,
    progress: job.progress,
    error: job.error,
    reportUrl: job.status === "done" ? `/api/jobs/${id}/report` : undefined,
  }, { headers: { "cache-control": "no-store" } })
}
