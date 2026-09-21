import { isIP } from "node:net"

export function clientAddress(request: Request): string {
  const trustedHeader = process.env.TRUSTED_PROXY_HEADER
  const value = trustedHeader === "x-real-ip"
    ? request.headers.get("x-real-ip")?.trim()
    : trustedHeader === "x-forwarded-for"
      ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
      : undefined
  return value && isIP(value) ? value : "unknown"
}
