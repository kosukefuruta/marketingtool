import { sql } from "drizzle-orm"
import { db } from "./db"
import { auditCheck, auditJob, auditPage } from "./db/schema"

export type AuditCheckResult = { item: string; evaluation: string; detail: string }
export type StructuredAuditResult = {
  summary: { auditedPages: number; discoveredUrls: number; goodCount: number; reviewCount: number; improveCount: number; unreachableCount: number }
  siteChecks: AuditCheckResult[]
  pages: Array<{ page: { url: string; finalUrl: string; status: number | null; title: string; description: string; h1s: string[]; canonical: string; robots: string; lang: string; textLength: number; images: number; imagesWithoutAlt: number; error?: string }; checks: AuditCheckResult[] }>
}

export async function saveAuditResult(jobId: string, report: string, result: StructuredAuditResult): Promise<void> {
  await db.transaction(async (tx) => {
    const pageIds = new Map<string, string>()
    if (result.pages.length) {
      const pages = result.pages.map(({ page }) => {
        const id = crypto.randomUUID(); pageIds.set(page.url, id)
        return { id, jobId, url: page.url, finalUrl: page.finalUrl, httpStatus: page.status, title: page.title, description: page.description, h1Count: page.h1s.length, canonical: page.canonical, robots: page.robots, lang: page.lang, textLength: page.textLength, images: page.images, imagesWithoutAlt: page.imagesWithoutAlt, error: page.error ?? null }
      })
      await tx.insert(auditPage).values(pages)
    }
    const checks = [
      ...result.siteChecks.map((check) => ({ pageId: null, ...check })),
      ...result.pages.flatMap(({ page, checks }) => checks.map((check) => ({ pageId: pageIds.get(page.url)!, ...check }))),
    ].map((check, position) => ({ id: crypto.randomUUID(), jobId, position, ...check }))
    if (checks.length) await tx.insert(auditCheck).values(checks)
    await tx.update(auditJob).set({ status: "done", progress: null, report, error: null, updatedAt: new Date(), completedAt: new Date(), ...result.summary })
      .where(sql`${auditJob.id} = ${jobId}`)
  })
}
