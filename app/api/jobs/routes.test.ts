import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadOwnedAuditJob: vi.fn(),
  auditJobs: new Map<string, { status: "running" | "done" | "error"; createdAt: number; ownerId?: string; report?: string }>(),
}))

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }))
vi.mock("@/lib/dashboard-audits", () => ({ loadOwnedAuditJob: mocks.loadOwnedAuditJob }))
vi.mock("@/lib/audit-jobs", () => ({
  auditJobs: mocks.auditJobs,
  canReadAuditJob: (job: { ownerId?: string }, userId?: string) => !job.ownerId || job.ownerId === userId,
}))

import { GET as getJob } from "./[id]/route"
import { GET as getReport } from "./[id]/report/route"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe("audit job route ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auditJobs.clear()
  })

  it("keeps public jobs available without login", async () => {
    mocks.auditJobs.set("public", { status: "done", createdAt: 1, report: "# Public" })
    const status = await getJob(new Request("http://localhost"), context("public"))
    const report = await getReport(new Request("http://localhost"), context("public"))
    expect(status.status).toBe(200)
    expect(report.status).toBe(200)
    expect(await report.text()).toBe("# Public")
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("hides a dashboard job from another user", async () => {
    mocks.auditJobs.set("private", { status: "running", createdAt: 1, ownerId: "owner" })
    mocks.getSession.mockResolvedValue({ user: { id: "other" } })
    mocks.loadOwnedAuditJob.mockResolvedValue(undefined)
    const status = await getJob(new Request("http://localhost"), context("private"))
    const report = await getReport(new Request("http://localhost"), context("private"))
    expect(status.status).toBe(404)
    expect(report.status).toBe(404)
  })

  it("loads a persisted report for its owner after process memory is gone", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } })
    mocks.loadOwnedAuditJob.mockResolvedValue({ status: "done", report: "# Persisted", progress: null, error: null })
    const status = await getJob(new Request("http://localhost"), context("persisted"))
    const report = await getReport(new Request("http://localhost"), context("persisted"))
    expect(status.status).toBe(200)
    expect((await status.json()).reportUrl).toBe("/api/jobs/persisted/report")
    expect(await report.text()).toBe("# Persisted")
  })
})
