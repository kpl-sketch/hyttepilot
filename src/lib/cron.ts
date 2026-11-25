import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Sjekker at et kall til en jobb kommer fra Vercels jobbplan (vercel.json).
 * Vercel sender med CRON_SECRET når den er satt.
 *
 * Er CRON_SECRET satt, avvises alle kall uten den, og svaret gis tilbake her.
 * Er den ikke satt, slipper kallet gjennom: jobbene svarer bare med antall og
 * gjør aldri det samme to ganger. I produksjon skrives det en advarsel.
 */
export function rejectUnlessCron(request: Request, jobName: string): Response | null {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const given = request.headers.get("authorization") ?? "";
    if (!same(given, `Bearer ${secret}`)) {
      return Response.json({ error: "Ikke tillatt." }, { status: 401 });
    }
  } else if (process.env.VERCEL_ENV === "production") {
    console.warn(`CRON_SECRET er ikke satt. ${jobName} kjører uten hemmelighet.`);
  }
  return null;
}

/** Sammenligner uten å røpe noe gjennom tiden det tar. */
function same(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
