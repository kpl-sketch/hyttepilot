import { connection, type NextRequest } from "next/server";
import { rejectUnlessCron } from "@/lib/cron";
import { notifyAdminsOfNewMail } from "@/lib/services/inbox-notices";

/**
 * Jobben som varsler administratorene når det har kommet e-post til den
 * felles innboksen. Vercel kaller adressen etter planen i vercel.json, og
 * sender med CRON_SECRET når den er satt.
 *
 * Er CRON_SECRET satt, avvises alle kall uten den. Er den ikke satt, kjører
 * jobben likevel: den svarer bare med antall, sier ingenting om hvem som har
 * skrevet, og varsler aldri om samme e-post to ganger (se
 * services/inbox-notices.ts).
 */
export async function GET(request: NextRequest) {
  // Jobben skal kjøre ved hvert kall. Uten denne linjen kan svaret bli laget
  // én gang under byggingen og servert derfra, og da kjører jobben aldri.
  await connection();
  const denied = rejectUnlessCron(request, "Varselet om ny e-post");
  if (denied) return denied;

  try {
    const run = await notifyAdminsOfNewMail();
    console.log(
      `Varsel om ny e-post i innboksen: ${run.unread} uleste, ${run.fresh} nye, ${run.sent} varsler sendt, ${run.failed} feilet.`,
    );
    return Response.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Feilen kan komme fra Resend. Bare meldingen logges, aldri innholdet i e-post.
    console.error("Varselet om ny e-post feilet:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "Jobben feilet." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
