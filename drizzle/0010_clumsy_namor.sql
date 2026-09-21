DROP INDEX "goal_key_event_goal_event_unique";--> statement-breakpoint
ALTER TABLE "goal_key_event" ADD COLUMN "stage" text DEFAULT 'conversion' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_key_event_goal_stage_event_unique" ON "goal_key_event" USING btree ("goal_id","stage","event_name");