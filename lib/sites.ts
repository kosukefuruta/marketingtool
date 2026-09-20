import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase()
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  if (isIP(value) === 6) {
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7))
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value)
  }
  return true
}

export async function normalizePublicSiteUrl(input: string): Promise<{ inputUrl: string; origin: string }> {
  const source = input.trim()
  let url: URL
  try {
    url = new URL(source.includes("://") ? source : `https://${source}`)
  } catch {
    throw new Error("正しいサイトURLを入力してください。")
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("公開されているhttpまたはhttpsのサイトを指定してください。")
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("ローカルアドレスは登録できません。")
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("公開サイトのURLを指定してください。")
  }
  const origin = new URL(url.origin)
  origin.hostname = origin.hostname.toLowerCase()
  return { inputUrl: source, origin: origin.href.replace(/\/$/, "") }
}

export function defaultSiteName(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, "")
}
