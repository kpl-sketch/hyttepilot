ALTER TABLE "user" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
-- Fyller inn fra øktene som finnes, så medlemslisten har noe å vise fra start.
UPDATE "user" SET "last_login_at" = s.last FROM (SELECT "user_id", max("created_at") AS last FROM "session" GROUP BY "user_id") s WHERE s."user_id" = "user"."id";
