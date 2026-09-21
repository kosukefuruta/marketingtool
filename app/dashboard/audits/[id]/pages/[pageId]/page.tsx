import { notFound, redirect } from "next/navigation"
import { loadOwnedAuditJob } from "@/lib/dashboard-audits"
import { requireSession } from "@/lib/session"

export default async function LegacyAuditPageDetail({ params, searchParams }: {
  params: Promise<{ id: string; pageId: string }>
  searchParams: Promise<{ fromPage?: string }>
}) {
  const current = await requireSession()
  const { id, pageId } = await params
  const query = await searchParams
  const job = await loadOwnedAuditJob(id, current.user.id)
  if (!job) notFound()
  const fromPage = query.fromPage && Number(query.fromPage) > 1 ? `?fromPage=${query.fromPage}` : ""
  redirect(`/dashboard/sites/${job.siteId}/audits/${id}/pages/${pageId}${fromPage}`)
}
