-- Din hyttekrets: personlige invitasjoner og eksplisitt deling.
--
-- Migreringen legger bare til. Ingen hytter, delinger (cabin_access) eller
-- reservasjoner røres, og ingen kolonner fjernes eller endres:
--   * invitasjoner som finnes fra før, får lenkenøkkel og 30 dagers frist
--   * de nye kolonnene har standardverdier, så forrige kodeversjon virker mot
--     den nye databasen. Da tåler tjenesten både sekundene mens ny versjon
--     legges ut, og en tilbakerulling av koden.
--   * kolonnen profile.is_owner står igjen, men brukes ikke lenger
--
-- Selve endringen fra «alle hytteeiere ser alle hytter» ligger i koden
-- (src/lib/services/cabins.ts), ikke her. Se README, avsnittet «Overgang».

ALTER TABLE "invitation" ADD COLUMN "token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
-- Lagt til for hånd: skulle samme adresse være invitert to ganger til samme
-- hytte, beholdes én (helst den som er tatt i bruk). Resten merkes som trukket
-- tilbake, ellers ville indeksene under ikke la seg opprette. Tilganger som
-- allerede er gitt, ligger i cabin_access og påvirkes ikke.
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