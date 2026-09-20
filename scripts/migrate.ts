import { migrate } from "drizzle-orm/postgres-js/migrator"
import { db } from "../lib/db/index.js"

await migrate(db, { migrationsFolder: "./drizzle" })
console.log("Database migrations completed")
