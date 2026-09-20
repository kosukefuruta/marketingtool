import { describe, expect, it } from "vitest"
import { SlidingWindowLimiter } from "./rate-limit"

describe("SlidingWindowLimiter", () => {
  it("rejects excess attempts and permits them after the window", () => {
    const limiter = new SlidingWindowLimiter(1_000, 2)
    expect(limiter.checkAndRecord("user", 0)).toEqual({ allowed: true })
    expect(limiter.checkAndRecord("user", 100)).toEqual({ allowed: true })
    expect(limiter.checkAndRecord("user", 200)).toEqual({ allowed: false, retryAfter: 1 })
    expect(limiter.checkAndRecord("user", 1_000)).toEqual({ allowed: true })
  })
})
