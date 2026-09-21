import { sql } from "drizzle-orm"
import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [index("session_user_id_idx").on(table.userId)])

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId)])

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [index("verification_identifier_idx").on(table.identifier)])

export const site = pgTable("site", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  inputUrl: text("input_url").notNull(),
  normalizedOrigin: text("normalized_origin").notNull(),
  category: text("category"),
  searchConsoleProperty: text("search_console_property"),
  ga4Property: text("ga4_property"),
  status: text("status").notNull().default("pending"),
  ownershipStatus: text("ownership_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("site_user_id_idx").on(table.userId),
  uniqueIndex("site_user_origin_unique").on(table.userId, table.normalizedOrigin),
])

export const goal = pgTable("goal", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subjectType: text("subject_type").notNull().default("site"),
  subjectValue: text("subject_value"),
  metric: text("metric").notNull(),
  baselineValue: doublePrecision("baseline_value"),
  targetValue: doublePrecision("target_value").notNull(),
  period: text("period").notNull().default("monthly"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("goal_user_id_idx").on(table.userId),
  index("goal_site_id_idx").on(table.siteId),
])

export const goalKeyEvent = pgTable("goal_key_event", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goal.id, { onDelete: "cascade" }),
  stage: text("stage").notNull().default("conversion"),
  eventName: text("event_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("goal_key_event_goal_id_idx").on(table.goalId),
  uniqueIndex("goal_key_event_goal_stage_event_unique").on(table.goalId, table.stage, table.eventName),
])

export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("stripe"),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  status: text("status").notNull().default("incomplete"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const stripeWebhookEvent = pgTable("stripe_webhook_event", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("processing"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  lastError: text("last_error"),
})

export const auditJob = pgTable("audit_job", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
  targetUrl: text("target_url").notNull(),
  maxPages: integer("max_pages").notNull(),
  status: text("status").notNull().default("queued"),
  progress: text("progress"),
  report: text("report"),
  error: text("error"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  auditedPages: integer("audited_pages"),
  discoveredUrls: integer("discovered_urls"),
  goodCount: integer("good_count"),
  reviewCount: integer("review_count"),
  improveCount: integer("improve_count"),
  unreachableCount: integer("unreachable_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("audit_job_user_id_idx").on(table.userId),
  index("audit_job_site_id_idx").on(table.siteId),
  uniqueIndex("audit_job_one_running_per_site_idx").on(table.siteId)
    .where(sql`${table.status} in ('queued', 'running')`),
])

export const rateLimitEvent = pgTable("rate_limit_event", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("rate_limit_event_key_created_idx").on(table.key, table.createdAt),
  index("rate_limit_event_created_idx").on(table.createdAt),
])

export const auditPage = pgTable("audit_page", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => auditJob.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  finalUrl: text("final_url").notNull(),
  httpStatus: integer("http_status"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  h1Count: integer("h1_count").notNull(),
  canonical: text("canonical").notNull(),
  robots: text("robots").notNull(),
  lang: text("lang").notNull(),
  textLength: integer("text_length").notNull(),
  images: integer("images").notNull(),
  imagesWithoutAlt: integer("images_without_alt").notNull(),
  error: text("error"),
}, (table) => [index("audit_page_job_id_idx").on(table.jobId)])

export const auditCheck = pgTable("audit_check", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => auditJob.id, { onDelete: "cascade" }),
  pageId: text("page_id").references(() => auditPage.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  item: text("item").notNull(),
  evaluation: text("evaluation").notNull(),
  detail: text("detail").notNull(),
}, (table) => [
  index("audit_check_job_id_idx").on(table.jobId),
  index("audit_check_page_id_idx").on(table.pageId),
])
