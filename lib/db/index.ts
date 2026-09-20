import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

declare global {
  var __marketingToolPg: ReturnType<typeof postgres> | undefined
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("DATABASE_URL is required")
}

const client = globalThis.__marketingToolPg ?? postgres(databaseUrl ?? "postgres://localhost/marketingtool", {
  max: process.env.NODE_ENV === "production" ? 10 : 3,
})

if (process.env.NODE_ENV !== "production") globalThis.__marketingToolPg = client

export const db = drizzle({ client })

export async function closeDatabase(): Promise<void> {
  await client.end({ timeout: 5 })
}
