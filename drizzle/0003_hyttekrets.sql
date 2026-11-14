-- Din hyttekrets: personlige invitasjoner og eksplisitt deling.
--
-- Filen er skrevet for hånd. Den drizzle-kit foreslo, ville feilet mot en
-- database med invitasjoner fra før. Denne beholder alle rader:
--   * ingen hytter, delinger (cabin_access) eller reservasjoner røres
--   * eksisterende invitasjoner får lenkenøkkel og 30 dagers frist
--   * kolonnen profile.is_owner står igjen, men brukes ikke lenger
--
-- Selve endringen fra «alle hytteeiere ser alle hytter» ligger i koden
-- (src/lib/services/cabins.ts), ikke her. Se README, avsnittet «Overgang».

-- Invitasjonstypene får navn etter hva de gir.
ALTER TYPE "public"."invitation_kind" RENAME VALUE 'owner' TO 'account';--> statement-breakpoint
ALTER TYPE "public"."invitation_kind" RENAME VALUE 'friend' TO 'cabin';--> statement-breakpoint

ALTER TABLE "invitation" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint

-- Invitasjoner som finnes fra før: tilfeldig lenkenøkkel og 30 dager fra nå.
UPDATE "invitation"
SET "token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "token" IS NULL;--> statement-breakpoint
UPDATE "invitation"
SET "expires_at" = now() + interval '30 days'
WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint

-- Skulle samme adresse være invitert to ganger til samme hytte, beholdes én
-- (helst den som er tatt i bruk). Resten merkes som trukket tilbake. Tilganger
-- som allerede er gitt, ligger i cabin_access og påvirkes ikke.
UPDATE "invitation" SET "revoked_at" = now()
WHERE "id" IN (
  SELECT d."id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "email", "cabin_id"
      ORDER BY ("accepted_at" IS NULL), "created_at"
    ) AS n
    FROM "invitation"
  ) d
  WHERE d.n > 1
);--> statement-breakpoint

CREATE UNIQUE INDEX "invitation_active_cabin_idx" ON "invitation" USING btree ("email","cabin_id") WHERE "invitation"."revoked_at" is null and "invitation"."cabin_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_active_account_idx" ON "invitation" USING btree ("email") WHERE "invitation"."revoked_at" is null and "invitation"."cabin_id" is null;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_token_unique" UNIQUE("token");
