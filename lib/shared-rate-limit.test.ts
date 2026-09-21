import { afterEach, describe, expect, it } from "vitest"
import { clientAddress } from "./client-address"

describe("clientAddress", () => {
  afterEach(() => { delete process.env.TRUSTED_PROXY_HEADER })

  it("does not trust forwarding headers unless configured", () => {
    const request = new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.1" } })
    expect(clientAddress(request)).toBe("unknown")
  })

  it("accepts only a valid IP from the configured trusted header", () => {
    process.env.TRUSTED_PROXY_HEADER = "x-real-ip"
    expect(clientAddress(new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.1" } }))).toBe("203.0.113.1")
    expect(clientAddress(new Request("https://example.com", { headers: { "x-real-ip": "spoofed" } }))).toBe("unknown")
  })

  it("uses the Koyeb-certified last address in a trusted forwarded chain", () => {
    process.env.TRUSTED_PROXY_HEADER = "x-forwarded-for"
    const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" } })
    expect(clientAddress(request)).toBe("10.0.0.1")
  })
})
