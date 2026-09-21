import { describe, expect, it } from "vitest"
import { parsePageRpmObservation } from "./page-rpm"

describe("page RPM observations", () => {
  it("calculates RPM and weight from revenue and pageviews", () => {
    expect(parsePageRpmObservation("1.3", "443")).toEqual({
      value: {
        revenue: 1.3,
        pageviews: 443,
        rpm: 1.3 / 443 * 1000,
        weight: 443 / 10_443,
      },
      error: null,
    })
  })

  it("accepts zero revenue as an observation", () => {
    expect(parsePageRpmObservation("0", "10000").value).toMatchObject({ revenue: 0, pageviews: 10_000, rpm: 0, weight: 0.5 })
  })

  it("requires revenue and pageviews together", () => {
    expect(parsePageRpmObservation("1.3", "").error).toBe("広告収益と計測PV数は両方入力してください。")
    expect(parsePageRpmObservation("", "443").error).toBe("広告収益と計測PV数は両方入力してください。")
    expect(parsePageRpmObservation("", "")).toEqual({ value: null, error: null })
  })

  it("rejects invalid revenue and pageviews", () => {
    expect(parsePageRpmObservation("-1", "443").error).toBe("広告収益は0以上の数値で入力してください。")
    expect(parsePageRpmObservation("1.3", "1.5").error).toBe("計測PV数は1以上の整数で入力してください。")
    expect(parsePageRpmObservation("1.3", "9007199254740992").error).toBe("計測PV数は1以上の整数で入力してください。")
  })
})
