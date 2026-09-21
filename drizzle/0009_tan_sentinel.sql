CREATE TABLE "goal_key_event" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"event_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_key_event" ADD CONSTRAINT "goal_key_event_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_key_event_goal_id_idx" ON "goal_key_event" USING btree ("goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_key_event_goal_event_unique" ON "goal_key_event" USING btree ("goal_id","event_name");