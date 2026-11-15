import type { NextRequest } from "next/server";
import { UserError } from "@/lib/errors";
import { searchLocations } from "@/lib/services/addresses";
import { getViewer } from "@/lib/session";

/**
 * Forslag til adresser og steder i hytteskjemaet. Søketeksten sendes i selve
 * forespørselen og ikke i adressen, slik at den ikke havner i tilgangslogger.
 */
export async function POST(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ results: [] }, { status: 401 });

  let query: unknown;
  try {
    query = ((await request.json()) as { q?: unknown } | null)?.q;
  } catch {
    return Response.json({ results: [] }, { status: 400 });
  }

  try {
    const results = await searchLocations(viewer, query);
    return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UserError) return Response.json({ results: [] }, { status: 403 });
    throw error;
  }
}
