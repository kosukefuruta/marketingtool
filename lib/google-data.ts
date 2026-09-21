import { auth } from "./auth"

export const GOOGLE_DATA_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const

export type SearchConsoleSite = { siteUrl: string; permissionLevel: string }
export type AnalyticsProperty = { property: string; displayName: string; account: string; accountName: string }
export type GoogleProperties = {
  searchConsoleSites: SearchConsoleSite[]
  analyticsProperties: AnalyticsProperty[]
  searchConsoleError: string | null
  analyticsError: string | null
}

const GOOGLE_API_TIMEOUT_MS = 10_000

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Google APIから情報を取得できませんでした（${response.status}）。`)
  return response.json() as Promise<T>
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "Google APIからの応答がタイムアウトしました。"
  return error instanceof Error ? error.message : "Google APIから情報を取得できませんでした。"
}

export async function loadGoogleProperties(accountId: string, requestHeaders: Headers): Promise<GoogleProperties> {
  const token = await auth.api.getAccessToken({ body: { providerId: "google", accountId }, headers: requestHeaders })
  const [searchConsole, analytics] = await Promise.allSettled([
    googleJson<{ siteEntry?: SearchConsoleSite[] }>("https://www.googleapis.com/webmasters/v3/sites", token.accessToken),
    googleJson<{ accountSummaries?: Array<{ account: string; displayName: string; propertySummaries?: Array<{ property: string; displayName: string }> }> }>(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", token.accessToken,
    ),
  ])
  return {
    searchConsoleSites: searchConsole.status === "fulfilled" ? searchConsole.value.siteEntry ?? [] : [],
    analyticsProperties: analytics.status === "fulfilled" ? (analytics.value.accountSummaries ?? []).flatMap((account) => (account.propertySummaries ?? []).map((property) => ({
      property: property.property,
      displayName: property.displayName,
      account: account.account,
      accountName: account.displayName,
    }))) : [],
    searchConsoleError: searchConsole.status === "rejected" ? errorMessage(searchConsole.reason) : null,
    analyticsError: analytics.status === "rejected" ? errorMessage(analytics.reason) : null,
  }
}
