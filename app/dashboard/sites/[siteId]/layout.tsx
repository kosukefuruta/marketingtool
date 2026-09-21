import type { ReactNode } from "react"
import { and, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SiteNav } from "@/components/site-nav"
import { db } from "@/lib/db"
import { site } from "@/lib/db/schema"
import { requireSession } from "@/lib/session"

export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ siteId: string }> }) {
  const current = await requireSession()
  const { siteId } = await params
  const [registeredSite] = await db.select({ name: site.name, origin: site.normalizedOrigin }).from(site)
    .where(and(eq(site.id, siteId), eq(site.userId, current.user.id))).limit(1)
  if (!registeredSite) notFound()

  return <div className="stack">
    <Link href="/dashboard">← サイト一覧</Link>
    <header className="site-header">
      <div><p className="muted site-header-label">サイト</p><h1>{registeredSite.name}</h1><p className="muted">{registeredSite.origin}</p></div>
    </header>
    <SiteNav siteId={siteId} />
    {children}
  </div>
}
