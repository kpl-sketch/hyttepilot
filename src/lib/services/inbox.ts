import "server-only";
import { Resend, type ErrorResponse, type InboxMessage, type InboxThread } from "resend";
import { type Actor, UserError, normalizeEmail } from "../errors";

/**
 * Tjenestens felles innboks (for eksempel hei@<domene>), lest og besvart fra
 * administrasjonen. E-posten ligger hos Resend, ikke i vår database. Bare
 * administratorer har tilgang, og alt går gjennom denne fila.
 *
 * Innboksen trenger en Resend-nøkkel med full tilgang. Nøkkelen i
 * RESEND_API_KEY har ofte bare sendetilgang, så RESEND_INBOX_API_KEY brukes
 * først hvis den er satt.
 */

export const INBOX_FOLDERS = ["inbox", "sent", "archive", "spam", "trash"] as const;
export type InboxFolder = (typeof INBOX_FOLDERS)[number];

export const FOLDER_LABELS: Record<InboxFolder, string> = {
  inbox: "Innboks",
  sent: "Sendt",
  archive: "Arkiv",
  spam: "Søppelpost",
  trash: "Papirkurv",
};

export function isInboxFolder(value: unknown): value is InboxFolder {
  return typeof value === "string" && (INBOX_FOLDERS as readonly string[]).includes(value);
}

/**
 * Adressen til innboksen. INBOX_EMAIL brukes først, ellers adressen i
 * EMAIL_FROM, slik at innboksen og avsenderen er den samme.
 */
export function inboxAddress(): string | null {
  const explicit = process.env.INBOX_EMAIL?.trim();
  if (explicit) return normalizeEmail(explicit);
  const from = process.env.EMAIL_FROM ?? "";
  const match = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  return match ? normalizeEmail(match[1]) : null;
}

export type InboxSetup =
  | { ok: true; address: string }
  | { ok: false; reason: string };

/** Om innboksen kan brukes, og hvorfor ikke. Viser aldri nøkkelen. */
export function inboxSetup(): InboxSetup {
  const address = inboxAddress();
  if (!address) {
    return { ok: false, reason: "Innboksen har ingen adresse. Sett INBOX_EMAIL eller EMAIL_FROM." };
  }
  if (!apiKey()) {
    return { ok: false, reason: "Innboksen mangler en Resend-nøkkel. Sett RESEND_INBOX_API_KEY." };
  }
  return { ok: true, address };
}

function apiKey(): string | undefined {
  return (process.env.RESEND_INBOX_API_KEY || process.env.RESEND_API_KEY)?.trim() || undefined;
}

function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
}

function client(): { resend: Resend; address: string } {
  const setup = inboxSetup();
  if (!setup.ok) throw new UserError(setup.reason);
  return { resend: new Resend(apiKey()), address: setup.address };
}

/** Gjør en feil fra Resend om til en melding administratoren kan handle på. */
function fail(error: ErrorResponse): never {
  console.error("Innboksen hos Resend svarte med feil:", error.name, error.statusCode);
  if (error.statusCode === 401 || error.statusCode === 403 || /restricted|api key/i.test(error.message)) {
    throw new UserError(
      "Resend-nøkkelen har ikke tilgang til innboksen. Lag en nøkkel med full tilgang i Resend og legg den i RESEND_INBOX_API_KEY.",
    );
  }
  if (error.statusCode === 404) {
    throw new UserError("Fant ikke e-posten eller innboksen hos Resend.");
  }
  throw new UserError("Resend svarte ikke som ventet. Prøv igjen om litt.");
}

export type ThreadListItem = Pick<
  InboxThread,
  "id" | "subject" | "from" | "to" | "email_count" | "read" | "received_at" | "has_attachment"
>;

export async function listThreads(
  actor: Actor,
  folder: InboxFolder,
): Promise<{ address: string; threads: ThreadListItem[] }> {
  requireAdmin(actor);
  const { resend, address } = client();
  const { data, error } = await resend.inboxes.threads.list({
    emailAddress: address,
    folders: [folder],
    limit: 50,
  });
  if (error) fail(error);
  return {
    address,
    threads: data.data.map((t) => ({
      id: t.id,
      subject: t.subject,
      from: t.from,
      to: t.to,
      email_count: t.email_count,
      read: t.read,
      received_at: t.received_at,
      has_attachment: t.has_attachment,
    })),
  };
}

export type ThreadMessage = Pick<
  InboxMessage,
  "id" | "direction" | "from" | "to" | "cc" | "subject" | "received_at"
> & { body: string; attachments: string[] };

export async function getThread(
  actor: Actor,
  threadId: string,
): Promise<{ address: string; subject: string | null; folder: string; messages: ThreadMessage[] }> {
  requireAdmin(actor);
  const { resend, address } = client();
  const [thread, emails] = await Promise.all([
    resend.inboxes.threads.get({ emailAddress: address, threadId }),
    resend.inboxes.threads.emails.list({ emailAddress: address, threadId, limit: 100 }),
  ]);
  if (thread.error) fail(thread.error);
  if (emails.error) fail(emails.error);

  // Tråden er lest når administratoren har åpnet den.
  if (!thread.data.read) {
    const { error } = await resend.inboxes.threads.update({ emailAddress: address, threadId, read: true });
    if (error) console.error("Kunne ikke markere tråden som lest:", error.name);
  }

  const messages = emails.data.data
    .map((m) => ({
      id: m.id,
      direction: m.direction,
      from: m.from,
      to: m.to,
      cc: m.cc,
      subject: m.subject,
      received_at: m.received_at,
      body: messageText(m),
      attachments: m.attachments.map((a) => a.filename ?? "vedlegg"),
    }))
    .sort((a, b) => a.received_at.localeCompare(b.received_at));

  return { address, subject: thread.data.subject, folder: thread.data.folder, messages };
}

const MAX_BODY = 20_000;

function cleanBody(text: string): string {
  const body = text.trim();
  if (!body) throw new UserError("Skriv en melding.");
  if (body.length > MAX_BODY) throw new UserError("Meldingen er for lang.");
  return body;
}

/** Svarer på siste e-post i tråden, fra innboksens adresse. */
export async function replyToThread(actor: Actor, threadId: string, text: string): Promise<void> {
  requireAdmin(actor);
  const body = cleanBody(text);
  const { resend, address } = client();
  const emails = await resend.inboxes.threads.emails.list({ emailAddress: address, threadId, limit: 100 });
  if (emails.error) fail(emails.error);
  const latest = [...emails.data.data].sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
  if (!latest) throw new UserError("Tråden har ingen e-post å svare på.");
  const { error } = await resend.inboxes.threads.emails.reply({
    emailAddress: address,
    threadId,
    emailId: latest.id,
    text: body,
  });
  if (error) fail(error);
}

/** Sender en ny e-post fra innboksens adresse. Den havner under «Sendt». */
export async function sendNewEmail(
  actor: Actor,
  input: { to: string; subject: string; text: string },
): Promise<void> {
  requireAdmin(actor);
  const to = normalizeEmail(input.to);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new UserError("Skriv en gyldig e-postadresse.");
  const subject = input.subject.trim();
  if (!subject) throw new UserError("Skriv et emne.");
  if (subject.length > 300) throw new UserError("Emnet er for langt.");
  const body = cleanBody(input.text);

  const { resend, address } = client();
  const draft = await resend.inboxes.drafts.create({ emailAddress: address, to, subject, text: body });
  if (draft.error) fail(draft.error);
  const sent = await resend.inboxes.drafts.send({ emailAddress: address, draftId: draft.data.id });
  if (sent.error) fail(sent.error);
}

/** Flytter en tråd til arkivet, papirkurven eller tilbake til innboksen. */
export async function moveThread(
  actor: Actor,
  threadId: string,
  folder: "inbox" | "archive" | "trash",
): Promise<void> {
  requireAdmin(actor);
  const { resend, address } = client();
  const { error } = await resend.inboxes.threads.update({ emailAddress: address, threadId, folder });
  if (error) fail(error);
}

/**
 * Teksten i en e-post. HTML vises aldri som HTML i administrasjonen, fordi
 * innholdet kommer fra hvem som helst. Mangler ren tekst, lages den av HTML-en.
 */
function messageText(m: Pick<InboxMessage, "text" | "html">): string {
  if (m.text?.trim()) return m.text.trim();
  if (!m.html) return "";
  return htmlToText(m.html);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
