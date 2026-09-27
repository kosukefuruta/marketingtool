import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearSearchVolumeCache, DataForSeoError, fetchSearchVolumes, hasDataForSeoCredentials, SEARCH_VOLUME_BATCH_SIZE } from "./dataforseo"

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function volumeResponse(rows: Array<{ keyword: string; search_volume?: number | null; competition_index?: number | null }>): Response {
  return jsonResponse({ status_code: 20000, tasks: [{ status_code: 20000, result: rows }] })
}

describe("DataForSEO search volumes", () => {
  beforeEach(() => {
    clearSearchVolumeCache()
    process.env.DATAFORSEO_LOGIN = "test-login"
    process.env.DATAFORSEO_PASSWORD = "test-password"
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.DATAFORSEO_LOGIN
    delete process.env.DATAFORSEO_PASSWORD
  })

  it("asks for Japanese volumes with basic authentication", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([
      { keyword: "seo ツール", search_volume: 1900, competition_index: 42 },
    ]))

    const volumes = await fetchSearchVolumes(["seo ツール"])

    expect(volumes).toEqual([{ keyword: "seo ツール", volume: 1900, competition: 42 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/v3/keywords_data/google_ads/search_volume/live")
    expect(new Headers(init?.headers).get("authorization")).toBe(`Basic ${Buffer.from("test-login:test-password").toString("base64")}`)
    expect(JSON.parse(String(init?.body))).toEqual([{ keywords: ["seo ツール"], location_code: 2392, language_code: "ja" }])
  })

  it("keeps a keyword whose volume is unknown", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([{ keyword: "存在しない語", search_volume: null }]))
    expect(await fetchSearchVolumes(["存在しない語"])).toEqual([{ keyword: "存在しない語", volume: null, competition: null }])
  })

  it("reuses the cached volume instead of asking again", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([{ keyword: "seo", search_volume: 100 }]))

    await fetchSearchVolumes(["seo"])
    const second = await fetchSearchVolumes(["seo"])

    expect(second).toEqual([{ keyword: "seo", volume: 100, competition: null }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("caches by the normalized keyword so a different case still hits", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([
      { keyword: "seo ツール", search_volume: 1900 },
    ]))

    await fetchSearchVolumes(["SEO ツール"])
    const second = await fetchSearchVolumes(["SEO ツール"])

    expect(second[0].volume).toBe(1900)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("remembers the keywords the API returned nothing for", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([]))

    const first = await fetchSearchVolumes(["誰も検索しない語"])
    const second = await fetchSearchVolumes(["誰も検索しない語"])

    expect(first).toEqual([{ keyword: "誰も検索しない語", volume: null, competition: null }])
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("splits the keywords into batches the API accepts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([]))
    await fetchSearchVolumes(Array.from({ length: SEARCH_VOLUME_BATCH_SIZE + 1 }, (_, index) => `keyword-${index}`))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))[0].keywords).toHaveLength(SEARCH_VOLUME_BATCH_SIZE)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))[0].keywords).toHaveLength(1)
  })

  it("drops blanks and duplicates before asking", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => volumeResponse([{ keyword: "seo", search_volume: 100 }]))
    await fetchSearchVolumes([" seo ", "seo", "", "   "])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))[0].keywords).toEqual(["seo"])
  })

  it("asks for nothing when there is no keyword", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    expect(await fetchSearchVolumes([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("treats a failed task as an error even when HTTP succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "invalid" }] }))
    await expect(fetchSearchVolumes(["seo"])).rejects.toBeInstanceOf(DataForSeoError)
  })

  it("reports an HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({}, 401))
    await expect(fetchSearchVolumes(["seo"])).rejects.toThrow("401")
  })

  it("reports whether the credentials are configured", () => {
    expect(hasDataForSeoCredentials()).toBe(true)
    delete process.env.DATAFORSEO_PASSWORD
    expect(hasDataForSeoCredentials()).toBe(false)
  })

  it("refuses to call without credentials", async () => {
    delete process.env.DATAFORSEO_LOGIN
    const fetchMock = vi.spyOn(globalThis, "fetch")
    await expect(fetchSearchVolumes(["seo"])).rejects.toThrow("認証情報")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
