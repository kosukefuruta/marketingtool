import { describe, expect, it } from "vitest"
import { searchConsoleSiteMatches } from "./google-property-match"

describe("Search Console property matching", () => {
  it("matches URL-prefix and domain properties", () => {
    expect(searchConsoleSiteMatches("https://example.com/", "https://example.com")).toBe(true)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://example.com")).toBe(true)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://www.example.com")).toBe(true)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://news.jp.example.com")).toBe(true)
  })

  it("does not match another domain", () => {
    expect(searchConsoleSiteMatches("sc-domain:other.example", "https://example.com")).toBe(false)
    expect(searchConsoleSiteMatches("sc-domain:example.com", "https://notexample.com")).toBe(false)
  })
})
