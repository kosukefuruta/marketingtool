import { describe, expect, it } from "vitest"
import { groupGoalKeyEvents, isValidGoogleEventName, keyEventFieldName, keyEventStagesForMetric, manualKeyEventFieldName } from "./goal-key-events"

describe("goal key events", () => {
  it("returns the stages used by each supported metric", () => {
    expect(keyEventStagesForMetric("conversions")).toEqual(["conversion"])
    expect(keyEventStagesForMetric("paidContracts")).toEqual(["free_registration", "paid_contract"])
    expect(keyEventStagesForMetric("adRevenue")).toEqual([])
  })

  it("builds distinct form field names for each stage", () => {
    expect(keyEventFieldName("free_registration")).toBe("free_registrationKeyEvent")
    expect(manualKeyEventFieldName("free_registration")).toBe("free_registrationManualKeyEvents")
  })

  it("groups saved events and ignores unknown stages", () => {
    expect(groupGoalKeyEvents([
      { stage: "free_registration", eventName: "sign_up" },
      { stage: "paid_contract", eventName: "purchase" },
      { stage: "unknown", eventName: "ignored" },
    ])).toEqual({
      free_registration: ["sign_up"],
      paid_contract: ["purchase"],
    })
  })

  it("accepts GA4 event names containing non-English letters", () => {
    expect(isValidGoogleEventName("無料登録_完了1")).toBe(true)
    expect(isValidGoogleEventName("sign_up")).toBe(true)
  })

  it("rejects invalid starts, symbols, and names over 40 characters", () => {
    expect(isValidGoogleEventName("_sign_up")).toBe(false)
    expect(isValidGoogleEventName("sign-up")).toBe(false)
    expect(isValidGoogleEventName(`a${"1".repeat(39)}`)).toBe(true)
    expect(isValidGoogleEventName(`a${"1".repeat(40)}`)).toBe(false)
  })
})
