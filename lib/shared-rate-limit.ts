import { createHash } from "node:crypto"
import { count, eq, lt, sql } from "drizzle-orm"
import { db } from "./db"
import { rateLimitEvent } from "./db/schema"

export async function checkSharedRateLimit(rawKey: string, windowMs: number, maximum: number) {
  const key = createHash("sha256").update(rawKey).digest("hex")
  const cutoff = new Date(Date.now() - windowMs)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
    await tx.delete(rateLimitEvent).where(lt(rateLimitEvent.createdAt, cutoff))
    const [usage] = await tx.select({ value: count() }).from(rateLimitEvent).where(eq(rateLimitEvent.key, key))
    if ((usage?.value ?? 0) >= maximum) return { allowed: false as const, retryAfter: Math.ceil(windowMs / 1000) }
    await tx.insert(rateLimitEvent).values({ id: crypto.randomUUID(), key, createdAt: new Date() })
    return { allowed: true as const }
  })
}
