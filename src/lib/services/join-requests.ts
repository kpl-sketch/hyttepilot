import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { adminEmails } from "../brand";
import { addDays, todayInOslo } from "../dates";
import { db } from "../db";
import { cabin, joinRequest, profile, user } from "../db/schema";
import { sendEmail } from "../email";
import { joinRequestNoticeMail, joinRequestReminderMail } from "../emails";
import { type Actor, normalizeEmail, UserError } from "../errors";
import { ANSWER_WITHIN_DAYS, REMIND_AFTER_DAYS } from "../join-request-limits";
import { quoteForNotice } from "./inbox-notices";
import { inviteAccount, isEmailAllowed } from "./invitations";
import { isThrottled } from "./login";

/*
 * Be om invitasjon (valgt av prosjekteier 2026-11-27).
 *
 * Tjenesten er fortsatt bare for inviterte. Skjemaet på /be-om-invitasjon lar
 * en som ikke kjenner noen her, spørre administratorene. Reglene:
 *
 *  - Å be om invitasjon gir ingen adgang. Bare en administrator kan gjøre
 *    raden om til en invitasjon, og da den vanlige invitasjonen uten hytte
 *    (inviteAccount). Ingen ser en hytte før eieren viser den.
 *  - Adressen i skjemaet er ikke bekreftet: hvem som helst kan ha skrevet
 *    den. Tjenesten sender derfor aldri e-post til den før en administrator
 *    har valgt å invitere. Ingen kvittering på e-post, og ingen e-post ved nei.
 *  - Skjemaet svarer likt enten adressen er ny, allerede med, allerede
 *    invitert eller har spurt før. Siden røper ikke hvem som er med.
 *  - Bare administratorene ser hvem som har spurt. Varselet om en ny går bare
 *    til adressene i ADMIN_EMAILS.
 *  - Navn og tekst kommer fra hvem som helst. De renses for linjeskift og
 *    lenker før de lagres, så de trygt kan stå i en e-post fra tjenesten.
 *  - Brems: per IP-adresse og per e-postadresse, og et tak på nye rader per
 *    døgn, så skjemaet ikke kan fylle innboksen til administratorene.
 *  - Svarfrist: kvitteringen sier at den som ikke har hørt fra oss innen 14
 *    dager, ikke får plass nå (ANSWER_WITHIN_DAYS). Da trengs ingen e-post
 *    ved nei. Administratorene ser fristen ved hver person, og får én
 *    påminnelse når noen har ventet i tre dager (REMIND_AFTER_DAYS). Hver
 *    person gir høyst én påminnelse, og den nevner aldri navn eller tekst.
 *  - Sletting: et nei slettes etter 30 dager, og en som ikke har fått svar,
 *    etter 90. Den som er invitert, står igjen sammen med invitasjonen.
 *    Slettingen kjøres hvert døgn av jobben /jobber/rydding, så det
 *    personvernsiden sier, holder også når ingen bruker tjenesten.
 */

/** Så mange nye kan be om invitasjon på ett døgn. Resten må prøve igjen. */
export const MAX_JOIN_REQUESTS_PER_DAY = 30;

/** Så lenge blir et nei stående. I den tiden gir samme adresse ingen ny rad. */
export const DECLINED_DAYS = 30;

/** Så lenge blir en ubesvart stående før den slettes. */
export const UNANSWERED_DAYS = 90;

/** Så mange ubesvarte vises i administrasjonen. De eldste først. */
export const MAX_LISTED_OPEN = 50;

/** Så mange besvarte vises i administrasjonen. De nyeste først. */
export const MAX_LISTED_ANSWERED = 20;

const TOO_MANY = "For mange forsøk. Vent et kvarter og prøv igjen.";

const inputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Skriv navnet ditt.")
    .max(80, "Navnet kan være på høyst 80 tegn."),
  email: z.email("Skriv en gyldig e-postadresse."),
  hasCabin: z.enum(["ja", "nei"], "Velg om du har hytte."),
  note: z.string().trim().max(300, "Teksten kan være på høyst 300 tegn."),
});

export type JoinRequestInput = {
  name: unknown;
  email: unknown;
  hasCabin: unknown;
  note: unknown;
  /** Et felt mennesker ikke ser. Er det fylt ut, er avsenderen et program. */
  trap?: unknown;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60_000);

/** Dagen i Oslo da kvitteringens frist går ut for en som spurte `createdAt`. */
const deadlineFor = (createdAt: Date) => addDays(todayInOslo(createdAt), ANSWER_WITHIN_DAYS);

/** Raden venter på svar. */
const unanswered = () => and(isNull(joinRequest.invitedAt), isNull(joinRequest.declinedAt));

/**
 * Sletter det som har stått lenge nok: et nei etter 30 dager, en ubesvart
 * etter 90. Kjøres hvert døgn av jobben /jobber/rydding, og hver gang noen
 * ber om invitasjon. Svaret er antall rader som ble slettet.
 */
export async function pruneJoinRequests(): Promise<number> {
  const removed = await db
    .delete(joinRequest)
    .where(
      or(
        and(isNotNull(joinRequest.declinedAt), lt(joinRequest.declinedAt, days(DECLINED_DAYS))),
        and(unanswered(), lt(joinRequest.createdAt, days(UNANSWERED_DAYS))),
      ),
    )
    .returning({ id: joinRequest.id });
  return removed.length;
}

/**
 * Tar imot skjemaet på /be-om-invitasjon. Svaret er ID-en til en ny rad som
 * administratorene skal ha varsel om, eller null når ingenting nytt ble
 * lagret. Den som kaller, viser samme kvittering i begge tilfeller.
 *
 * Ingenting her gir adgang, og ingenting sendes til adressen i skjemaet.
 */
export async function requestInvitation(
  raw: JoinRequestInput,
  ip: string,
): Promise<{ id: string } | null> {
  // Et program som fyller ut alle felt, får samme kvittering som alle andre.
  if (text(raw.trap).trim()) return null;

  const parsed = inputSchema.safeParse({
    name: text(raw.name),
    email: normalizeEmail(text(raw.email)),
    hasCabin: text(raw.hasCabin),
    note: text(raw.note),
  });
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const { email } = parsed.data;
  if (/https?:\/\/|www\./i.test(parsed.data.name)) throw new UserError("Skriv bare navnet ditt.");
  const name = quoteForNotice(parsed.data.name, 80);
  const note = quoteForNotice(parsed.data.note, 300);

  // Egne nøkler, så skjemaet ikke bruker opp forsøkene på innlogging.
  const limited =
    (await isThrottled(`bi-ip:${ip}`, 5)) || (await isThrottled(`bi-e:${email}`, 3));
  if (limited) throw new UserError(TOO_MANY);

  await pruneJoinRequests();

  // Har adressen en rad fra før, lagres ingenting nytt: en som venter, et nei
  // som fortsatt står, eller en invitasjon fra de siste 30 dagene.
  const [existing] = await db
    .select({ id: joinRequest.id })
    .from(joinRequest)
    .where(
      and(
        eq(joinRequest.email, email),
        or(
          unanswered(),
          isNotNull(joinRequest.declinedAt),
          gt(joinRequest.invitedAt, days(DECLINED_DAYS)),
        ),
      ),
    )
    .limit(1);
  if (existing) return null;

  const [{ recent }] = await db
    .select({ recent: count() })
    .from(joinRequest)
    .where(gt(joinRequest.createdAt, days(1)));
  if (recent >= MAX_JOIN_REQUESTS_PER_DAY) {
    throw new UserError("Det er mange som spør akkurat nå. Prøv igjen i morgen.");
  }

  const [created] = await db
    .insert(joinRequest)
    .values({ name, email, hasCabin: parsed.data.hasCabin === "ja", note })
    // To trykk samtidig gir én rad, se indeksen i schema.ts.
    .onConflictDoNothing()
    .returning({ id: joinRequest.id });
  return created ?? null;
}

/**
 * Hva tjenesten vet om adressen fra før. Bare administratorene får se det.
 * member: personen er med. invited: adressen kan logge inn, for eksempel
 * fordi den har en invitasjon som gjelder.
 */
async function stateOf(email: string): Promise<"new" | "member" | "invited"> {
  const [registered] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(profile, eq(profile.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (registered) return "member";
  return (await isEmailAllowed(email)) ? "invited" : "new";
}

/**
 * Sender administratorene varsel om en som har bedt om invitasjon. Kalles
 * etter at skjemaet har fått svar, så svaret tar like lang tid for alle.
 */
export async function notifyAdminsOfJoinRequest(
  id: string,
): Promise<{ sent: number; failed: number }> {
  const [row] = await db
    .select()
    .from(joinRequest)
    .where(and(eq(joinRequest.id, id), unanswered()))
    .limit(1);
  if (!row) return { sent: 0, failed: 0 };
  const state = await stateOf(row.email);
  let sent = 0;
  let failed = 0;
  for (const to of adminEmails()) {
    const accepted = await sendEmail(
      joinRequestNoticeMail(to, {
        name: row.name,
        email: row.email,
        hasCabin: row.hasCabin,
        note: row.note,
        state,
        deadline: deadlineFor(row.createdAt),
      }),
    );
    if (accepted) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/**
 * Én påminnelse til administratorene når noen har ventet i tre dager uten
 * svar. Kjøres hvert døgn av jobben /jobber/venter-pa-svar.
 *
 * Hver person gir høyst én påminnelse. Har flere ventet lenge nok, samles de
 * i én e-post. E-posten sier hvor mange som venter og når den første fristen
 * går ut, aldri navn eller tekst: det står i administrasjonen.
 */
export async function remindAdminsOfWaiting(): Promise<{
  waiting: number;
  sent: number;
  failed: number;
}> {
  // Radene merkes før e-posten sendes. Kjører jobben to ganger samtidig, er
  // det bare én som sender.
  const claimed = await db
    .update(joinRequest)
    .set({ remindedAt: new Date() })
    .where(
      and(
        unanswered(),
        isNull(joinRequest.remindedAt),
        lt(joinRequest.createdAt, days(REMIND_AFTER_DAYS)),
      ),
    )
    .returning({ id: joinRequest.id, createdAt: joinRequest.createdAt });
  if (claimed.length === 0) return { waiting: 0, sent: 0, failed: 0 };

  const oldest = claimed.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  let sent = 0;
  let failed = 0;
  for (const to of adminEmails()) {
    const accepted = await sendEmail(
      joinRequestReminderMail(to, {
        waiting: claimed.length,
        firstDeadline: deadlineFor(oldest.createdAt),
      }),
    );
    if (accepted) sent += 1;
    else failed += 1;
  }
  // Kom ingen e-post fram, prøver jobben igjen neste døgn.
  if (sent === 0) {
    await db
      .update(joinRequest)
      .set({ remindedAt: null })
      .where(
        inArray(
          joinRequest.id,
          claimed.map((row) => row.id),
        ),
      );
  }
  return { waiting: claimed.length, sent, failed };
}

/* ------------------------------ Administrasjon ------------------------------ */

function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
}

function parseId(raw: unknown): string {
  if (!z.uuid().safeParse(raw).success) throw new UserError("Fant ikke personen i listen.");
  return raw as string;
}

export type OpenJoinRequest = {
  id: string;
  name: string;
  email: string;
  hasCabin: boolean;
  note: string;
  createdAt: Date;
  /** Dagen kvitteringens frist går ut (ÅÅÅÅ-MM-DD, norsk tid). */
  deadline: string;
  /** Fristen er ute. Personen har fått vite at det betyr nei. */
  overdue: boolean;
  state: "new" | "member" | "invited";
};

export type AnsweredJoinRequest = {
  id: string;
  name: string;
  email: string;
  hasCabin: boolean;
  outcome: "invited" | "declined";
  decidedAt: Date;
  /** Administratoren som svarte. */
  decidedByName: string | null;
  /** Personen har logget inn og fullført velkomstsiden. */
  joined: boolean;
};

export type JoinRequestOverview = {
  open: OpenJoinRequest[];
  /** Alle som venter på svar, også de som ikke fikk plass i listen. */
  waiting: number;
  answered: AnsweredJoinRequest[];
  /**
   * Hva invitasjonene herfra har ført til: hvor mange som er invitert, hvor
   * mange av dem som er med, og hvor mange av dem som har lagt inn hytte.
   */
  funnel: { invited: number; joined: number; withCabin: number };
};

/**
 * Oversikten for administratorene: hvem som venter på svar, hvem som har
 * fått svar, og hva invitasjonene herfra har ført til.
 */
export async function listJoinRequests(actor: Actor): Promise<JoinRequestOverview> {
  requireAdmin(actor);
  // Listen sletter ingenting selv: å åpne en side skal ikke endre noe.
  // Ryddingen gjøres av jobben /jobber/rydding.
  const [openRows, [{ waiting }]] = await Promise.all([
    db
      .select()
      .from(joinRequest)
      .where(unanswered())
      .orderBy(asc(joinRequest.createdAt))
      .limit(MAX_LISTED_OPEN),
    db.select({ waiting: count() }).from(joinRequest).where(unanswered()),
  ]);
  const today = todayInOslo();
  const open: OpenJoinRequest[] = [];
  for (const row of openRows) {
    const deadline = deadlineFor(row.createdAt);
    open.push({
      id: row.id,
      name: row.name,
      email: row.email,
      hasCabin: row.hasCabin,
      note: row.note,
      createdAt: row.createdAt,
      deadline,
      overdue: deadline < today,
      state: await stateOf(row.email),
    });
  }

  // Den som ba om invitasjon, er «med» når adressen har fullført velkomstsiden.
  const admin = alias(user, "admin");
  const member = alias(user, "member");
  const answeredRows = await db
    .select({
      id: joinRequest.id,
      name: joinRequest.name,
      email: joinRequest.email,
      hasCabin: joinRequest.hasCabin,
      invitedAt: joinRequest.invitedAt,
      declinedAt: joinRequest.declinedAt,
      decidedByName: admin.name,
      joinedId: profile.userId,
    })
    .from(joinRequest)
    .leftJoin(admin, eq(admin.id, joinRequest.decidedBy))
    .leftJoin(member, eq(member.email, joinRequest.email))
    .leftJoin(profile, eq(profile.userId, member.id))
    .where(or(isNotNull(joinRequest.invitedAt), isNotNull(joinRequest.declinedAt)))
    .orderBy(desc(sql`coalesce(${joinRequest.invitedAt}, ${joinRequest.declinedAt})`))
    .limit(MAX_LISTED_ANSWERED);
  const answered: AnsweredJoinRequest[] = answeredRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    hasCabin: row.hasCabin,
    outcome: row.invitedAt ? "invited" : "declined",
    decidedAt: (row.invitedAt ?? row.declinedAt) as Date,
    decidedByName: row.decidedByName,
    joined: Boolean(row.invitedAt && row.joinedId),
  }));

  const [funnel] = await db
    .select({
      invited: count(),
      joined: count(profile.userId),
      withCabin: sql<number>`count(*) filter (where exists (select 1 from ${cabin} where ${cabin.ownerId} = ${profile.userId}))::int`,
    })
    .from(joinRequest)
    .leftJoin(member, eq(member.email, joinRequest.email))
    .leftJoin(profile, eq(profile.userId, member.id))
    .where(isNotNull(joinRequest.invitedAt));

  return { open, waiting, answered, funnel };
}

/**
 * En administrator inviterer en som har bedt om det. Personen får den vanlige
 * invitasjonen uten hytte, og e-posten sier at de selv ba om den.
 */
export async function inviteFromJoinRequest(
  actor: Actor,
  requestId: unknown,
): Promise<{ emailAccepted: boolean; name: string }> {
  requireAdmin(actor);
  const id = parseId(requestId);
  // Raden reserveres før invitasjonen sendes. Trykker to administratorer
  // samtidig, er det bare én som sender.
  const [claimed] = await db
    .update(joinRequest)
    .set({ invitedAt: new Date(), decidedBy: actor.id })
    .where(and(eq(joinRequest.id, id), unanswered()))
    .returning({ email: joinRequest.email, name: joinRequest.name });
  if (!claimed) throw new UserError("Noen har allerede svart denne personen.");
  try {
    const { emailAccepted, invitationId } = await inviteAccount(actor, claimed.email, "", {
      requested: true,
    });
    await db.update(joinRequest).set({ invitationId }).where(eq(joinRequest.id, id));
    return { emailAccepted, name: claimed.name };
  } catch (error) {
    // Ble det ingen invitasjon, venter personen fortsatt på svar.
    await db
      .update(joinRequest)
      .set({ invitedAt: null, decidedBy: null })
      .where(eq(joinRequest.id, id));
    throw error;
  }
}

/**
 * En administrator sier nei, eller fjerner en som allerede er med, fra
 * listen. Personen får ingen e-post.
 */
export async function declineJoinRequest(actor: Actor, requestId: unknown) {
  requireAdmin(actor);
  const id = parseId(requestId);
  const updated = await db
    .update(joinRequest)
    .set({ declinedAt: new Date(), decidedBy: actor.id })
    .where(and(eq(joinRequest.id, id), unanswered()))
    .returning({ id: joinRequest.id });
  if (updated.length === 0) throw new UserError("Noen har allerede svart denne personen.");
}
