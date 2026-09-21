import { asc, eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function DashboardAuditPage({ searchParams }: { searchParams: Promise<{ page?: string; siteId?: string }> }) {
  const current = await requireSession()
  const params = await searchParams
  const registeredSites = await db.select({ id: site.id }).from(site).where(eq(site.userId, current.user.id)).orderBy(asc(site.createdAt))
  const registeredSite = registeredSites.find((item) => item.id === params.siteId) ?? registeredSites[0]
  const page = params.page && Number(params.page) > 1 ? `?page=${params.page}` : ""
  redirect(registeredSite ? `/dashboard/sites/${registeredSite.id}/audits${page}` : "/onboarding/site")
}
