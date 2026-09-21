import { and, eq } from "drizzle-orm"
import { db } from "./db"
import { auditJob, subscription } from "./db/schema"
import { auditHistoryVisible } from "./audit-history-access"

export async function canViewAuditHistory(userId: string, now = new Date()): Promise<boolean> {
  const [plan] = await db.select({
    status: subscription.status,
    grace: subscription.gracePeriodEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
  }).from(subscription).where(eq(subscription.userId, userId)).limit(1)
  return auditHistoryVisible(plan?.status, plan?.grace, plan?.currentPeriodEnd, now)
}

export async function loadOwnedAuditJob(id: string, userId: string) {
  if (!await canViewAuditHistory(userId)) return undefined
  const [job] = await db.select().from(auditJob)
    .where(and(eq(auditJob.id, id), eq(auditJob.userId, userId))).limit(1)
  return job
}
