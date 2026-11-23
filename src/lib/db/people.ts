import { sql } from "drizzle-orm";

/**
 * Versjonen av profilbildet til brukeren i spørringen, eller null når brukeren
 * ikke har noe bilde. Brukes i lister der navnet vises, slik at siden kan
 * vise bildet uten å hente selve bildet. Versjonen står i adressen til
 * bildet (se avatarSrc), så et nytt bilde får ny adresse.
 *
 * Tabellnavnet er skrevet rett ut, som for forsidebildet i cabins.ts:
 * spørringen må ha tabellen `user` med, uten alias.
 */
export const profilePhotoVersion = sql<string | null>`(
  select (extract(epoch from pp.updated_at) * 1000)::bigint::text
  from profile_photo pp
  where pp.user_id = "user"."id"
)`;
