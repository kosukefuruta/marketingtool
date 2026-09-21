import { hasPaidAccess } from "./subscription-access"

export function auditHistoryVisible(
  status: string | null | undefined,
  grace: Date | null | undefined,
  currentPeriodEnd: Date | null | undefined,
  now = new Date(),
): boolean {
  if (hasPaidAccess(status, grace, now)) return true
  return Boolean(currentPeriodEnd && currentPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000 > now.getTime())
}
