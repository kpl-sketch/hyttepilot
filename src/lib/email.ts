import "server-only";
import { appendFile } from "node:fs/promises";
import { Resend } from "resend";

export type Mail = { to: string; subject: string; text: string };

/**
 * Sender e-post med Resend når RESEND_API_KEY og EMAIL_FROM er satt.
 * Uten dem skrives e-posten til filen .dev-outbox.jsonl i utvikling, slik at
 * innloggingskoder og varsler kan leses lokalt. En e-post som feiler, logges,
 * men stopper ikke handlingen som utløste den.
 */
export async function sendEmail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    const useOutbox =
      process.env.NODE_ENV !== "production" || process.env.EMAIL_DEV_OUTBOX === "1";
    if (!useOutbox) {
      console.error(
        `E-post er ikke satt opp (mangler RESEND_API_KEY eller EMAIL_FROM). Ikke sendt: «${mail.subject}»`,
      );
      return;
    }
    const line = JSON.stringify({ ...mail, at: new Date().toISOString() });
    await appendFile(".dev-outbox.jsonl", line + "\n");
    console.log(`[e-post til ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return;
  }

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    if (error) console.error("E-post ble ikke sendt:", error);
  } catch (error) {
    console.error("E-post ble ikke sendt:", error);
  }
}
