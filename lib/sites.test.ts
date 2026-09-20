import { describe, expect, it } from "vitest"
import { defaultSiteName, normalizePublicSiteUrl } from "./sites"

describe("site URL validation", () => {
  it("rejects localhost and private IP addresses", async () => {
    await expect(normalizePublicSiteUrl("localhost:3000")).rejects.toThrow("ローカル")
    await expect(normalizePublicSiteUrl("http://127.0.0.1")).rejects.toThrow("公開サイト")
    await expect(normalizePublicSiteUrl("http://192.168.1.2")).rejects.toThrow("公開サイト")
  })

  it("derives a readable default name", () => {
    expect(defaultSiteName("https://www.example.com")).toBe("example.com")
  })
})
