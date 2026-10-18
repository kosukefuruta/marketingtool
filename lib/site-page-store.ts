import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { runWithConcurrency } from "./async-pool"
import { db } from "./db"
import { sitePage } from "./db/schema"
import { fetchPageDates, PageDatesError } from "./page-dates"

// 1回の操作で取りに行くページ数の上限。残りは「日付を取り直す」で続きから取る。
export const PAGE_DATES_FETCH_LIMIT = 120
const PAGE_DATES_CONCURRENCY = 6

export async function ensureSitePages(siteId: string, paths: string[]): Promise<void> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return
  const now = new Date()
  await db.insert(sitePage)
    .values(unique.map((path) => ({ id: crypto.randomUUID(), siteId, path, createdAt: now, updatedAt: now })))
    .onConflictDoNothing({ target: [sitePage.siteId, sitePage.path] })
}

// onlyMissing のときは、まだ日付を取っていないページだけを取りに行く。
export async function refreshSitePageDates(siteId: string, siteOrigin: string, options: { paths?: string[]; onlyMissing?: boolean } = {}): Promise<{ fetched: number; remaining: number }> {
  const conditions = [eq(sitePage.siteId, siteId)]
  if (options.paths) {
    if (options.paths.length === 0) return { fetched: 0, remaining: 0 }
    conditions.push(inArray(sitePage.path, options.paths))
  }
  if (options.onlyMissing) conditions.push(isNull(sitePage.datesFetchedAt))
  // 取得が古い順（未取得が先頭）に取るので、上限で切れても次の操作で続きから進む。
  const targets = await db.select({ id: sitePage.id, path: sitePage.path }).from(sitePage).where(and(...conditions))
    .orderBy(sql`${sitePage.datesFetchedAt} asc nulls first`)
  const batch = targets.slice(0, PAGE_DATES_FETCH_LIMIT)

  await runWithConcurrency(batch, PAGE_DATES_CONCURRENCY, async (page) => {
    const now = new Date()
    try {
      const dates = await fetchPageDates(new URL(page.path, siteOrigin).href, siteOrigin)
      await db.update(sitePage).set({
        publishedAt: dates.publishedAt,
        modifiedAt: dates.modifiedAt,
        title: dates.title,
        datesFetchedAt: now,
        datesError: dates.publishedAt || dates.modifiedAt ? null : "ページに公開日・更新日の記載が見つかりませんでした。",
        updatedAt: now,
      }).where(eq(sitePage.id, page.id))
    } catch (error) {
      const message = error instanceof PageDatesError ? error.message : "ページを取得できませんでした。"
      await db.update(sitePage).set({ datesFetchedAt: now, datesError: message, updatedAt: now }).where(eq(sitePage.id, page.id))
    }
  })
  return { fetched: batch.length, remaining: targets.length - batch.length }
}
