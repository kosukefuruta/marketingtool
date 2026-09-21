import { auditJobs, canReadAuditJob } from "@/lib/audit-jobs"
import { loadOwnedAuditJob } from "@/lib/dashboard-audits"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = auditJobs.get(id)
  if (job && !job.ownerId) return Response.json({
    status: job.status,
    progress: job.progress,
    error: job.error,
    reportUrl: job.status === "done" ? `/api/jobs/${id}/report` : undefined,
  }, { headers: { "cache-control": "no-store" } })

  const session = await getSession()
  if (!session) return Response.json({ error: "診断ジョブが見つかりません。" }, { status: 404 })
  const persisted = await loadOwnedAuditJob(id, session.user.id)
  if (!persisted || (job && !canReadAuditJob(job, session.user.id))) {
    return Response.json({ error: "診断ジョブが見つかりません。" }, { status: 404 })
  }
  return Response.json({
    status: persisted.status,
    progress: persisted.progress ?? undefined,
    error: persisted.error ?? undefined,
    reportUrl: persisted.status === "done" ? `/api/jobs/${id}/report` : undefined,
  }, { headers: { "cache-control": "no-store" } })
}
