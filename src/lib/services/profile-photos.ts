import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { invitation, profilePhoto } from "../db/schema";
import { type Actor, normalizeEmail, UserError } from "../errors";
import { MAX_UPLOAD_BYTES } from "../photo-limits";
import { processProfilePhoto } from "../photo-processing";
import { isInvitationToken } from "./invitations";

/*
 * Profilbilde.
 *
 * Reglene som gjelder her:
 *  - Hver bruker har høyst ett bilde, og bare brukeren selv kan legge det
 *    inn, bytte det og fjerne det.
 *  - Bildet vises der navnet vises fra før, og ikke bredere: til brukeren
 *    selv, til dem brukeren viser en hytte til, til dem som viser brukeren
 *    sin, mellom eier og låner i en forespørsel, til den brukeren har
 *    invitert, og til eieren som skal godkjenne brukeren. Administratorene
 *    ser alle, slik de ser alle navn i medlemslisten.
 *  - Lenken til en invitasjon viser bildet av den som inviterer, også uten
 *    innlogging, så lenge invitasjonen gjelder. Det er samme unntak som for
 *    bildene av hytta, se getInvitationPreview.
 *  - Det finnes ingen liste over profilbilder, og ingen kan slå opp bildet
 *    til et medlem de ikke har en forbindelse til.
 */

export type ProfilePhotoSource = "linkedin" | "upload";

export type OwnProfilePhoto = {
  /** Står i adressen til bildet, se avatarSrc. */
  version: string;
  source: ProfilePhotoSource;
  updatedAt: Date;
};

/** Lagrer bildet som brukerens profilbilde. Et bilde som finnes fra før, erstattes. */
export async function setProfilePhoto(
  actor: Actor,
  input: Buffer,
  source: ProfilePhotoSource,
): Promise<void> {
  const { full, thumb } = await processProfilePhoto(input);
  const updatedAt = new Date();
  await db
    .insert(profilePhoto)
    .values({ userId: actor.id, full, thumb, source, updatedAt })
    .onConflictDoUpdate({
      target: profilePhoto.userId,
      set: { full, thumb, source, updatedAt },
    });
}

/** Brukeren laster opp et bilde selv. Nettleseren har forminsket det først. */
export async function uploadProfilePhoto(actor: Actor, file: File | null): Promise<void> {
  if (!file || file.size === 0) throw new UserError("Velg et bilde.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UserError("Bildet er for stort. Prøv å laste det opp på nytt.");
  }
  await setProfilePhoto(actor, Buffer.from(await file.arrayBuffer()), "upload");
}

export async function removeProfilePhoto(actor: Actor): Promise<void> {
  await db.delete(profilePhoto).where(eq(profilePhoto.userId, actor.id));
}

/** Det brukeren får vite om sitt eget bilde, eller null uten bilde. */
export async function getOwnProfilePhoto(actor: Actor): Promise<OwnProfilePhoto | null> {
  const [row] = await db
    .select({ source: profilePhoto.source, updatedAt: profilePhoto.updatedAt })
    .from(profilePhoto)
    .where(eq(profilePhoto.userId, actor.id))
    .limit(1);
  if (!row) return null;
  return {
    version: String(row.updatedAt.getTime()),
    source: row.source === "linkedin" ? "linkedin" : "upload",
    updatedAt: row.updatedAt,
  };
}

/**
 * Får den som ser på, se profilbildet til denne personen? Svaret følger
 * forbindelsene som alt finnes, se reglene øverst i filen.
 */
export async function mayViewProfilePhoto(viewer: Actor, userId: string): Promise<boolean> {
  if (viewer.id === userId || viewer.isAdmin) return true;
  const email = normalizeEmail(viewer.email);
  const result = await db.execute<{ ok: boolean }>(sql`
    select (
      exists (
        select 1 from "cabin_access" a
        join "cabin" c on c."id" = a."cabin_id"
        where (c."owner_id" = ${userId} and a."user_id" = ${viewer.id})
           or (c."owner_id" = ${viewer.id} and a."user_id" = ${userId})
      )
      or exists (
        select 1 from "booking" b
        join "cabin" c on c."id" = b."cabin_id"
        where (c."owner_id" = ${userId} and b."borrower_id" = ${viewer.id})
           or (c."owner_id" = ${viewer.id} and b."borrower_id" = ${userId})
      )
      or exists (
        select 1 from "invitation" i
        where i."invited_by" = ${userId} and i."email" = ${email}
          and i."revoked_at" is null
      )
      or exists (
        select 1 from "invitation_request" r
        join "invitation" i on i."id" = r."invitation_id"
        join "cabin" c on c."id" = i."cabin_id"
        where r."user_id" = ${userId} and c."owner_id" = ${viewer.id}
          and r."declined_at" is null
      )
    ) as ok`);
  return result.rows[0]?.ok === true;
}

async function loadPhoto(userId: string, size: "full" | "thumb"): Promise<Buffer | null> {
  const [row] = await db
    .select({ data: size === "thumb" ? profilePhoto.thumb : profilePhoto.full })
    .from(profilePhoto)
    .where(eq(profilePhoto.userId, userId))
    .limit(1);
  return row?.data ?? null;
}

/** Selve bildet, eller null hvis personen ikke har bilde eller den som ser på, ikke får se det. */
export async function getProfilePhotoForViewer(
  viewer: Actor,
  userId: string,
  size: "full" | "thumb",
): Promise<Buffer | null> {
  if (!userId || userId.length > 100) return null;
  if (!(await mayViewProfilePhoto(viewer, userId))) return null;
  return loadPhoto(userId, size);
}

/**
 * Bildet av den som sendte invitasjonen, for den som har lenken. Brukes på
 * invitasjonssiden, også uten innlogging. Null hvis invitasjonen ikke gjelder
 * lenger (trukket tilbake eller over fristen), eller hvis den som inviterer,
 * ikke har noe bilde. Regelen er den samme som showsInviterPhoto i
 * invitations.ts bruker når siden lages, slik at siden aldri peker på et
 * bilde som ikke vises.
 */
export async function getInviterPhotoByToken(
  token: unknown,
  size: "full" | "thumb",
): Promise<Buffer | null> {
  if (!isInvitationToken(token)) return null;
  const [row] = await db
    .select({ data: size === "thumb" ? profilePhoto.thumb : profilePhoto.full })
    .from(invitation)
    .innerJoin(profilePhoto, eq(profilePhoto.userId, invitation.invitedBy))
    .where(
      and(
        eq(invitation.token, token),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.data ?? null;
}
