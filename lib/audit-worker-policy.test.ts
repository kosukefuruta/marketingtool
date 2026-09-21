import { describe, expect, it } from "vitest"
import { MAX_CONSECUTIVE_INFRASTRUCTURE_FAILURES, retryDelayMs, shouldRetry, shouldStopWorker } from "./audit-worker-policy"

describe("audit worker retry policy", () => {
  it("retries twice with increasing delays", () => {
    expect(shouldRetry(1)).toBe(true)
    expect(retryDelayMs(1)).toBe(30_000)
    expect(shouldRetry(2)).toBe(true)
    expect(retryDelayMs(2)).toBe(120_000)
    expect(shouldRetry(3)).toBe(false)
  })

  it("stops after repeated infrastructure failures", () => {
    expect(shouldStopWorker(MAX_CONSECUTIVE_INFRASTRUCTURE_FAILURES - 1)).toBe(false)
    expect(shouldStopWorker(MAX_CONSECUTIVE_INFRASTRUCTURE_FAILURES)).toBe(true)
  })
})
