import { describe, expect, it } from "vitest"
import { canReadAuditJob, type AuditJob } from "./audit-jobs"

const publicJob: AuditJob = { status: "running", createdAt: 1 }
const privateJob: AuditJob = { status: "running", createdAt: 1, ownerId: "user-1" }

describe("audit job access", () => {
  it("keeps public audit jobs accessible without a session", () => {
    expect(canReadAuditJob(publicJob)).toBe(true)
  })

  it("allows only the owner to read a dashboard audit job", () => {
    expect(canReadAuditJob(privateJob, "user-1")).toBe(true)
    expect(canReadAuditJob(privateJob, "user-2")).toBe(false)
    expect(canReadAuditJob(privateJob)).toBe(false)
  })
})
