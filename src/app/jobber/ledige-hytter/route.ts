import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sendIdleReminders } from "@/lib/services/reminders";

/**
 * Den daglige jobben som sender påminnelser om ledige hytter. Vercel kaller
 * adressen etter planen i vercel.json, og sender med CRON_SECRET når den er satt.
 *
 * Er CRON_SECRET satt, avvises alle kall uten den. Er den ikke satt, kjører
 * jobben likevel: den svarer bare med antall, sier ingenting om hytter eller
 * personer, og sender aldri samme påminnelse to ganger (se services/reminders.ts).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const given = request.headers.get("authorization") ?? "";
    if (!same(given, `Bearer ${secret}`)) {
      return Response.json({ error: "Ikke tillatt." }, { status: 401 });
    }
  } else if (process.env.VERCEL_ENV === "production") {
    console.warn("CRON_SECRET er ikke satt. Påminnelsesjobben kjører uten hemmelighet.");
  }

  const run = await sendIdleReminders();
  console.log(
    `Påminnelser om ledige hytter: ${run.checked} sjekket, ${run.sent} sendt, ${run.failed} feilet.`,
  );
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}

/** Sammenligner uten å røpe noe gjennom tiden det tar. */
function same(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
