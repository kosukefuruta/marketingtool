import { describe, expect, it } from "vitest"
import { CTA_PAGE_LIMIT, parseCtaPagePaths } from "./goal-cta-pages"

describe("CTA page paths", () => {
  it("normalizes same-site absolute URLs and paths", () => {
    expect(parseCtaPagePaths("/\n/contact?from=top\nhttps://example.com/lp#form", "https://example.com")).toEqual({
      paths: ["/", "/contact", "/lp"],
    })
  })

  it("deduplicates paths after removing query strings", () => {
    expect(parseCtaPagePaths("/contact?a=1\n/contact?a=2", "https://example.com").paths).toEqual(["/contact"])
  })

  it("rejects pages from another origin", () => {
    expect(parseCtaPagePaths("https://other.example/contact", "https://example.com").error).toContain("同じサイト")
  })

  it("limits the number of pages", () => {
    const input = Array.from({ length: CTA_PAGE_LIMIT + 1 }, (_, index) => `/page-${index}`).join("\n")
    expect(parseCtaPagePaths(input, "https://example.com").error).toContain(`${CTA_PAGE_LIMIT}件`)
  })

  it("rejects an excessively long URL", () => {
    expect(parseCtaPagePaths(`/page-${"a".repeat(2_048)}`, "https://example.com").error).toContain("2,048文字")
  })
})
