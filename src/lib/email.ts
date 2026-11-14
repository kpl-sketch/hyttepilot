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
/**
 * Sant når tjenesten kan levere e-post: enten er Resend satt opp, eller så
 * skrives e-posten til den lokale utboksen i utvikling.
 */
export function canSendEmail(): boolean {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return true;
  return process.env.NODE_ENV !== "production" || process.env.EMAIL_DEV_OUTBOX === "1";
}

export async function sendEmail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    const useOutbox =
      process.env.NODE_ENV !== "production" || process.env.EMAIL_DEV_OUTBOX === "1";
    if (!useOutbox) {
      // Emnet logges ikke: e-posten med innloggingskode har koden i emnet.
      console.error(
        "E-post er ikke satt opp (mangler RESEND_API_KEY eller EMAIL_FROM). En e-post ble ikke sendt.",
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
