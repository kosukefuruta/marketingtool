import { describe, expect, it } from "vitest"
import { runWithConcurrency } from "./async-pool"

describe("runWithConcurrency", () => {
  it("processes every item without exceeding the limit", async () => {
    let active = 0
    let maximum = 0
    const completed: number[] = []
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      completed.push(item)
      active -= 1
    })
    expect(maximum).toBeLessThanOrEqual(2)
    expect(completed.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it("rejects an invalid limit", async () => {
    await expect(runWithConcurrency([1], 0, async () => {})).rejects.toThrow()
  })
})
