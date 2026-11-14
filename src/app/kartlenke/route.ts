import type { NextRequest } from "next/server";
import { resolveShortMapLink } from "@/lib/services/map-links";
import { getViewer } from "@/lib/session";

/**
 * Gjør en kort delingslenke fra Google Maps om til koordinater, slik at
 * hytteskjemaet kan vise posisjonen før eieren lagrer. Bare for innloggede.
 * Lenken sendes i selve forespørselen og ikke i adressen, slik at den ikke
 * havner i tilgangslogger.
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ position: null }, { status: 401 });

  let link: unknown;
  try {
    link = ((await request.json()) as { url?: unknown } | null)?.url;
  } catch {
    return Response.json({ position: null }, { status: 400 });
  }
  if (typeof link !== "string" || link.length > 1000) {
    return Response.json({ position: null }, { status: 400 });
  }

  const position = await resolveShortMapLink(link);
  return Response.json({ position }, { headers: { "Cache-Control": "no-store" } });
}
