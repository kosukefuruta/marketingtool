import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return new Response("ready\n", { headers: { "content-type": "text/plain; charset=utf-8" } })
  } catch {
    return new Response("not ready\n", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
  }
}
