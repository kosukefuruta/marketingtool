CREATE TABLE "goal" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"subject_type" text DEFAULT 'site' NOT NULL,
	"subject_value" text,
	"metric" text NOT NULL,
	"baseline_value" double precision,
	"target_value" double precision NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site" DROP CONSTRAINT "site_user_id_unique";--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_user_id_idx" ON "goal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_site_id_idx" ON "goal" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_user_id_idx" ON "site" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_user_origin_unique" ON "site" USING btree ("user_id","normalized_origin");