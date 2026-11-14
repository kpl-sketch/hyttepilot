import "server-only";
import { appendFile } from "node:fs/promises";
import { Resend } from "resend";
import { APP_NAME } from "@/lib/brand";

export type Mail = { to: string; subject: string; text: string };

/**
 * Sender e-post med Resend når RESEND_API_KEY og EMAIL_FROM er satt.
 * Uten dem skrives e-posten til filen .dev-outbox.jsonl i utvikling, slik at
 * innloggingskoder og varsler kan leses lokalt. En e-post som feiler, logges,
 * men stopper ikke handlingen som utløste den.
 *
 * Svaret er sant når Resend har TATT IMOT e-posten (eller den er skrevet til
 * den lokale utboksen). Det betyr ikke at den er kommet fram: avvisning hos
 * mottakeren og søppelpostfilter ser vi ikke her. Det vises i Resends logg.
 */
/**
 * Sant når tjenesten kan levere e-post: enten er Resend satt opp, eller så
 * skrives e-posten til den lokale utboksen i utvikling.
 */
export function canSendEmail(): boolean {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return true;
  return process.env.NODE_ENV !== "production" || process.env.EMAIL_DEV_OUTBOX === "1";
}

export async function sendEmail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    const useOutbox =
      process.env.NODE_ENV !== "production" || process.env.EMAIL_DEV_OUTBOX === "1";
    if (!useOutbox) {
      // Emnet logges ikke: e-posten med innloggingskode har koden i emnet.
      console.error(
        "E-post er ikke satt opp (mangler RESEND_API_KEY eller EMAIL_FROM). En e-post ble ikke sendt.",
      );
      return false;
    }
    const line = JSON.stringify({ ...mail, at: new Date().toISOString() });
    await appendFile(".dev-outbox.jsonl", line + "\n");
    if (process.env.EMAIL_QUIET !== "1") {
      console.log(`[e-post til ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    }
    return true;
  }

  try {
    const resend = new Resend(key);
    const message = { to: mail.to, subject: mail.subject, text: mail.text };
    let { data, error } = await resend.emails.send({ from, ...message });

    if (error && isUnverifiedDomain(error)) {
      // Domenet i EMAIL_FROM er ikke bekreftet hos Resend ennå. Da sender vi
      // fra Resends testadresse, som bare når adressen Resend-kontoen er
      // registrert på. Når domenet er bekreftet, brukes EMAIL_FROM igjen.
      console.warn(
        "Avsenderdomenet er ikke bekreftet hos Resend ennå. Prøver Resends testadresse, som bare når kontoeieren.",
      );
      ({ data, error } = await resend.emails.send({ from: TEST_SENDER, ...message }));
    }

    if (error) {
      console.error("E-post ble ikke sendt:", error);
      if (/api key/i.test(error.message)) {
        // Nøkkelen selv logges aldri, bare formen, slik at en feil innliming
        // kan oppdages uten å vise hemmeligheten.
        console.error(`Resend godtar ikke RESEND_API_KEY (${keyShape(key)}).`);
      }
      return false;
    }
    // Bare Resends egen ID logges, ikke mottaker eller emne. Med ID-en kan
    // leveringen slås opp i Resend.
    console.log(`E-post tatt imot av Resend (${data?.id ?? "uten ID"}).`);
    return true;
  } catch (error) {
    console.error("E-post ble ikke sendt:", error);
    return false;
  }
}

/** Resends egen testadresse. Den leverer bare til eieren av Resend-kontoen. */
const TEST_SENDER = `${APP_NAME} <onboarding@resend.dev>`;

function isUnverifiedDomain(error: { name: string; message: string }): boolean {
  return error.name === "validation_error" && /not verified/i.test(error.message);
}

/** Beskriver formen på en nøkkel uten å røpe innholdet. */
function keyShape(key: string): string {
  return [
    `lengde ${key.length}`,
    `starter med re_: ${key.startsWith("re_") ? "ja" : "nei"}`,
    `mellomrom eller linjeskift: ${/\s/.test(key) ? "ja" : "nei"}`,
    `andre tegn enn bokstaver, tall, _ og -: ${/[^A-Za-z0-9_\-\s]/.test(key) ? "ja" : "nei"}`,
  ].join(", ");
}
