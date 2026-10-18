import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ session: { userId: "u1" } }))

vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: mocks.session.userId } }),
  getSession: async () => ({ user: { id: mocks.session.userId } }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

const enabled = process.env.RUN_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL)

if (!enabled) {
  describe.skip("site keywords", () => {
    it("requires RUN_INTEGRATION_TESTS and DATABASE_URL", () => {})
  })
} else {
  const { db } = await import("../lib/db")
  const { site, siteKeyword, sitePage, user } = await import("../lib/db/schema")
  const { saveSiteKeywords, updateSiteKeyword } = await import("../app/actions")
  const { asc, eq } = await import("drizzle-orm")

  function form(entries: Record<string, string>): FormData {
    const data = new FormData()
    for (const [key, value] of Object.entries(entries)) data.append(key, value)
    return data
  }

  const html = `<script type="application/ld+json">{"@type":"Article","datePublished":"2026-09-20T00:00:00.000Z","dateModified":"2026-10-01T00:00:00.000Z"}</script>`

  beforeEach(async () => {
    mocks.session.userId = "u1"
    await db.delete(site)
    await db.delete(user)
    const now = new Date()
    await db.insert(user).values([
      { id: "u1", name: "Owner", email: "owner@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "u2", name: "Other", email: "other@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ])
    await db.insert(site).values({ id: "s1", userId: "u1", name: "Example", inputUrl: "https://example.com", normalizedOrigin: "https://example.com", createdAt: now, updatedAt: now })
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(html, { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("registers keywords, assigns pages and reads the page dates", async () => {
    const result = await saveSiteKeywords({}, form({ siteId: "s1", keywords: "youtube 収益化 条件\thttps://example.com/guides/a/\nyoutube 収益化 昔 /guides/a/\nyoutube スパチャ" }))

    expect(result.error).toBeUndefined()
    const keywords = await db.select().from(siteKeyword).orderBy(asc(siteKeyword.normalizedKeyword))
    expect(keywords.map((row) => [row.keyword, row.pagePath])).toEqual([
      ["youtube スパチャ", null],
      ["youtube 収益化 昔", "/guides/a/"],
      ["youtube 収益化 条件", "/guides/a/"],
    ])
    const [page] = await db.select().from(sitePage).where(eq(sitePage.path, "/guides/a/"))
    expect(page.publishedAt?.toISOString()).toBe("2026-09-20T00:00:00.000Z")
    expect(page.modifiedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it("keeps the existing page when a keyword is re-registered without a URL", async () => {
    await saveSiteKeywords({}, form({ siteId: "s1", keywords: "youtube 収益化 条件\t/guides/a/" }))
    await saveSiteKeywords({}, form({ siteId: "s1", keywords: "YouTube　収益化 条件\nyoutube 収益化 審査\t/guides/b/" }))

    const keywords = await db.select().from(siteKeyword).orderBy(asc(siteKeyword.normalizedKeyword))
    expect(keywords.map((row) => [row.normalizedKeyword, row.pagePath])).toEqual([
      ["youtube 収益化 審査", "/guides/b/"],
      ["youtube 収益化 条件", "/guides/a/"],
    ])
  })

  it("does not let another user edit the site", async () => {
    mocks.session.userId = "u2"
    const result = await saveSiteKeywords({}, form({ siteId: "s1", keywords: "youtube 収益化" }))
    expect(result.error).toBe("サイトが見つかりません。")
    expect(await db.select().from(siteKeyword)).toEqual([])
  })

  it("unassigns a page when the URL is cleared", async () => {
    await saveSiteKeywords({}, form({ siteId: "s1", keywords: "youtube 収益化 条件\t/guides/a/" }))
    const [row] = await db.select().from(siteKeyword)
    const result = await updateSiteKeyword({}, form({ siteId: "s1", keywordId: row.id, pageUrl: "", memo: "ピラーで受ける" }))

    expect(result.success).toBe("保存しました。")
    const [updated] = await db.select().from(siteKeyword)
    expect(updated.pagePath).toBeNull()
    expect(updated.memo).toBe("ピラーで受ける")
  })
}
