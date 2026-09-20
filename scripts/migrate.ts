import { migrate } from "drizzle-orm/postgres-js/migrator"
import { closeDatabase, db } from "../lib/db/index.js"

try {
  await migrate(db, { migrationsFolder: "./drizzle" })
  console.log("Database migrations completed")
} finally {
  await closeDatabase()
}
