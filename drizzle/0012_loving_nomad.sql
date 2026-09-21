CREATE TABLE "goal_cta_page" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_cta_page" ADD CONSTRAINT "goal_cta_page_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_cta_page_goal_id_idx" ON "goal_cta_page" USING btree ("goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_cta_page_goal_path_unique" ON "goal_cta_page" USING btree ("goal_id","path");