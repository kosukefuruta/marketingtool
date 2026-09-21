import { auditJobs, canReadAuditJob } from "@/lib/audit-jobs"
import { loadOwnedAuditJob } from "@/lib/dashboard-audits"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = auditJobs.get(id)
  if (job?.report && job.status === "done" && !job.ownerId) return new Response(job.report, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'inline; filename="seo-report.md"',
      "cache-control": "no-store",
    },
  })

  const session = await getSession()
  if (!session || (job && !canReadAuditJob(job, session.user.id))) {
    return new Response("レポートが見つかりません。\n", { status: 404 })
  }
  const persisted = await loadOwnedAuditJob(id, session.user.id)
  if (persisted?.status !== "done" || !persisted.report) {
    return new Response("レポートが見つかりません。\n", { status: 404 })
  }
  return new Response(persisted.report, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'inline; filename="seo-report.md"',
      "cache-control": "no-store",
    },
  })
}
