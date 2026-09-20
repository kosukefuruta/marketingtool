import { describe, expect, it } from "vitest"
import { normalizeEmail } from "./email-normalize"

describe("normalizeEmail", () => {
  it("trims, lowercases, and removes Gmail aliases", () => {
    expect(normalizeEmail(" Some.Name+news@GMAIL.com ")).toBe("somename@gmail.com")
  })

  it("keeps dots for non-Gmail domains", () => {
    expect(normalizeEmail("Some.Name+news@example.com")).toBe("some.name@example.com")
  })
})
