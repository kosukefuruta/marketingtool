import { describe, expect, it } from "vitest"
import { priorFromThreePoints, updateRate } from "./bayesian-rate"

describe("Bayesian rate updates", () => {
  it("reproduces the elicited P15, P50, and P85 points", () => {
    const prior = priorFromThreePoints(0.005, 0.01, 0.02)
    const estimate = updateRate(0, 0, prior)!
    expect(estimate.low).toBeCloseTo(0.005, 3)
    expect(estimate.median).toBeCloseTo(0.01, 3)
    expect(estimate.high).toBeCloseTo(0.02, 3)
  })

  it("moves smoothly toward zero when no successes are observed", () => {
    const prior = priorFromThreePoints(0.005, 0.01, 0.02)
    const small = updateRate(0, 100, prior)!
    const large = updateRate(0, 10_000, prior)!
    expect(small.median).toBeGreaterThan(large.median)
    expect(large.median).toBeGreaterThan(0)
  })

  it("lets a large sample dominate the initial distribution", () => {
    const prior = priorFromThreePoints(0.005, 0.01, 0.02)
    const estimate = updateRate(500, 10_000, prior)!
    expect(estimate.median).toBeCloseTo(0.05, 2)
    expect(estimate.low).toBeLessThan(estimate.median)
    expect(estimate.high).toBeGreaterThan(estimate.median)
  })

  it("supports measured-only rates and invalid input", () => {
    expect(updateRate(20, 1_000)?.observed).toBe(0.02)
    expect(updateRate(2, 1)).toBeNull()
  })

  it("rejects a three-point prior whose smooth transform is not monotonic", () => {
    expect(() => priorFromThreePoints(0.001, 0.5, 0.51)).toThrow("too asymmetric")
    expect(updateRate(1, 10, { low: 0.001, median: 0.5, high: 0.51 })).toBeNull()
    expect(updateRate(1, 10, { low: 0.2, median: 0.1, high: 0.3 })).toBeNull()
  })
})
