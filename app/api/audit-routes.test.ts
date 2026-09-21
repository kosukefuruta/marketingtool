import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectResults: [] as unknown[][],
  insertValues: vi.fn(),
  startAudit: vi.fn(() => "job-1"),
}))

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }))
vi.mock("@/lib/rate-limit", () => ({ SlidingWindowLimiter: class { checkAndRecord() { return { allowed: true } } } }))
vi.mock("@/lib/client-address", () => ({ clientAddress: () => "test-ip" }))
vi.mock("@/lib/shared-rate-limit", () => ({ checkSharedRateLimit: async () => ({ allowed: true }) }))
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  count: vi.fn(() => "count"),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
}))
vi.mock("@/lib/db/schema", () => ({
  auditJob: { id: "id", userId: "userId", createdAt: "createdAt" },
  site: { id: "id", userId: "userId", normalizedOrigin: "normalizedOrigin" },
  subscription: { userId: "userId", status: "status", gracePeriodEndsAt: "gracePeriodEndsAt" },
}))
vi.mock("@/lib/subscriptions", () => ({
  hasPaidAccess: (status: string | null | undefined) => status === "active" || status === "trialing" || status === "canceling",
}))
vi.mock("@/lib/audit-jobs", () => ({
  startAudit: mocks.startAudit,
}))
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const result = mocks.selectResults.shift() ?? []
          return {
            limit: vi.fn(async () => result),
            then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
          }
        }),
      })),
    })),
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
}))

import { POST as postPublicAudit } from "./audit/route"
import { POST as postDashboardAudit } from "./dashboard/audit/route"

function request(url: string, max: number): Request {
  const form = new FormData()
  form.set("url", url)
  form.set("max", String(max))
  return new Request("http://localhost/api/audit", { method: "POST", body: form })
}

describe("audit route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.startAudit.mockReturnValue("job-1")
  })

  it("keeps the public API at 10 pages even for a signed-in caller", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } })
    const response = await postPublicAudit(request("https://example.com", 11))
    expect(response.status).toBe(400)
    expect(mocks.startAudit).not.toHaveBeenCalled()
  })

  it("requires login for dashboard audits", async () => {
    mocks.getSession.mockResolvedValue(null)
    const response = await postDashboardAudit(request("https://example.com", 100))
    expect(response.status).toBe(401)
  })

  it("rejects dashboard audits without an active paid subscription", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } })
    mocks.selectResults.push(
      [{ id: "site-1", origin: "https://example.com" }],
      [{ status: "canceled", grace: null }],
      [{ value: 0 }],
    )
    const response = await postDashboardAudit(request("https://example.com", 10))
    expect(response.status).toBe(403)
    expect(mocks.startAudit).not.toHaveBeenCalled()
  })

  it("rejects a URL other than the registered site", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } })
    mocks.selectResults.push(
      [{ id: "site-1", origin: "https://example.com" }],
      [{ status: "active", grace: null }],
      [{ value: 0 }],
    )
    const response = await postDashboardAudit(request("https://other.example", 100))
    expect(response.status).toBe(400)
    expect(mocks.startAudit).not.toHaveBeenCalled()
  })

  it("queues an owned audit for a paid user without running it in the web process", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } })
    mocks.selectResults.push(
      [{ id: "site-1", origin: "https://example.com" }],
      [{ status: "active", grace: null }],
      [{ value: 0 }],
    )
    const response = await postDashboardAudit(request("https://example.com", 300))
    expect(response.status).toBe(202)
    expect(mocks.insertValues).toHaveBeenCalledOnce()
    expect(mocks.startAudit).not.toHaveBeenCalled()
  })

  it("limits paid on-demand audits to four per month", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } })
    mocks.selectResults.push(
      [{ id: "site-1", origin: "https://example.com" }],
      [{ status: "active", grace: null }],
      [{ value: 4 }],
    )
    const response = await postDashboardAudit(request("https://example.com", 100))
    expect(response.status).toBe(429)
    expect(mocks.insertValues).not.toHaveBeenCalled()
  })
})
