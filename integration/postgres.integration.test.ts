import { beforeEach, describe, expect, it } from "vitest"

const enabled = process.env.RUN_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL)

if (!enabled) {
  describe.skip("PostgreSQL audit infrastructure", () => {
    it("requires RUN_INTEGRATION_TESTS and DATABASE_URL", () => {})
  })
} else {
  const { db } = await import("../lib/db")
  const { auditCheck, auditJob, auditPage, rateLimitEvent, site, subscription, user } = await import("../lib/db/schema")
  const { checkSharedRateLimit } = await import("../lib/shared-rate-limit")
  const { claimAuditJob, recoverInterruptedAuditJobs } = await import("../lib/audit-queue")
  const { saveAuditResult } = await import("../lib/audit-result-store")
  const { deleteExpiredAuditData } = await import("../lib/audit-retention")

  beforeEach(async () => {
    await db.delete(auditJob)
    await db.delete(site)
    await db.delete(user)
    await db.delete(rateLimitEvent)
  })

  async function seedJob(id = "j1") {
    const now = new Date()
    await db.insert(user).values({ id: "u1", name: "Test", email: "queue@example.com", emailVerified: true, createdAt: now, updatedAt: now })
    await db.insert(site).values({ id: "s1", userId: "u1", name: "Example", inputUrl: "https://example.com", normalizedOrigin: "https://example.com", createdAt: now, updatedAt: now })
    await db.insert(auditJob).values({ id, userId: "u1", siteId: "s1", targetUrl: "https://example.com", maxPages: 10, status: "queued", createdAt: now, updatedAt: now })
  }

  it("enforces a shared concurrent rate limit and stores only a hash", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => checkSharedRateLimit("203.0.113.10", 60_000, 3)))
    expect(results.filter((result) => result.allowed)).toHaveLength(3)
    const rows = await db.select().from(rateLimitEvent)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.key !== "203.0.113.10" && /^[a-f0-9]{64}$/.test(row.key))).toBe(true)
  })

  it("claims a queued job once and recovers an interrupted job", async () => {
    await seedJob()

    const [first, second] = await Promise.all([claimAuditJob(), claimAuditJob()])
    expect([first?.id, second?.id].filter(Boolean)).toEqual(["j1"])

    await db.update(auditJob).set({ updatedAt: new Date(Date.now() - 13 * 60 * 1000) })
    await recoverInterruptedAuditJobs()
    const [recovered] = await db.select().from(auditJob)
    expect(recovered.status).toBe("queued")
    expect(recovered.attemptCount).toBe(1)
  })

  it("stores structured results atomically", async () => {
    await seedJob()
    const result = {
      summary: { auditedPages: 1, discoveredUrls: 1, goodCount: 1, reviewCount: 0, improveCount: 0, unreachableCount: 0 },
      siteChecks: [{ item: "robots.txt", evaluation: "良好", detail: "正常" }],
      pages: [{ page: { url: "https://example.com/", finalUrl: "https://example.com/", status: 200, title: "Example", description: "Example", h1s: ["Example"], canonical: "https://example.com/", robots: "", lang: "en", textLength: 100, images: 0, imagesWithoutAlt: 0 }, checks: [{ item: "title", evaluation: "良好", detail: "Example" }] }],
    }
    await saveAuditResult("j1", "# Report", result)
    expect(await db.select().from(auditPage)).toHaveLength(1)
    expect(await db.select().from(auditCheck)).toHaveLength(2)
    expect((await db.select().from(auditCheck)).map((check) => check.position).sort()).toEqual([0, 1])
    const [job] = await db.select().from(auditJob)
    expect(job.status).toBe("done")
    expect(job.report).toBe("# Report")
  })

  it("deletes audit data 90 days after paid access ended", async () => {
    await seedJob()
    const ended = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    await db.insert(subscription).values({
      id: "sub-1", userId: "u1", stripeCustomerId: "cus-1", status: "canceled",
      currentPeriodEnd: ended, createdAt: ended, updatedAt: ended,
    })

    expect(await deleteExpiredAuditData()).toBe(1)
    expect(await db.select().from(auditJob)).toHaveLength(0)
  })

  it("rolls back all structured rows when result storage fails", async () => {
    await seedJob()
    const invalid = {
      summary: { auditedPages: 1, discoveredUrls: 1, goodCount: 0, reviewCount: 0, improveCount: 1, unreachableCount: 0 },
      siteChecks: [{ item: "robots.txt", evaluation: "良好", detail: "正常" }],
      pages: [{ page: { url: "https://example.com/", finalUrl: "https://example.com/", status: 200, title: undefined, description: "", h1s: [], canonical: "", robots: "", lang: "", textLength: 0, images: 0, imagesWithoutAlt: 0 }, checks: [] }],
    }
    await expect(saveAuditResult("j1", "# Report", invalid as never)).rejects.toThrow()
    expect(await db.select().from(auditPage)).toHaveLength(0)
    expect(await db.select().from(auditCheck)).toHaveLength(0)
    const [job] = await db.select().from(auditJob)
    expect(job.status).toBe("queued")
  })
}
