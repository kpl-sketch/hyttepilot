import type { NextRequest } from "next/server";
import { rejectUnlessCron } from "@/lib/cron";
import { sendIdleReminders } from "@/lib/services/reminders";

/**
 * Jobben som sender påminnelser om ledige hytter før feriene. Den kjøres
 * daglig, men sender bare når en ferie nærmer seg. Vercel kaller adressen etter
 * planen i vercel.json, og sender med CRON_SECRET når den er satt.
 *
 * Er CRON_SECRET satt, avvises alle kall uten den. Er den ikke satt, kjører
 * jobben likevel: den svarer bare med antall, sier ingenting om hytter eller
 * personer, og sender aldri samme påminnelse to ganger (se services/reminders.ts).
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCron(request, "Påminnelsesjobben");
  if (denied) return denied;

  const run = await sendIdleReminders();
  console.log(
    `Påminnelser om ledige hytter: ${run.checked} sjekket, ${run.sent} sendt, ${run.failed} feilet.`,
  );
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
