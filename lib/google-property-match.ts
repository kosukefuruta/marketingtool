export function searchConsoleSiteMatches(siteUrl: string, origin: string): boolean {
  if (siteUrl === origin || siteUrl === `${origin}/`) return true
  try {
    if (!siteUrl.startsWith("sc-domain:")) return false
    const propertyDomain = siteUrl.slice("sc-domain:".length).toLowerCase().replace(/\.$/, "")
    const hostname = new URL(origin).hostname.toLowerCase().replace(/\.$/, "")
    return hostname === propertyDomain || hostname.endsWith(`.${propertyDomain}`)
  } catch {
    return false
  }
}
