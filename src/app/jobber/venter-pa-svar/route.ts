import { connection, type NextRequest } from "next/server";
import { rejectUnlessCron } from "@/lib/cron";
import { remindAdminsOfWaiting } from "@/lib/services/join-requests";

/**
 * Jobben som minner administratorene på dem som har bedt om invitasjon og
 * ventet i tre dager uten svar. Vercel kaller adressen én gang i døgnet etter
 * planen i vercel.json, og sender med CRON_SECRET når den er satt.
 *
 * Er CRON_SECRET satt, avvises alle kall uten den. Er den ikke satt, kjører
 * jobben likevel: den svarer bare med antall, og hver person gir høyst én
 * påminnelse (se services/join-requests.ts).
 */
export async function GET(request: NextRequest) {
  // Jobben skal kjøre ved hvert kall, ikke bli laget én gang under byggingen.
  await connection();
  const denied = rejectUnlessCron(request, "Påminnelsen om dem som venter på svar");
  if (denied) return denied;

  try {
    const run = await remindAdminsOfWaiting();
    console.log(
      `Påminnelse om dem som venter på svar: ${run.waiting} personer, ${run.sent} e-poster sendt, ${run.failed} feilet.`,
    );
    return Response.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "Påminnelsen om dem som venter på svar, feilet:",
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      { error: "Jobben feilet." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
