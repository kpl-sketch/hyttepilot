import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { adminEmails } from "../brand";
import { db } from "../db";
import { jobState } from "../db/schema";
import { sendEmail } from "../email";
import { inboxNoticeMail } from "../emails";
import { normalizeEmail } from "../errors";
import { inboxSetup, listUnreadThreads, type UnreadThread } from "./inbox";

/*
 * Varsel til administratorene når det kommer e-post til den felles innboksen.
 *
 * Svar på e-post fra tjenesten går til innboksen (se email.ts). Ingen sitter
 * og ser på den, så uten varsel blir svarene liggende. Jobben kjøres etter
 * planen i vercel.json og sender én e-post til hver administrator når det
 * ligger ulest e-post de ikke har fått varsel om før.
 *
 * Reglene:
 * - Bare uleste tråder i mappen Innboks teller. Søppelpost gir ikke varsel.
 * - Hver e-post gir høyst ett varsel. Tabellen job_state husker tidspunktet
 *   for den nyeste e-posten det er varslet om. Kommer det et nytt svar i en
 *   tråd, er tråden ny igjen.
 * - E-post fra en administrator eller fra innboksen selv gir aldri varsel.
 *   Ellers kunne et fraværssvar på varselet gitt et nytt varsel, i ring.
 * - Varselet går bare til administratorene, som uansett kan lese innboksen.
 *   Det nevner avsender og emne, aldri innholdet.
 * - Uten oppsatt innboks gjør jobben ingenting.
 */
export const INBOX_NOTICE_KEY = "innboksvarsel";

/** Så mange e-poster listes med avsender og emne i ett varsel. */
export const MAX_LISTED = 5;

export type InboxNoticeRun = {
  /** Uleste e-poster i innboksen som ikke er fra administratorene selv. */
  unread: number;
  /** Hvor mange av dem det ikke var varslet om før. */
  fresh: number;
  sent: number;
  failed: number;
};

/** Adressen i «Navn <adresse>», med små bokstaver. Tom når den mangler. */
export function senderAddress(from: string | null): string {
  if (!from) return "";
  const match = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  return match ? normalizeEmail(match[1]) : "";
}

/**
 * Avsender og emne kommer fra hvem som helst og settes inn i en e-post fra
 * tjenesten. Linjeskift og lenker tas derfor bort, og teksten kortes ned, så
 * ingen kan få varselet til å se ut som noe annet enn det er.
 */
export function quoteForNotice(value: string | null, max = 80): string {
  const clean = (value ?? "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[lenke]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Sender administratorene varsel om ulest e-post de ikke har fått varsel om.
 * Trygg å kjøre ofte og samtidig: varselet reserveres i databasen før
 * e-posten sendes, så samme e-post gir aldri to varsler.
 */
export async function notifyAdminsOfNewMail(
  fetchUnread: () => Promise<UnreadThread[]> = listUnreadThreads,
): Promise<InboxNoticeRun> {
  const nothing: InboxNoticeRun = { unread: 0, fresh: 0, sent: 0, failed: 0 };
  const setup = inboxSetup();
  if (!setup.ok) return nothing;
  const inbox = setup.address;
  const admins = adminEmails();
  const recipients = admins.filter((email) => email !== inbox);
  if (recipients.length === 0) return nothing;

  const own = new Set([inbox, ...admins]);
  const threads = (await fetchUnread())
    .map((t) => ({ ...t, at: new Date(t.receivedAt) }))
    .filter((t) => !Number.isNaN(t.at.getTime()))
    .filter((t) => !own.has(senderAddress(t.from)));
  // Databasen røres ikke når innboksen er tom. Jobben kjøres ofte.
  if (threads.length === 0) return nothing;

  const [state] = await db
    .select({ mark: jobState.mark })
    .from(jobState)
    .where(eq(jobState.key, INBOX_NOTICE_KEY));
  const previous = state?.mark ?? null;
  const fresh = threads
    .filter((t) => !previous || t.at > previous)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  if (fresh.length === 0) return { ...nothing, unread: threads.length };

  // Reserver varselet før e-posten sendes. Har en annen kjøring kommet
  // først, gir oppdateringen ingen rad, og vi hopper over.
  const newest = fresh[0].at;
  const claimed = await db
    .insert(jobState)
    .values({ key: INBOX_NOTICE_KEY, mark: newest })
    .onConflictDoUpdate({
      target: jobState.key,
      set: { mark: newest, updatedAt: new Date() },
      setWhere: lt(jobState.mark, newest),
    })
    .returning({ key: jobState.key });
  if (claimed.length === 0) return { ...nothing, unread: threads.length };

  const listed = fresh.slice(0, MAX_LISTED).map((t) => ({
    from: quoteForNotice(t.from) || "ukjent avsender",
    subject: quoteForNotice(t.subject),
  }));
  let sent = 0;
  let failed = 0;
  for (const to of recipients) {
    const accepted = await sendEmail(
      inboxNoticeMail(to, { inbox, listed, fresh: fresh.length, unread: threads.length }),
    );
    if (accepted) sent += 1;
    else failed += 1;
  }

  if (sent === 0) {
    // Kom ingen varsler av gårde, prøver vi igjen ved neste kjøring.
    const ours = and(eq(jobState.key, INBOX_NOTICE_KEY), eq(jobState.mark, newest));
    if (previous) await db.update(jobState).set({ mark: previous }).where(ours);
    else await db.delete(jobState).where(ours);
  }
  return { unread: threads.length, fresh: fresh.length, sent, failed };
}
