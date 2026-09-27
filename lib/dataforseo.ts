/**
 * DataForSEOのクライアント。
 *
 * 取得したデータの保存とユーザーへの表示の可否はDataForSEOへ未確認のため（docs/dataforseo-research.md §8-1）、
 * 当面は結果をDBへ保存せず、プロセス内のキャッシュだけに置く。
 */
const BASE_URL = process.env.DATAFORSEO_BASE_URL ?? "https://api.dataforseo.com"
const REQUEST_TIMEOUT_MS = 20_000
const TASK_SUCCESS = 20000
/** 日本・日本語。docs/dataforseo-research.md §7 */
export const JAPAN_LOCATION_CODE = 2392
export const JAPANESE_LANGUAGE_CODE = "ja"
/** 1タスクあたりのキーワード上限。 */
export const SEARCH_VOLUME_BATCH_SIZE = 1000
const VOLUME_CACHE_MS = 7 * 24 * 60 * 60 * 1000

export class DataForSeoError extends Error {}

function credentials(): string {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) throw new DataForSeoError("DataForSEOの認証情報が設定されていません。")
  return Buffer.from(`${login}:${password}`).toString("base64")
}

type TaskResponse<T> = { status_code?: number; status_message?: string; tasks?: Array<{ status_code?: number; status_message?: string; result?: T[] | null }> }

/** タスク結果を平坦化して返す。HTTP 200でもタスク側が失敗することがあるため、両方を検査する。 */
export async function dataForSeoPost<T>(path: string, payload: unknown[]): Promise<T[]> {
  // 設定の不足を接続エラーとして握り潰さないよう、送信前に組み立てる。
  const authorization = `Basic ${credentials()}`
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new DataForSeoError("DataForSEOへ接続できませんでした。")
  }
  if (!response.ok) throw new DataForSeoError(`DataForSEOから応答を取得できませんでした（${response.status}）。`)

  const body = await response.json() as TaskResponse<T>
  if (body.status_code !== undefined && body.status_code !== TASK_SUCCESS) {
    throw new DataForSeoError(`DataForSEOがリクエストを受け付けませんでした（${body.status_code}）。`)
  }
  const failed = body.tasks?.find((task) => task.status_code !== TASK_SUCCESS)
  if (failed) throw new DataForSeoError(`DataForSEOのタスクが失敗しました（${failed.status_code}）。`)
  return (body.tasks ?? []).flatMap((task) => task.result ?? [])
}

export type SearchVolume = { keyword: string; volume: number | null; competition: number | null }

type SearchVolumeRow = { keyword?: string; search_volume?: number | null; competition_index?: number | null }

const volumeCache = new Map<string, { expiresAt: number; value: SearchVolume }>()

function cacheKey(keyword: string, locationCode: number, languageCode: string): string {
  return `${locationCode}\n${languageCode}\n${keyword}`
}

/**
 * キーワードの月間検索ボリュームを取得する。
 * ボリュームは日単位で変わる値ではないため、プロセス内に7日間キャッシュする。
 */
export async function fetchSearchVolumes(
  keywords: string[],
  { locationCode = JAPAN_LOCATION_CODE, languageCode = JAPANESE_LANGUAGE_CODE } = {},
): Promise<SearchVolume[]> {
  const unique = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
  if (unique.length === 0) return []

  const now = Date.now()
  const cached: SearchVolume[] = []
  const missing: string[] = []
  for (const keyword of unique) {
    const entry = volumeCache.get(cacheKey(keyword, locationCode, languageCode))
    if (entry && entry.expiresAt > now) cached.push(entry.value)
    else missing.push(keyword)
  }
  if (missing.length === 0) return cached

  const batches: string[][] = []
  for (let index = 0; index < missing.length; index += SEARCH_VOLUME_BATCH_SIZE) {
    batches.push(missing.slice(index, index + SEARCH_VOLUME_BATCH_SIZE))
  }

  const fetched: SearchVolume[] = []
  for (const batch of batches) {
    const rows = await dataForSeoPost<SearchVolumeRow>("/v3/keywords_data/google_ads/search_volume/live", [{
      keywords: batch,
      location_code: locationCode,
      language_code: languageCode,
    }])
    for (const row of rows) {
      if (!row.keyword) continue
      const value: SearchVolume = {
        keyword: row.keyword,
        volume: typeof row.search_volume === "number" ? row.search_volume : null,
        competition: typeof row.competition_index === "number" ? row.competition_index : null,
      }
      volumeCache.set(cacheKey(row.keyword, locationCode, languageCode), { expiresAt: now + VOLUME_CACHE_MS, value })
      fetched.push(value)
    }
  }
  return [...cached, ...fetched]
}

/** テスト用。プロセス内キャッシュを空にする。 */
export function clearSearchVolumeCache(): void {
  volumeCache.clear()
}
