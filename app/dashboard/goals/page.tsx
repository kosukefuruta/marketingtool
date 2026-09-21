import { asc, eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function GoalsPage() {
  const current = await requireSession()
  const [registeredSite] = await db.select({ id: site.id }).from(site)
    .where(eq(site.userId, current.user.id)).orderBy(asc(site.createdAt)).limit(1)
  redirect(registeredSite ? `/dashboard/sites/${registeredSite.id}/goals` : "/onboarding/site")
}
