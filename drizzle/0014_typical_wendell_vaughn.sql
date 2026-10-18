CREATE TABLE "site_keyword" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"keyword" text NOT NULL,
	"normalized_keyword" text NOT NULL,
	"page_path" text,
	"memo" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_page" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"path" text NOT NULL,
	"published_at" timestamp with time zone,
	"modified_at" timestamp with time zone,
	"dates_fetched_at" timestamp with time zone,
	"dates_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_keyword" ADD CONSTRAINT "site_keyword_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page" ADD CONSTRAINT "site_page_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_keyword_site_id_idx" ON "site_keyword" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_keyword_site_keyword_unique" ON "site_keyword" USING btree ("site_id","normalized_keyword");--> statement-breakpoint
CREATE INDEX "site_page_site_id_idx" ON "site_page" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_page_site_path_unique" ON "site_page" USING btree ("site_id","path");