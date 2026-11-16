import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appUrl, isAdminEmail } from "../brand";
import { formatDate, todayInOslo } from "../dates";
import { MAX_INVITATIONS_PER_ROUND } from "../invitation-limits";
import { db } from "../db";
import {
  booking,
  type Cabin,
  cabin,
  cabinAccess,
  invitation,
  invitationRequest,
  profile,
  user,
} from "../db/schema";
import { sendEmail } from "../email";
import {
  accessRequestMail,
  accountInvitationMail,
  cabinInvitationMail,
  cabinSharedMail,
} from "../emails";
import { approximatePosition } from "../position";
import { type Actor, normalizeEmail, UserError } from "../errors";
import { getOwnCabin } from "./cabins";
import { listCabinPhotos } from "./photos";

/*
 * Deling og invitasjoner.
 *
 * Reglene som gjelder her:
 *  - Bare eieren kan dele en hytte, og bare sin egen.
 *  - En deling gjelder én hytte og én person. Den gir ingen rett til å dele
 *    videre, og ingen tilgang til andre hytter.
 *  - En invitasjon er personlig. Tilgangen gis til den som logger inn med
 *    adressen invitasjonen ble sendt til. Lenken alene gir ingen tilgang.
 *  - Lenken til en hytteinvitasjon viser hytta uten innlogging, men bare
 *    bilder, området og ideen, og bare så lenge invitasjonen gjelder.
 *  - Logger noen inn fra lenken med en annen adresse, må eieren godkjenne
 *    personen før hytta blir synlig og kan lånes.
 *  - Å trekke tilbake en deling endrer aldri en forespørsel eller et opphold.
 */

/** Så lenge kan en invitasjon tas i bruk. */
export const INVITATION_DAYS = 30;

const emailSchema = z.email();
const messageSchema = z.string().trim().max(500);

function parseEmail(raw: unknown): string {
  const parsed = emailSchema.safeParse(normalizeEmail(typeof raw === "string" ? raw : ""));
  if (!parsed.success) throw new UserError("Skriv en gyldig e-postadresse.");
  return parsed.data;
}

function parseMessage(raw: unknown): string {
  const parsed = messageSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) throw new UserError("Hilsenen kan være på høyst 500 tegn.");
  return parsed.data;
}

/** Nøkkelen i invitasjonslenken. Sjekkes før den brukes i oppslag eller videresending. */
export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,80}$/.test(value);
}

function newInvitation() {
  return {
    token: randomBytes(24).toString("base64url"),
    expiresAt: new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60_000),
  };
}

/** «k•••@eksempel.no»: nok til at mottakeren kjenner igjen adressen sin. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) => (value as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

/** Invitasjonen kan fortsatt tas i bruk. */
const usable = () =>
  and(
    isNull(invitation.acceptedAt),
    isNull(invitation.revokedAt),
    gt(invitation.expiresAt, new Date()),
  );

/**
 * Lenken til invitasjonen viser hytta: invitasjonen gjelder en hytte, er ikke
 * trukket tilbake og er innenfor fristen. Det gjelder også etter at den er
 * tatt i bruk, slik at lenken kan åpnes flere ganger.
 */
const previewable = () =>
  and(
    isNotNull(invitation.cabinId),
    isNull(invitation.revokedAt),
    gt(invitation.expiresAt, new Date()),
  );

/**
 * Invitasjonen gjelder fortsatt i databasen, men kan ikke tas i bruk: den er
 * utløpt, eller den er brukt uten at tilgangen finnes lenger. Slike ryddes
 * bort når eieren inviterer samme adresse på nytt. En invitasjon som venter,
 * røres aldri her. Da stopper databasen i stedet den nye, og mottakeren får
 * ikke to e-poster.
 */
const spent = () =>
  and(
    isNull(invitation.revokedAt),
    or(isNotNull(invitation.acceptedAt), lte(invitation.expiresAt, new Date())),
  );

/**
 * Tjenesten er lukket. En adresse slipper inn hvis den tilhører en
 * administrator, en eksisterende bruker eller har en invitasjon som fortsatt
 * gjelder. En utløpt eller tilbaketrukket invitasjon slipper ingen inn.
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
    .where(and(eq(invitation.email, email), usable()))
    .limit(1);
  if (invited) return true;
  // Kom fra en invitasjonslenke med en annen adresse. Personen slipper inn,
  // men ser ingenting før eieren har godkjent.
  const [requested] = await db
    .select({ id: invitationRequest.id })
    .from(invitationRequest)
    .innerJoin(invitation, eq(invitation.id, invitationRequest.invitationId))
    .where(
      and(
        eq(invitationRequest.email, email),
        isNull(invitationRequest.declinedAt),
        previewable(),
      ),
    )
    .limit(1);
  return Boolean(requested);
}

/**
 * Tar i bruk invitasjonene som venter på en bruker som har fullført
 * velkomstsiden. Kalles etter registrering og ved hver innlogging. Den kan
 * kalles så mange ganger som helst: en invitasjon gir tilgang høyst én gang.
 */
export async function claimInvitations(userId: string, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  await db.transaction(async (tx) => {
    const pending = await tx
      .select({ id: invitation.id, cabinId: invitation.cabinId })
      .from(invitation)
      .where(and(eq(invitation.email, email), usable()))
      .for("update");
    for (const inv of pending) {
      if (inv.cabinId) {
        await tx
          .insert(cabinAccess)
          .values({ cabinId: inv.cabinId, userId })
          .onConflictDoNothing();
      }
      await tx
        .update(invitation)
        .set({ acceptedAt: new Date() })
        .where(eq(invitation.id, inv.id));
    }
  });
  await linkAccessRequests(userId, email);
}

/** Finner en bruker som allerede har fullført velkomstsiden. */
async function findRegisteredUser(email: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .innerJoin(profile, eq(profile.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  return row ?? null;
}

/* ------------------------------ Dele en hytte ------------------------------ */

export type ShareOutcome = {
  /**
   * shared: mottakeren er med fra før og har fått tilgang nå.
   * invited: mottakeren får tilgang når vedkommende logger inn med adressen.
   */
  status: "shared" | "invited";
  /** Navnet til mottakeren, eller adressen hvis vi ikke har noe navn. */
  recipient: string;
  /**
   * Sant når e-postleverandøren tok imot e-posten. Det betyr ikke at den er
   * kommet fram til innboksen.
   */
  emailAccepted: boolean;
};

/** Det eieren får se før invitasjonen sendes. */
export type SharePreview = {
  recipient: string;
  cabinName: string;
  cabinArea: string;
  /** Navn på dem som ser hytta fra før. */
  sharedWith: string[];
  /** Adresser som er invitert, men ikke har logget inn ennå. */
  waiting: string[];
  mail: { subject: string; text: string };
};

async function ownCabinOrRefuse(actor: Actor, cabinId: string): Promise<Cabin> {
  const target = await getOwnCabin(actor, cabinId);
  if (!target) throw new UserError("Du kan bare velge hvem som ser dine egne hytter.");
  return target;
}

/** Stopper invitasjoner som ikke gir mening, før noe lagres eller sendes. */
async function checkEmailShare(target: Cabin, email: string) {
  const registered = await findRegisteredUser(email);
  if (registered) {
    const [has] = await db
      .select({ userId: cabinAccess.userId })
      .from(cabinAccess)
      .where(and(eq(cabinAccess.cabinId, target.id), eq(cabinAccess.userId, registered.id)))
      .limit(1);
    if (has) throw new UserError(`${registered.name} ser allerede ${target.name}.`);
  }
  const [waiting] = await db
    .select({ expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(and(eq(invitation.email, email), eq(invitation.cabinId, target.id), usable()))
    .limit(1);
  if (waiting) {
    throw new UserError(
      `Denne adressen er allerede invitert til ${target.name}. Invitasjonen gjelder til ${formatDate(todayInOslo(waiting.expiresAt))}.`,
    );
  }
  return registered;
}

/** Hvem som ser hytta nå, og hvem som er invitert. Bare for eieren. */
async function currentSharing(cabinId: string) {
  const [people, waiting] = await Promise.all([
    db
      .select({ name: user.name })
      .from(cabinAccess)
      .innerJoin(user, eq(user.id, cabinAccess.userId))
      .where(eq(cabinAccess.cabinId, cabinId))
      .orderBy(asc(user.name)),
    db
      .select({ email: invitation.email })
      .from(invitation)
      .where(and(eq(invitation.cabinId, cabinId), usable()))
      .orderBy(asc(invitation.createdAt)),
  ]);
  return { sharedWith: people.map((p) => p.name), waiting: waiting.map((w) => w.email) };
}

/**
 * En person i kretsen til brukeren: en som deler en hytte med brukeren, eller
 * som brukeren deler en hytte med. Andre medlemmer kan ikke slås opp.
 */
async function findCirclePerson(actor: Actor, personId: unknown) {
  if (typeof personId !== "string" || personId === "" || personId === actor.id) return null;
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(
        eq(user.id, personId),
        sql`exists (
          select 1 from "cabin_access" a
          join "cabin" c on c."id" = a."cabin_id"
          where (c."owner_id" = ${personId} and a."user_id" = ${actor.id})
             or (c."owner_id" = ${actor.id} and a."user_id" = ${personId})
        )`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Viser eieren nøyaktig hva som sendes og hvem som får se hytta, uten å
 * lagre eller sende noe. Brukes i steget før «Send invitasjonen».
 *
 * Forhåndsvisningen sier ikke om adressen tilhører et medlem. Ellers kunne
 * hvem som helst sjekke hvem som er med ved å prøve adresser.
 */
export async function previewShare(
  actor: Actor,
  cabinId: string,
  to: { email?: unknown; personId?: unknown },
  rawMessage: unknown,
): Promise<SharePreview> {
  const target = await ownCabinOrRefuse(actor, cabinId);
  const message = parseMessage(rawMessage);
  const info = { cabinName: target.name, cabinArea: target.area, message };
  const sharing = await currentSharing(target.id);
  const base = { cabinName: target.name, cabinArea: target.area, ...sharing };

  if (to.personId) {
    const person = await findCirclePerson(actor, to.personId);
    if (!person) throw new UserError("Fant ikke personen i kretsen din.");
    const [has] = await db
      .select({ userId: cabinAccess.userId })
      .from(cabinAccess)
      .where(and(eq(cabinAccess.cabinId, target.id), eq(cabinAccess.userId, person.id)))
      .limit(1);
    if (has) throw new UserError(`${person.name} ser allerede ${target.name}.`);
    const mail = cabinSharedMail(person.email, actor.name, {
      ...info,
      link: `${appUrl()}/hytter/${target.id}`,
    });
    return { ...base, recipient: person.name, mail: { subject: mail.subject, text: mail.text } };
  }

  const email = parseEmail(to.email);
  if (email === normalizeEmail(actor.email)) {
    throw new UserError("Du ser allerede din egen hytte.");
  }
  await checkEmailShare(target, email);
  const placeholder = "LENKE";
  const mail = cabinInvitationMail(email, actor.name, {
    ...info,
    token: placeholder,
    expiresAt: newInvitation().expiresAt,
  });
  return {
    ...base,
    recipient: email,
    mail: {
      subject: mail.subject,
      text: mail.text.replace(
        `${appUrl()}/invitasjon/${placeholder}`,
        "(personlig lenke til invitasjonen)",
      ),
    },
  };
}

/**
 * Eieren deler én hytte med én e-postadresse. Er mottakeren med fra før, får
 * vedkommende tilgang med en gang og et varsel. Ellers sendes en personlig
 * invitasjon, og tilgangen gis når mottakeren logger inn med adressen.
 */
export async function inviteToCabin(
  actor: Actor,
  cabinId: string,
  rawEmail: unknown,
  rawMessage: unknown = "",
): Promise<ShareOutcome> {
  const target = await ownCabinOrRefuse(actor, cabinId);
  const email = parseEmail(rawEmail);
  const message = parseMessage(rawMessage);
  if (email === normalizeEmail(actor.email)) {
    throw new UserError("Du ser allerede din egen hytte.");
  }
  const registered = await checkEmailShare(target, email);
  const fresh = newInvitation();

  try {
    await db.transaction(async (tx) => {
      // En gammel invitasjon som er utløpt, erstattes av den nye.
      await tx
        .update(invitation)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitation.email, email), eq(invitation.cabinId, target.id), spent()));
      await tx.insert(invitation).values({
        email,
        kind: "friend", // navnet fra første versjon, se schema.ts
        cabinId: target.id,
        invitedBy: actor.id,
        message,
        token: fresh.token,
        expiresAt: fresh.expiresAt,
        acceptedAt: registered ? new Date() : null,
      });
      if (registered) {
        await tx
          .insert(cabinAccess)
          .values({ cabinId: target.id, userId: registered.id })
          .onConflictDoNothing();
      }
    });
  } catch (error) {
    // To like innsendinger samtidig: databasen slipper bare den ene gjennom.
    if (isUniqueViolation(error)) {
      throw new UserError(`Denne adressen er allerede invitert til ${target.name}.`);
    }
    throw error;
  }

  const info = { cabinName: target.name, cabinArea: target.area, message };
  const emailAccepted = await sendEmail(
    registered
      ? cabinSharedMail(email, actor.name, {
          ...info,
          link: `${appUrl()}/invitasjon/${fresh.token}`,
        })
      : cabinInvitationMail(email, actor.name, { ...info, ...fresh }),
  );
  return {
    status: registered ? "shared" : "invited",
    recipient: registered?.name ?? email,
    emailAccepted,
  };
}

/* ------------------------ Invitere flere på en gang ------------------------ */

export { MAX_INVITATIONS_PER_ROUND };

/**
 * Henter adressene ut av teksten eieren har limt inn. Adresser kan stå skilt
 * med komma, semikolon, mellomrom eller linjeskift, og gjerne med navn rundt,
 * slik de kommer fra et e-postprogram («Kari Nordmann <kari@eksempel.no>»).
 * Ord uten @ regnes som navn og hoppes over. Like adresser telles én gang.
 */
export function parseEmailList(raw: unknown): { emails: string[]; invalid: string[] } {
  const text = typeof raw === "string" ? raw : "";
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;<>()"']+/)) {
    if (!part.includes("@")) continue;
    const candidate = normalizeEmail(part.replace(/^mailto:/i, "").replace(/[.:]+$/, ""));
    if (!emailSchema.safeParse(candidate).success) {
      if (!invalid.includes(part)) invalid.push(part);
    } else if (!emails.includes(candidate)) {
      emails.push(candidate);
    }
  }
  return { emails, invalid };
}

/**
 * Hva som skjer med hver adresse i en runde:
 * new: får invitasjon, eller tilgang med en gang hvis vedkommende er med fra før.
 *      Forhåndsvisningen skiller ikke mellom de to, se previewShare.
 * has-access: ser hytta allerede, hoppes over.
 * waiting: er invitert til hytta og har ikke logget inn ennå, hoppes over.
 * self: eierens egen adresse, hoppes over.
 */
export type RecipientStatus = "new" | "has-access" | "waiting" | "self";

export type InvitationsPreview = {
  cabinName: string;
  cabinArea: string;
  sharedWith: string[];
  waiting: string[];
  recipients: { email: string; status: RecipientStatus; name?: string }[];
  /** Tekst som så ut som en adresse, men ikke er gyldig. */
  invalid: string[];
  /** Eksempel på e-posten, med plassholder for adressen og lenken. */
  mail: { subject: string; text: string };
};

export type InvitationResult = {
  email: string;
  /** skipped: ingenting ble lagret eller sendt for denne adressen. */
  status: "shared" | "invited" | "skipped";
  recipient: string;
  emailAccepted: boolean;
  /** Hvorfor adressen ble hoppet over. */
  reason?: string;
};

function parseEmailRound(raw: unknown): { emails: string[]; invalid: string[] } {
  const parsed = parseEmailList(raw);
  if (parsed.emails.length === 0 && parsed.invalid.length === 0) {
    throw new UserError("Skriv minst én e-postadresse.");
  }
  if (parsed.emails.length > MAX_INVITATIONS_PER_ROUND) {
    throw new UserError(
      `Du kan invitere høyst ${MAX_INVITATIONS_PER_ROUND} om gangen. Du har skrevet ${parsed.emails.length} adresser.`,
    );
  }
  return parsed;
}

/** Status for hver adresse, uten å avsløre hvem som er medlem fra før. */
async function recipientStatuses(actor: Actor, target: Cabin, emails: string[]) {
  if (emails.length === 0) return [];
  const own = normalizeEmail(actor.email);
  const [seeing, waiting] = await Promise.all([
    db
      .select({ email: user.email, name: user.name })
      .from(cabinAccess)
      .innerJoin(user, eq(user.id, cabinAccess.userId))
      .where(and(eq(cabinAccess.cabinId, target.id), inArray(user.email, emails))),
    db
      .select({ email: invitation.email })
      .from(invitation)
      .where(and(eq(invitation.cabinId, target.id), inArray(invitation.email, emails), usable())),
  ]);
  return emails.map((email) => {
    if (email === own) return { email, status: "self" as const };
    const seer = seeing.find((s) => normalizeEmail(s.email) === email);
    if (seer) return { email, status: "has-access" as const, name: seer.name };
    if (waiting.some((w) => w.email === email)) return { email, status: "waiting" as const };
    return { email, status: "new" as const };
  });
}

/**
 * Viser eieren hva som skjer med hver adresse før noe lagres eller sendes.
 * Ugyldige adresser stopper ikke forhåndsvisningen, men de må rettes eller
 * fjernes før runden kan sendes.
 */
export async function previewInvitations(
  actor: Actor,
  cabinId: string,
  rawEmails: unknown,
  rawMessage: unknown,
): Promise<InvitationsPreview> {
  const target = await ownCabinOrRefuse(actor, cabinId);
  const message = parseMessage(rawMessage);
  const { emails, invalid } = parseEmailRound(rawEmails);
  const [recipients, sharing] = await Promise.all([
    recipientStatuses(actor, target, emails),
    currentSharing(target.id),
  ]);

  const placeholder = "LENKE";
  const sample = cabinInvitationMail("ADRESSE", actor.name, {
    cabinName: target.name,
    cabinArea: target.area,
    message,
    token: placeholder,
    expiresAt: newInvitation().expiresAt,
  });
  return {
    cabinName: target.name,
    cabinArea: target.area,
    ...sharing,
    recipients,
    invalid,
    mail: {
      subject: sample.subject,
      text: sample.text
        .replace(`${appUrl()}/invitasjon/${placeholder}`, "(personlig lenke til invitasjonen)")
        .replace("ADRESSE", "(adressen til mottakeren)"),
    },
  };
}

/** Pause mellom e-postene når de går til Resend, som tar imot få i sekundet. */
const SEND_SPACING_MS = 600;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Eieren inviterer flere adresser til én hytte i samme runde. Hver adresse
 * får sin egen invitasjon, med egen lenke, egen frist og egen e-post, akkurat
 * som med inviteToCabin. Eieren kan senere trekke tilbake hver enkelt.
 *
 * En adresse som ikke kan inviteres (ser hytta allerede, er invitert fra før,
 * er eierens egen), hoppes over og stopper ikke resten.
 */
export async function inviteManyToCabin(
  actor: Actor,
  cabinId: string,
  rawEmails: unknown,
  rawMessage: unknown = "",
): Promise<InvitationResult[]> {
  const target = await ownCabinOrRefuse(actor, cabinId);
  parseMessage(rawMessage);
  const { emails, invalid } = parseEmailRound(rawEmails);
  if (invalid.length > 0) {
    throw new UserError(
      `Rett opp eller fjern ${invalid.length === 1 ? "denne adressen" : "disse adressene"} først: ${invalid.join(", ")}.`,
    );
  }

  const paced = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const results: InvitationResult[] = [];
  let lastSend = 0;
  for (const email of emails) {
    if (paced && lastSend > 0) {
      const left = SEND_SPACING_MS - (Date.now() - lastSend);
      if (left > 0) await wait(left);
    }
    try {
      const outcome = await inviteToCabin(actor, target.id, email, rawMessage);
      lastSend = Date.now();
      results.push({ email, ...outcome });
    } catch (error) {
      // En uventet feil for én adresse skal ikke skjule at de forrige er
      // sendt. Den logges, og eieren får beskjed om å prøve adressen igjen.
      if (!(error instanceof UserError)) console.error(error);
      results.push({
        email,
        status: "skipped",
        recipient: email,
        emailAccepted: false,
        reason:
          error instanceof UserError
            ? error.message
            : "Noe gikk galt hos oss. Prøv denne adressen igjen om litt.",
      });
    }
  }
  return results;
}

/**
 * Eieren deler en hytte med en person som allerede er i kretsen, for eksempel
 * tilbake til en som har delt med eieren. Dette er eierens eget, aktive valg:
 * ingenting deles tilbake av seg selv.
 */
export async function shareWithPerson(
  actor: Actor,
  cabinId: string,
  personId: unknown,
  rawMessage: unknown = "",
): Promise<ShareOutcome> {
  const target = await ownCabinOrRefuse(actor, cabinId);
  const message = parseMessage(rawMessage);
  const person = await findCirclePerson(actor, personId);
  if (!person) throw new UserError("Fant ikke personen i kretsen din.");

  const granted = await db
    .insert(cabinAccess)
    .values({ cabinId: target.id, userId: person.id })
    .onConflictDoNothing()
    .returning({ userId: cabinAccess.userId });
  if (granted.length === 0) throw new UserError(`${person.name} ser allerede ${target.name}.`);

  const emailAccepted = await sendEmail(
    cabinSharedMail(person.email, actor.name, {
      cabinName: target.name,
      cabinArea: target.area,
      message,
      link: `${appUrl()}/hytter/${target.id}`,
    }),
  );
  return { status: "shared", recipient: person.name, emailAccepted };
}

/**
 * Eieren slutter å dele hytta med en person. Personen ser ikke lenger hytta
 * eller bildene og kan ikke sende nye forespørsler.
 *
 * Forespørsler og opphold røres ikke. Et opphold eieren har sagt ja til,
 * står til eieren avlyser det under Forespørsler.
 */
export async function revokeAccess(actor: Actor, cabinId: string, userId: unknown) {
  const target = await getOwnCabin(actor, cabinId);
  if (!target || typeof userId !== "string") throw new UserError("Fant ikke personen.");
  const [person] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(cabinAccess)
    .innerJoin(user, eq(user.id, cabinAccess.userId))
    .where(and(eq(cabinAccess.cabinId, target.id), eq(cabinAccess.userId, userId)))
    .limit(1);
  if (!person) throw new UserError("Fant ikke personen.");

  await db.transaction(async (tx) => {
    await tx
      .delete(cabinAccess)
      .where(and(eq(cabinAccess.cabinId, target.id), eq(cabinAccess.userId, person.id)));
    // Invitasjonen som ga tilgangen, gjelder ikke lenger. Da kan eieren
    // invitere samme adresse på nytt senere.
    await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitation.cabinId, target.id),
          eq(invitation.email, person.email),
          isNull(invitation.revokedAt),
        ),
      );
  });
  return { name: person.name, cabinId: target.id };
}

/**
 * Eieren trekker tilbake en invitasjon som ikke er tatt i bruk. Svarer med
 * hytta invitasjonen gjaldt, hentet fra databasen og ikke fra skjemaet.
 */
export async function revokeInvitation(actor: Actor, invitationId: unknown) {
  if (!z.uuid().safeParse(invitationId).success) throw new UserError("Fant ikke invitasjonen.");
  const id = invitationId as string;
  const [row] = await db
    .select({ acceptedAt: invitation.acceptedAt, ownerId: cabin.ownerId, cabinId: cabin.id })
    .from(invitation)
    .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
    .where(eq(invitation.id, id))
    .limit(1);
  if (!row || row.ownerId !== actor.id) throw new UserError("Fant ikke invitasjonen.");
  if (row.acceptedAt) {
    throw new UserError("Invitasjonen er tatt i bruk. Ta bort personen i stedet.");
  }
  await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, id), isNull(invitation.revokedAt)));
  return { cabinId: row.cabinId };
}

/**
 * Hvem eieren deler hytta med, og invitasjoner som venter. For hver person
 * følger det med hvor mange forespørsler og opphold vedkommende har framover,
 * slik at eieren ser hva som blir stående hvis delingen fjernes.
 */
export async function listCabinSharing(actor: Actor, cabinId: string) {
  const own = await getOwnCabin(actor, cabinId);
  if (!own) return null;
  const today = todayInOslo();

  const [people, invitations, stays, requests] = await Promise.all([
    db
      .select({
        userId: user.id,
        name: user.name,
        since: cabinAccess.createdAt,
        // Adressen vises bare når eieren selv skrev den inn i en invitasjon.
        email: sql<string | null>`(
          select i.email from invitation i
          where i.cabin_id = ${own.id} and i.email = "user"."email"
            and i.accepted_at is not null and i.revoked_at is null
          limit 1
        )`,
      })
      .from(cabinAccess)
      .innerJoin(user, eq(user.id, cabinAccess.userId))
      .where(eq(cabinAccess.cabinId, own.id))
      .orderBy(asc(user.name)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.cabinId, own.id),
          isNull(invitation.acceptedAt),
          isNull(invitation.revokedAt),
        ),
      )
      .orderBy(asc(invitation.createdAt)),
    db
      .select({
        borrowerId: booking.borrowerId,
        status: booking.status,
        count: sql<number>`count(*)::int`,
      })
      .from(booking)
      .where(
        and(
          eq(booking.cabinId, own.id),
          inArray(booking.status, ["pending", "approved", "paid"]),
          gt(booking.endDate, today),
        ),
      )
      .groupBy(booking.borrowerId, booking.status),
    listAccessRequests(own.id),
  ]);

  const count = (userId: string, statuses: string[]) =>
    stays
      .filter((s) => s.borrowerId === userId && statuses.includes(s.status))
      .reduce((sum, s) => sum + s.count, 0);
  const now = new Date();
  return {
    people: people.map((person) => ({
      ...person,
      pendingRequests: count(person.userId, ["pending"]),
      confirmedStays: count(person.userId, ["approved", "paid"]),
    })),
    invitations: invitations.map((inv) => ({ ...inv, expired: inv.expiresAt <= now })),
    requests,
  };
}

/* ------------------------------ Invitasjonslenken --------------------------- */

export type InvitationStatus = "valid" | "accepted" | "expired" | "revoked";

function statusOf(inv: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InvitationStatus {
  if (inv.revokedAt) return "revoked";
  if (inv.acceptedAt) return "accepted";
  return inv.expiresAt > new Date() ? "valid" : "expired";
}

/**
 * cabin: invitasjonen deler én hytte. account: den slipper bare mottakeren
 * inn i tjenesten. Avgjøres av om invitasjonen har en hytte.
 */
function kindOf(inv: { cabinId: string | null }): "cabin" | "account" {
  return inv.cabinId ? "cabin" : "account";
}

async function loadInvitation(token: unknown) {
  if (!isInvitationToken(token)) return null;
  const [row] = await db
    .select({
      invitation,
      inviterName: user.name,
      cabinName: cabin.name,
      cabinArea: cabin.area,
    })
    .from(invitation)
    .innerJoin(user, eq(user.id, invitation.invitedBy))
    .leftJoin(cabin, eq(cabin.id, invitation.cabinId))
    .where(eq(invitation.token, token))
    .limit(1);
  return row ?? null;
}

/**
 * Det alle med lenken får se, også uten å være logget inn. En lenke kan være
 * videresendt, så her er bare det minste: hvem som inviterer, hva slags
 * invitasjon det er, og en maskert adresse. Ingenting om hytta.
 */
export async function getPublicInvitation(token: unknown) {
  const row = await loadInvitation(token);
  if (!row) return null;
  return {
    status: statusOf(row.invitation),
    kind: kindOf(row.invitation),
    inviterName: row.inviterName,
    maskedEmail: maskEmail(row.invitation.email),
  };
}

/**
 * Invitasjonen slik mottakeren får se den etter innlogging. Er brukeren
 * logget inn med en annen adresse enn den invitasjonen gjelder, får
 * vedkommende bare vite det, og ingenting om hytta.
 */
export async function getInvitationForViewer(actor: Actor, token: unknown) {
  const row = await loadInvitation(token);
  if (!row) return null;
  const status = statusOf(row.invitation);
  if (normalizeEmail(actor.email) !== row.invitation.email) {
    return {
      mine: false as const,
      status,
      inviterName: row.inviterName,
      maskedEmail: maskEmail(row.invitation.email),
    };
  }
  return {
    mine: true as const,
    status,
    kind: kindOf(row.invitation),
    inviterName: row.inviterName,
    message: row.invitation.message,
    cabin:
      row.invitation.cabinId && row.cabinName && row.cabinArea
        ? { id: row.invitation.cabinId, name: row.cabinName, area: row.cabinArea }
        : null,
  };
}

/* -------------------------------- Hyttekretsen ------------------------------ */

export type CirclePerson = {
  id: string;
  name: string;
  /** Hyttene denne personen deler med brukeren. */
  sharesWithMe: { id: string; name: string }[];
  /** Hyttene brukeren deler med denne personen. */
  iShareWith: { id: string; name: string }[];
};

/**
 * Kretsen til brukeren: bare de faktiske forbindelsene. En person er med
 * hvis vedkommende deler en hytte med brukeren, eller brukeren deler en
 * hytte med vedkommende. Andre medlemmer vises aldri, heller ikke andre som
 * ser de samme hyttene.
 */
export async function getCircle(actor: Actor) {
  const [incoming, outgoing, waiting, origin] = await Promise.all([
    db
      .select({
        personId: user.id,
        personName: user.name,
        cabinId: cabin.id,
        cabinName: cabin.name,
      })
      .from(cabinAccess)
      .innerJoin(cabin, eq(cabin.id, cabinAccess.cabinId))
      .innerJoin(user, eq(user.id, cabin.ownerId))
      .where(eq(cabinAccess.userId, actor.id))
      .orderBy(asc(cabin.name)),
    db
      .select({
        personId: user.id,
        personName: user.name,
        cabinId: cabin.id,
        cabinName: cabin.name,
      })
      .from(cabinAccess)
      .innerJoin(cabin, eq(cabin.id, cabinAccess.cabinId))
      .innerJoin(user, eq(user.id, cabinAccess.userId))
      .where(eq(cabin.ownerId, actor.id))
      .orderBy(asc(cabin.name)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        cabinId: cabin.id,
        cabinName: cabin.name,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
      .where(
        and(
          eq(cabin.ownerId, actor.id),
          isNull(invitation.acceptedAt),
          isNull(invitation.revokedAt),
        ),
      )
      .orderBy(asc(invitation.createdAt)),
    db
      .select({ inviterName: user.name })
      .from(invitation)
      .innerJoin(user, eq(user.id, invitation.invitedBy))
      .where(
        and(
          eq(invitation.email, normalizeEmail(actor.email)),
          isNotNull(invitation.acceptedAt),
          isNull(invitation.revokedAt),
        ),
      )
      .orderBy(asc(invitation.acceptedAt))
      .limit(1),
  ]);

  const people = new Map<string, CirclePerson>();
  const person = (id: string, name: string) => {
    let found = people.get(id);
    if (!found) {
      found = { id, name, sharesWithMe: [], iShareWith: [] };
      people.set(id, found);
    }
    return found;
  };
  for (const row of incoming) {
    if (row.personId === actor.id) continue;
    person(row.personId, row.personName).sharesWithMe.push({
      id: row.cabinId,
      name: row.cabinName,
    });
  }
  for (const row of outgoing) {
    person(row.personId, row.personName).iShareWith.push({
      id: row.cabinId,
      name: row.cabinName,
    });
  }

  const now = new Date();
  return {
    people: [...people.values()].sort(
      (a, b) =>
        Number(b.sharesWithMe.length > 0) - Number(a.sharesWithMe.length > 0) ||
        a.name.localeCompare(b.name, "nb"),
    ),
    waiting: waiting.map((inv) => ({ ...inv, expired: inv.expiresAt <= now })),
    /** Navnet på den som først inviterte brukeren, hvis invitasjonen fortsatt gjelder. */
    invitedBy: origin[0]?.inviterName ?? null,
  };
}

/* ------------------------------ Administrasjon ------------------------------ */

/**
 * En administrator slipper en person inn i tjenesten. Invitasjonen gir ikke
 * innsyn i noen hytter. Den lar bare mottakeren logge inn og legge inn sin
 * egen hytte.
 */
export async function inviteAccount(
  actor: Actor,
  rawEmail: unknown,
  rawMessage: unknown = "",
): Promise<{ emailAccepted: boolean }> {
  if (!actor.isAdmin) throw new UserError("Bare administratorer kan invitere uten å vise en hytte.");
  const email = parseEmail(rawEmail);
  const message = parseMessage(rawMessage);
  if (await findRegisteredUser(email)) throw new UserError("Denne adressen er allerede med.");

  const [waiting] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.email, email), isNull(invitation.cabinId), usable()))
    .limit(1);
  if (waiting) throw new UserError("Denne adressen er allerede invitert.");

  const fresh = newInvitation();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(invitation)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitation.email, email), isNull(invitation.cabinId), spent()));
      await tx.insert(invitation).values({
        email,
        kind: "owner", // navnet fra første versjon, se schema.ts
        invitedBy: actor.id,
        message,
        token: fresh.token,
        expiresAt: fresh.expiresAt,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError("Denne adressen er allerede invitert.");
    throw error;
  }
  const emailAccepted = await sendEmail(
    accountInvitationMail(email, actor.name, { message, ...fresh }),
  );
  return { emailAccepted };
}

/** Administrator trekker tilbake en invitasjon som ikke er tatt i bruk. */
export async function revokeAccountInvitation(actor: Actor, invitationId: unknown) {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
  if (!z.uuid().safeParse(invitationId).success) throw new UserError("Fant ikke invitasjonen.");
  const updated = await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitation.id, invitationId as string),
        isNull(invitation.cabinId),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
      ),
    )
    .returning({ id: invitation.id });
  if (updated.length === 0) throw new UserError("Fant ikke invitasjonen.");
}

/**
 * Oversikt for administratorer: bare invitasjonene administratorene selv har
 * sendt uten hytte. Delinger mellom eiere og venner vises ikke her.
 */
export async function listAccountInvitations(actor: Actor) {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      name: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(user.email, invitation.email))
    .where(and(isNull(invitation.cabinId), isNull(invitation.revokedAt)))
    .orderBy(asc(invitation.createdAt));
  return rows.map((row) => ({ ...row, status: statusOf(row) }));
}

/* ---------------------- Invitasjonslenken uten innlogging -------------------- */

/**
 * Det alle med lenken til en hytteinvitasjon får se, også uten å være logget
 * inn: bildene, området på kart og hvem som inviterer. Ikke navnet på hytta,
 * pris, adresse eller nøyaktig posisjon. En lenke kan være videresendt, så
 * mer enn dette vises ikke før rett person er logget inn og har tilgang.
 *
 * Hytta vises bare så lenge invitasjonen gjelder: ikke trukket tilbake og
 * innenfor fristen. Lenken kan åpnes så mange ganger som helst.
 */
export async function getInvitationPreview(token: unknown) {
  const row = await loadInvitation(token);
  if (!row) return null;
  const base = {
    status: statusOf(row.invitation),
    kind: kindOf(row.invitation),
    inviterName: row.inviterName,
    maskedEmail: maskEmail(row.invitation.email),
  };
  const { cabinId, revokedAt, expiresAt } = row.invitation;
  if (!cabinId || revokedAt || expiresAt <= new Date()) return { ...base, cabin: null };

  const [place] = await db
    .select({ area: cabin.area, latitude: cabin.latitude, longitude: cabin.longitude })
    .from(cabin)
    .where(eq(cabin.id, cabinId))
    .limit(1);
  if (!place) return { ...base, cabin: null };
  return {
    ...base,
    cabin: {
      area: place.area,
      // Den nøyaktige posisjonen forlater aldri tjenestelaget her heller.
      areaPosition: approximatePosition(place),
      photos: await listCabinPhotos(cabinId),
    },
  };
}

/**
 * Hytta invitasjonslenken viser bilder av, eller null. Brukes av bildeadressen
 * for invitasjoner, med de samme reglene som getInvitationPreview.
 */
export async function getPreviewCabinId(token: unknown): Promise<string | null> {
  if (!isInvitationToken(token)) return null;
  const [row] = await db
    .select({ cabinId: invitation.cabinId })
    .from(invitation)
    .where(and(eq(invitation.token, token), previewable()))
    .limit(1);
  return row?.cabinId ?? null;
}

/**
 * Adressen invitasjonen ble sendt til, slik at innloggingen kan fylles ut på
 * forhånd. Adressen går aldri til nettleseren: den brukes bare på serveren,
 * og siden viser den maskert.
 */
export async function getInvitedEmail(token: unknown): Promise<string | null> {
  const row = await loadInvitation(token);
  if (!row) return null;
  const status = statusOf(row.invitation);
  return status === "valid" || status === "accepted" ? row.invitation.email : null;
}

/* ------------------- Innlogging med en annen adresse enn invitert ------------------- */

/** Så mange andre adresser kan prøve seg på én invitasjon. Stopper misbruk av en spredt lenke. */
export const MAX_ACCESS_REQUESTS = 5;

/** Invitasjonen bak lenken, hvis den viser en hytte nå. */
async function previewableInvitation(token: unknown) {
  if (!isInvitationToken(token)) return null;
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      cabinId: invitation.cabinId,
      ownerId: cabin.ownerId,
    })
    .from(invitation)
    .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
    .where(and(eq(invitation.token, token), previewable()))
    .limit(1);
  return row ?? null;
}

async function requestCount(invitationId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invitationRequest)
    .where(eq(invitationRequest.invitationId, invitationId));
  return row.count;
}

/**
 * Noen fra invitasjonslenken ber om kode til en annen adresse enn den
 * invitasjonen ble sendt til. Da får adressen slippe inn, men personen ser
 * ingenting før eieren har godkjent. Eieren får vite om det først når
 * adressen er bekreftet med koden og velkomstsiden er fullført.
 *
 * Svarer ingenting: innloggingen skal ikke røpe hva som skjedde.
 */
export async function registerAccessRequest(token: unknown, rawEmail: string) {
  const inv = await previewableInvitation(token);
  if (!inv) return;
  const email = normalizeEmail(rawEmail);
  if (email === inv.email) return;
  if ((await requestCount(inv.id)) >= MAX_ACCESS_REQUESTS) return;
  await db
    .insert(invitationRequest)
    .values({ invitationId: inv.id, email })
    .onConflictDoNothing();
}

/** Eieren får beskjed om en ny person som venter på godkjenning. */
async function notifyOwner(requestId: string) {
  const [row] = await db
    .select({
      ownerEmail: user.email,
      ownerName: user.name,
      cabinId: cabin.id,
      cabinName: cabin.name,
      invitedEmail: invitation.email,
      requesterId: invitationRequest.userId,
      requesterEmail: invitationRequest.email,
    })
    .from(invitationRequest)
    .innerJoin(invitation, eq(invitation.id, invitationRequest.invitationId))
    .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
    .innerJoin(user, eq(user.id, cabin.ownerId))
    .where(eq(invitationRequest.id, requestId))
    .limit(1);
  if (!row?.requesterId) return;
  const [requester] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, row.requesterId))
    .limit(1);
  await sendEmail(
    accessRequestMail(row.ownerEmail, {
      requesterName: requester?.name ?? row.requesterEmail,
      requesterEmail: row.requesterEmail,
      invitedEmail: row.invitedEmail,
      cabinName: row.cabinName,
      link: `${appUrl()}/mine-hytter/${row.cabinId}#deling`,
    }),
  );
}

/** Personen har ikke tilgang fra før og eier ikke hytta. Da trengs ingen godkjenning. */
async function needsApproval(userId: string, cabinId: string, ownerId: string) {
  if (userId === ownerId) return false;
  const [has] = await db
    .select({ userId: cabinAccess.userId })
    .from(cabinAccess)
    .where(and(eq(cabinAccess.cabinId, cabinId), eq(cabinAccess.userId, userId)))
    .limit(1);
  return !has;
}

/**
 * Knytter forespørslene til brukeren når adressen er bekreftet og
 * velkomstsiden er fullført, og sier fra til eieren. Kalles fra
 * claimInvitations.
 */
async function linkAccessRequests(userId: string, email: string) {
  const linked = await db
    .update(invitationRequest)
    .set({ userId })
    .where(
      and(
        eq(invitationRequest.email, email),
        isNull(invitationRequest.userId),
        isNull(invitationRequest.declinedAt),
      ),
    )
    .returning({ id: invitationRequest.id, invitationId: invitationRequest.invitationId });
  for (const request of linked) {
    const [inv] = await db
      .select({ cabinId: invitation.cabinId, ownerId: cabin.ownerId })
      .from(invitation)
      .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
      .where(and(eq(invitation.id, request.invitationId), previewable()))
      .limit(1);
    if (inv?.cabinId && (await needsApproval(userId, inv.cabinId, inv.ownerId))) {
      await notifyOwner(request.id);
    }
  }
}

/**
 * Hvor en innlogget person med en annen adresse står med invitasjonen:
 * has-access: ser hytta allerede.
 * pending: venter på at eieren godkjenner.
 * declined: eieren har sagt nei.
 * removed: eieren godkjente, men har sluttet å vise hytta.
 * none: har ikke bedt om å se hytta ennå.
 * full: for mange har prøvd seg med denne lenken.
 * unavailable: invitasjonen viser ingen hytte nå.
 */
export type AccessRequestState =
  | { state: "has-access"; cabinId: string }
  | { state: "pending" | "declined" | "removed" | "none" | "full" | "unavailable" };

export async function getAccessRequestState(
  actor: Actor,
  token: unknown,
): Promise<AccessRequestState> {
  const inv = await previewableInvitation(token);
  if (!inv?.cabinId) return { state: "unavailable" };
  if (!(await needsApproval(actor.id, inv.cabinId, inv.ownerId))) {
    return { state: "has-access", cabinId: inv.cabinId };
  }
  const [request] = await db
    .select({ approvedAt: invitationRequest.approvedAt, declinedAt: invitationRequest.declinedAt })
    .from(invitationRequest)
    .where(
      and(
        eq(invitationRequest.invitationId, inv.id),
        or(
          eq(invitationRequest.userId, actor.id),
          eq(invitationRequest.email, normalizeEmail(actor.email)),
        ),
      ),
    )
    .limit(1);
  if (request?.declinedAt) return { state: "declined" };
  if (request?.approvedAt) return { state: "removed" };
  if (request) return { state: "pending" };
  if ((await requestCount(inv.id)) >= MAX_ACCESS_REQUESTS) return { state: "full" };
  return { state: "none" };
}

/**
 * En innlogget person med en annen adresse ber eieren om å få se hytta i
 * invitasjonen. Eieren får beskjed og må godkjenne.
 */
export async function requestAccessViaInvitation(actor: Actor, token: unknown) {
  const inv = await previewableInvitation(token);
  if (!inv?.cabinId) throw new UserError("Invitasjonen gjelder ikke lenger.");
  if (!(await needsApproval(actor.id, inv.cabinId, inv.ownerId))) return;
  if ((await requestCount(inv.id)) >= MAX_ACCESS_REQUESTS) {
    throw new UserError("For mange har brukt denne lenken. Be eieren om en egen invitasjon.");
  }
  const email = normalizeEmail(actor.email);
  const [created] = await db
    .insert(invitationRequest)
    .values({ invitationId: inv.id, email, userId: actor.id })
    .onConflictDoNothing()
    .returning({ id: invitationRequest.id });
  if (created) await notifyOwner(created.id);
}

/** Forespørsler eieren må ta stilling til for én hytte. Bare for eieren. */
async function listAccessRequests(cabinId: string) {
  const rows = await db
    .select({
      id: invitationRequest.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      invitedEmail: invitation.email,
      createdAt: invitationRequest.createdAt,
    })
    .from(invitationRequest)
    .innerJoin(invitation, eq(invitation.id, invitationRequest.invitationId))
    .innerJoin(user, eq(user.id, invitationRequest.userId))
    .where(
      and(
        eq(invitation.cabinId, cabinId),
        isNull(invitationRequest.approvedAt),
        isNull(invitationRequest.declinedAt),
        previewable(),
        sql`not exists (
          select 1 from "cabin_access" a
          where a."cabin_id" = ${cabinId} and a."user_id" = "user"."id"
        )`,
      ),
    )
    .orderBy(asc(invitationRequest.createdAt));
  return rows;
}

/** Forespørselen, men bare hvis brukeren eier hytta den gjelder. */
async function ownAccessRequest(actor: Actor, requestId: unknown) {
  if (!z.uuid().safeParse(requestId).success) throw new UserError("Fant ikke forespørselen.");
  const [row] = await db
    .select({
      id: invitationRequest.id,
      userId: invitationRequest.userId,
      email: invitationRequest.email,
      approvedAt: invitationRequest.approvedAt,
      declinedAt: invitationRequest.declinedAt,
      cabinId: cabin.id,
      cabinName: cabin.name,
      cabinArea: cabin.area,
      ownerId: cabin.ownerId,
    })
    .from(invitationRequest)
    .innerJoin(invitation, eq(invitation.id, invitationRequest.invitationId))
    .innerJoin(cabin, eq(cabin.id, invitation.cabinId))
    .where(eq(invitationRequest.id, requestId as string))
    .limit(1);
  if (!row || row.ownerId !== actor.id || !row.userId) {
    throw new UserError("Fant ikke forespørselen.");
  }
  if (row.approvedAt || row.declinedAt) throw new UserError("Forespørselen er allerede besvart.");
  return { ...row, userId: row.userId };
}

/** Eieren godkjenner personen. Da ser personen hytta og kan be om å låne den. */
export async function approveAccessRequest(actor: Actor, requestId: unknown) {
  const request = await ownAccessRequest(actor, requestId);
  await db.transaction(async (tx) => {
    await tx
      .insert(cabinAccess)
      .values({ cabinId: request.cabinId, userId: request.userId })
      .onConflictDoNothing();
    await tx
      .update(invitationRequest)
      .set({ approvedAt: new Date() })
      .where(eq(invitationRequest.id, request.id));
  });
  await sendEmail(
    cabinSharedMail(request.email, actor.name, {
      cabinName: request.cabinName,
      cabinArea: request.cabinArea,
      message: "",
      link: `${appUrl()}/hytter/${request.cabinId}`,
    }),
  );
  return { cabinId: request.cabinId };
}

/** Eieren sier nei. Personen ser fortsatt ingenting, og får ikke spørre på nytt med samme lenke. */
export async function declineAccessRequest(actor: Actor, requestId: unknown) {
  const request = await ownAccessRequest(actor, requestId);
  await db
    .update(invitationRequest)
    .set({ declinedAt: new Date() })
    .where(eq(invitationRequest.id, request.id));
  return { cabinId: request.cabinId };
}
