export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at < 0) return trimmed
  const domain = trimmed.slice(at + 1)
  const local = trimmed.slice(0, at).split("+")[0]
  const normalizedLocal = domain === "gmail.com" || domain === "googlemail.com"
    ? local.replaceAll(".", "")
    : local
  return `${normalizedLocal}@${domain}`
}
