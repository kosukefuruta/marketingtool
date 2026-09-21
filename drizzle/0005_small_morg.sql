ALTER TABLE "audit_check" ADD COLUMN "position" integer;--> statement-breakpoint
WITH ordered_checks AS (
	SELECT "id", row_number() OVER (PARTITION BY "job_id" ORDER BY "id") - 1 AS "position"
	FROM "audit_check"
)
UPDATE "audit_check"
SET "position" = ordered_checks."position"
FROM ordered_checks
WHERE "audit_check"."id" = ordered_checks."id";--> statement-breakpoint
ALTER TABLE "audit_check" ALTER COLUMN "position" SET NOT NULL;
