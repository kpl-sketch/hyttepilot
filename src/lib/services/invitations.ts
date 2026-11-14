import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { isAdminEmail } from "../brand";
import { db } from "../db";
import { cabin, cabinAccess, invitation, profile, user } from "../db/schema";
import { sendEmail } from "../email";
import { friendInvitationMail, ownerInvitationMail } from "../emails";
import { type Actor, normalizeEmail, UserError } from "../errors";

const emailSchema = z.email("Skriv en gyldig e-postadresse.");

function parseEmail(raw: string): string {
  const parsed = emailSchema.safeParse(normalizeEmail(raw));
  if (!parsed.success) throw new UserError("Skriv en gyldig e-postadresse.");
  return parsed.data;
}

/**
 * Tjenesten er lukket. En adresse slipper inn hvis den tilhører en
 * administrator, en eksisterende bruker eller har en invitasjon.
 */
export async function isEmailAllowed(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (isAdminEmail(email)) return true;
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) return true;
  const [invited] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(eq(invitation.email, email))
    .limit(1);
  return Boolean(invited);
}

/**
 * Tar i bruk ventende invitasjoner for en bruker som har fullført
 * velkomstsiden. Kalles etter registrering og ved hver innlogging.
 */
export async function claimInvitations(userId: string, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const pending = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.email, email), isNull(invitation.acceptedAt)));

  for (const inv of pending) {
    if (inv.kind === "owner") {
      await db.update(profile).set({ isOwner: true }).where(eq(profile.userId, userId));
    } else if (inv.cabinId) {
      await db
        .insert(cabinAccess)
        .values({ cabinId: inv.cabinId, userId })
        .onConflictDoNothing();
    }
    await db
      .update(invitation)
      .set({ acceptedAt: new Date() })
      .where(eq(invitation.id, inv.id));
  }
}

/** Finner en bruker som allerede har fullført velkomstsiden. */
async function findRegisteredUser(email: string) {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(profile, eq(profile.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  return row ?? null;
}

/** En administrator inviterer en hytteeier inn i nettverket. */
export async function inviteOwner(actor: Actor, rawEmail: string) {
  if (!actor.isAdmin) throw new UserError("Bare administratorer kan invitere hytteeiere.");
  const email = parseEmail(rawEmail);

  const [duplicate] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.email, email), eq(invitation.kind, "owner")))
    .limit(1);
  if (duplicate) throw new UserError("Denne adressen er allerede invitert som hytteeier.");

  const registered = await findRegisteredUser(email);
  await db.insert(invitation).values({ email, kind: "owner", invitedBy: actor.id });
  if (registered) await claimInvitations(registered.id, email);

  await sendEmail(ownerInvitationMail(email, actor.name));
}

/** Eieren gir en venn tilgang til én hytte. */
export async function inviteFriend(actor: Actor, cabinId: string, rawEmail: string) {
  const email = parseEmail(rawEmail);
  const [target] = await db.select().from(cabin).where(eq(cabin.id, cabinId)).limit(1);
  if (!target || target.ownerId !== actor.id) {
    throw new UserError("Du kan bare invitere venner til dine egne hytter.");
  }
  if (email === normalizeEmail(actor.email)) {
    throw new UserError("Du har allerede tilgang til din egen hytte.");
  }

  const [duplicate] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email),
        eq(invitation.kind, "friend"),
        eq(invitation.cabinId, cabinId),
      ),
    )
    .limit(1);
  if (duplicate) throw new UserError("Denne adressen er allerede invitert til hytta.");

  const registered = await findRegisteredUser(email);
  await db
    .insert(invitation)
    .values({ email, kind: "friend", cabinId, invitedBy: actor.id });
  if (registered) await claimInvitations(registered.id, email);

  await sendEmail(friendInvitationMail(email, actor.name, target.name));
}

/** Eieren trekker tilbake en venns tilgang, eller en invitasjon som ikke er brukt. */
export async function removeFriendInvitation(actor: Actor, invitationId: string) {
  const [inv] = await db
    .select({ invitation, ownerId: cabin.ownerId })
    .from(invitation)
    .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!inv || inv.ownerId !== actor.id || !inv.invitation.cabinId) {
    throw new UserError("Fant ikke invitasjonen.");
  }

  const [invited] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, inv.invitation.email))
    .limit(1);
  if (invited) {
    await db
      .delete(cabinAccess)
      .where(
        and(
          eq(cabinAccess.cabinId, inv.invitation.cabinId),
          eq(cabinAccess.userId, invited.id),
        ),
      );
  }
  await db.delete(invitation).where(eq(invitation.id, invitationId));
}

/** Alle som er invitert til en hytte, med navn hvis de har registrert seg. */
export async function listFriendInvitations(actor: Actor, cabinId: string) {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      acceptedAt: invitation.acceptedAt,
      name: user.name,
    })
    .from(invitation)
    .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
    .leftJoin(user, eq(user.email, invitation.email))
    .where(
      and(
        eq(invitation.cabinId, cabinId),
        eq(invitation.kind, "friend"),
        eq(cabin.ownerId, actor.id),
      ),
    )
    .orderBy(invitation.createdAt);
}

/** Oversikt for administratorer: inviterte hytteeiere. */
export async function listOwnerInvitations(actor: Actor) {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      acceptedAt: invitation.acceptedAt,
      createdAt: invitation.createdAt,
      name: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(user.email, invitation.email))
    .where(eq(invitation.kind, "owner"))
    .orderBy(invitation.createdAt);
}
