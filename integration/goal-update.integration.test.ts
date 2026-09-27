import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ session: { userId: "u1" } }))

vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: mocks.session.userId } }),
  getSession: async () => ({ user: { id: mocks.session.userId } }),
}))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

const enabled = process.env.RUN_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL)

if (!enabled) {
  describe.skip("goal updates", () => {
    it("requires RUN_INTEGRATION_TESTS and DATABASE_URL", () => {})
  })
} else {
  const { db } = await import("../lib/db")
  const { goal, goalCtaPage, goalKeyEvent, site, user } = await import("../lib/db/schema")
  const { updateGoal } = await import("../app/actions")
  const { eq } = await import("drizzle-orm")

  type GoalOverrides = Partial<typeof goal.$inferInsert>

  function form(entries: Record<string, string>): FormData {
    const data = new FormData()
    for (const [key, value] of Object.entries(entries)) data.append(key, value)
    return data
  }

  const loadGoal = async () => (await db.select().from(goal).where(eq(goal.id, "g1")))[0]

  async function seedGoal(overrides: GoalOverrides = {}, siteCategory: string | null = null) {
    const now = new Date()
    await db.insert(user).values([
      { id: "u1", name: "Owner", email: "owner@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "u2", name: "Other", email: "other@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ])
    await db.insert(site).values({
      id: "s1", userId: "u1", name: "Example", inputUrl: "https://example.com", normalizedOrigin: "https://example.com",
      category: siteCategory, createdAt: now, updatedAt: now,
    })
    await db.insert(goal).values({
      id: "g1", userId: "u1", siteId: "s1", name: "コンバージョン数を10件にする", subjectType: "site", subjectValue: null,
      metric: "conversions", baselineValue: null, targetValue: 10, period: "monthly", createdAt: now, updatedAt: now,
      ...overrides,
    })
  }

  beforeEach(async () => {
    mocks.session.userId = "u1"
    await db.delete(goal)
    await db.delete(site)
    await db.delete(user)
  })

  it("rewrites the derived fields when the metric and target change", async () => {
    await seedGoal()

    const result = await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "averagePosition", targetValue: "3", subjectValue: "SEOツール" }))

    expect(result.error).toBeUndefined()
    expect(result.success).toBeTruthy()
    const updated = await loadGoal()
    expect(updated.metric).toBe("averagePosition")
    expect(updated.targetValue).toBe(3)
    expect(updated.subjectType).toBe("keyword")
    expect(updated.subjectValue).toBe("SEOツール")
    expect(updated.period).toBe("point")
    expect(updated.name).toBe("「SEOツール」で3位を目指す")
  })

  it("keeps the site subject and the monthly period when only the target changes", async () => {
    await seedGoal()

    await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "conversions", targetValue: "25" }))

    const updated = await loadGoal()
    expect(updated.targetValue).toBe(25)
    expect(updated.subjectType).toBe("site")
    expect(updated.subjectValue).toBeNull()
    expect(updated.period).toBe("monthly")
    expect(updated.name).toBe("コンバージョン数を25件にする")
  })

  it("removes the key events and CTA pages a metric without funnel stages cannot use", async () => {
    await seedGoal()
    const now = new Date()
    await db.insert(goalKeyEvent).values({ id: "k1", goalId: "g1", stage: "conversion", eventName: "contact", createdAt: now })
    await db.insert(goalCtaPage).values({ id: "c1", goalId: "g1", path: "/contact", createdAt: now })

    await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "pageviews", targetValue: "50000" }))

    expect(await db.select().from(goalKeyEvent).where(eq(goalKeyEvent.goalId, "g1"))).toHaveLength(0)
    expect(await db.select().from(goalCtaPage).where(eq(goalCtaPage.goalId, "g1"))).toHaveLength(0)
  })

  it("drops the stages the new metric does not use and keeps the CTA pages", async () => {
    await seedGoal({ metric: "paidContracts", name: "有料契約数を5件にする", targetValue: 5 })
    const now = new Date()
    await db.insert(goalKeyEvent).values([
      { id: "k1", goalId: "g1", stage: "free_registration", eventName: "sign_up", createdAt: now },
      { id: "k2", goalId: "g1", stage: "paid_contract", eventName: "purchase", createdAt: now },
    ])
    await db.insert(goalCtaPage).values({ id: "c1", goalId: "g1", path: "/pricing", createdAt: now })

    await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "conversions", targetValue: "30" }))

    expect(await db.select().from(goalKeyEvent).where(eq(goalKeyEvent.goalId, "g1"))).toHaveLength(0)
    expect(await db.select().from(goalCtaPage).where(eq(goalCtaPage.goalId, "g1"))).toHaveLength(1)
  })

  it("clears the observed page RPM when the goal leaves the ad revenue metric", async () => {
    await seedGoal({ metric: "adRevenue", name: "広告収益を50,000円にする", targetValue: 50000, pageRpm: 300, pageRpmRevenue: 1300, pageRpmPageviews: 4430 }, "technology")

    await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "revenue", targetValue: "200000" }))

    const updated = await loadGoal()
    expect(updated.metric).toBe("revenue")
    expect(updated.pageRpm).toBeNull()
    expect(updated.pageRpmRevenue).toBeNull()
    expect(updated.pageRpmPageviews).toBeNull()
  })

  it("keeps the observed page RPM and saves the category while staying on ad revenue", async () => {
    await seedGoal({ metric: "adRevenue", name: "広告収益を50,000円にする", targetValue: 50000, pageRpmRevenue: 1300, pageRpmPageviews: 4430 }, "technology")

    const result = await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "adRevenue", targetValue: "80000", category: "business" }))

    expect(result.error).toBeUndefined()
    const updated = await loadGoal()
    expect(updated.targetValue).toBe(80000)
    expect(updated.pageRpmRevenue).toBe(1300)
    expect(updated.pageRpmPageviews).toBe(4430)
    const [updatedSite] = await db.select().from(site).where(eq(site.id, "s1"))
    expect(updatedSite.category).toBe("business")
  })

  it("requires a site category before switching to the ad revenue metric", async () => {
    await seedGoal()

    const result = await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "adRevenue", targetValue: "50000" }))

    expect(result.error).toContain("サイトジャンル")
    expect((await loadGoal()).metric).toBe("conversions")
  })

  it("rejects an out-of-range target without touching the goal", async () => {
    await seedGoal({ metric: "ctr", name: "検索クリック率を5%にする", targetValue: 5 })

    const result = await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "ctr", targetValue: "150" }))

    expect(result.error).toContain("0〜100%")
    expect((await loadGoal()).targetValue).toBe(5)
  })

  it("refuses to change a goal owned by another user", async () => {
    await seedGoal()
    mocks.session.userId = "u2"

    const result = await updateGoal({}, form({ siteId: "s1", goalId: "g1", metric: "pageviews", targetValue: "50000" }))

    expect(result.error).toBe("目標が見つかりません。")
    const untouched = await loadGoal()
    expect(untouched.metric).toBe("conversions")
    expect(untouched.targetValue).toBe(10)
  })
}
