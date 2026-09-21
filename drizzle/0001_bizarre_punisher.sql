CREATE TABLE "audit_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text NOT NULL,
	"target_url" text NOT NULL,
	"max_pages" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"progress" text,
	"report" text,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_job" ADD CONSTRAINT "audit_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_job" ADD CONSTRAINT "audit_job_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_job_user_id_idx" ON "audit_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_job_site_id_idx" ON "audit_job" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_job_one_running_per_site_idx" ON "audit_job" USING btree ("site_id") WHERE "audit_job"."status" = 'running';