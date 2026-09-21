import { sql } from "drizzle-orm"
import { db } from "./db"

// The worker runs daily, so start deleting at 89 days to stay within the
// contractual 90-day maximum even when cleanup runs near the end of its cycle.
export const AUDIT_RETENTION_DAYS = 89

/** Delete audit payloads after access ended, while retaining billing records. */
export async function deleteExpiredAuditData(): Promise<number> {
  const rows = await db.execute(sql`
    delete from audit_job
    using subscription
    where audit_job.user_id = subscription.user_id
      and subscription.status not in ('active', 'trialing', 'canceling')
      and coalesce(subscription.grace_period_ends_at, subscription.current_period_end, subscription.updated_at)
        < now() - (${AUDIT_RETENTION_DAYS} * interval '1 day')
    returning audit_job.id
  `) as unknown as Array<{ id: string }>
  return rows.length
}
