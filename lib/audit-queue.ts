import { sql } from "drizzle-orm"
import { db } from "./db"

export type ClaimedAuditJob = { id: string; target_url: string; max_pages: number; attempt_count: number }

export async function recoverInterruptedAuditJobs(): Promise<void> {
  await db.execute(sql`
    update audit_job
    set status = case when attempt_count < 3 then 'queued' else 'error' end,
        progress = case when attempt_count < 3 then '診断を再開します。' else null end,
        error = case when attempt_count < 3 then null else '診断処理が繰り返し中断されました。' end,
        updated_at = now(), completed_at = case when attempt_count < 3 then null else now() end
    where status = 'running' and updated_at < now() - interval '12 minutes'
  `)
}

export async function claimAuditJob(): Promise<ClaimedAuditJob | undefined> {
  const rows = await db.execute(sql`
    with next_job as (
      select id from audit_job where status = 'queued' and (next_attempt_at is null or next_attempt_at <= now())
      order by created_at for update skip locked limit 1
    )
    update audit_job
    set status = 'running', progress = '診断の準備中です。', attempt_count = attempt_count + 1,
        updated_at = now(), error = null, next_attempt_at = null
    where id in (select id from next_job)
    returning id, target_url, max_pages, attempt_count
  `) as unknown as ClaimedAuditJob[]
  return rows[0]
}
