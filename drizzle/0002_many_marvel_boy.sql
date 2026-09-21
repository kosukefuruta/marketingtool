CREATE TABLE "audit_check" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"page_id" text,
	"item" text NOT NULL,
	"evaluation" text NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_page" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"url" text NOT NULL,
	"final_url" text NOT NULL,
	"http_status" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"h1_count" integer NOT NULL,
	"canonical" text NOT NULL,
	"robots" text NOT NULL,
	"lang" text NOT NULL,
	"text_length" integer NOT NULL,
	"images" integer NOT NULL,
	"images_without_alt" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
DROP INDEX "audit_job_one_running_per_site_idx";--> statement-breakpoint
ALTER TABLE "audit_job" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "audited_pages" integer;--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "discovered_urls" integer;--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "good_count" integer;--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "review_count" integer;--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "improve_count" integer;--> statement-breakpoint
ALTER TABLE "audit_job" ADD COLUMN "unreachable_count" integer;--> statement-breakpoint
ALTER TABLE "audit_check" ADD CONSTRAINT "audit_check_job_id_audit_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."audit_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_check" ADD CONSTRAINT "audit_check_page_id_audit_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."audit_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_page" ADD CONSTRAINT "audit_page_job_id_audit_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."audit_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_check_job_id_idx" ON "audit_check" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "audit_check_page_id_idx" ON "audit_check" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "audit_page_job_id_idx" ON "audit_page" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_job_one_running_per_site_idx" ON "audit_job" USING btree ("site_id") WHERE "audit_job"."status" in ('queued', 'running');