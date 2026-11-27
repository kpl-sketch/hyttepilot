import { connection, type NextRequest } from "next/server";
import { rejectUnlessCron } from "@/lib/cron";
import { pruneJoinRequests } from "@/lib/services/join-requests";
import { pruneThrottle } from "@/lib/services/login";

/**
 * Jobben som sletter det personvernsiden sier at vi sletter, også når ingen
 * bruker tjenesten den dagen: et nei til en som ba om invitasjon etter 30
 * dager, en som ikke har fått svar etter 90, og IP-adressene i bremsen etter
 * et døgn. Vercel kaller adressen én gang i døgnet etter planen i vercel.json.
 *
 * Er CRON_SECRET satt, avvises alle kall uten den. Jobben svarer bare med
 * antall, og den kan kjøres så ofte som helst.
 */
export async function GET(request: NextRequest) {
  // Jobben skal kjøre ved hvert kall, ikke bli laget én gang under byggingen.
  await connection();
  const denied = rejectUnlessCron(request, "Ryddingen");
  if (denied) return denied;

  try {
    const joinRequests = await pruneJoinRequests();
    await pruneThrottle();
    console.log(`Rydding: ${joinRequests} som ba om invitasjon, er slettet.`);
    return Response.json({ joinRequests }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Ryddingen feilet:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "Jobben feilet." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
