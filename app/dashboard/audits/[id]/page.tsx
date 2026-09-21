import { notFound, redirect } from "next/navigation"
import { loadOwnedAuditJob } from "@/lib/dashboard-audits"
import { requireSession } from "@/lib/session"

export default async function LegacyAuditDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const current = await requireSession()
  const { id } = await params
  const query = await searchParams
  const job = await loadOwnedAuditJob(id, current.user.id)
  if (!job) notFound()
  const page = query.page && Number(query.page) > 1 ? `?page=${query.page}` : ""
  redirect(`/dashboard/sites/${job.siteId}/audits/${id}${page}`)
}
