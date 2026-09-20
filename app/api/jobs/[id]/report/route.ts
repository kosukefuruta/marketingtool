import { auditJobs } from "@/lib/audit-jobs"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = auditJobs.get(id)
  if (!job?.report || job.status !== "done") return new Response("レポートが見つかりません。\n", { status: 404 })
  return new Response(job.report, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'inline; filename="seo-report.md"',
      "cache-control": "no-store",
    },
  })
}
