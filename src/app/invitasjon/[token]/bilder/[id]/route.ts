import type { NextRequest } from "next/server";
import { getPhotoForViewer } from "@/lib/services/photos";

/**
 * Bildene på invitasjonssiden, for den som ikke er logget inn ennå. Følger
 * reglene i getPhotoForViewer: bare bilder av hytta invitasjonen gjelder, og
 * bare så lenge invitasjonen gjelder. `?s=liten` gir det lille bildet.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/invitasjon/[token]/bilder/[id]">,
) {
  const { token, id } = await context.params;
  const size = request.nextUrl.searchParams.get("s") === "liten" ? "thumb" : "full";
  const image = await getPhotoForViewer({ invitationToken: token }, id, size);
  if (!image) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.length),
      // Kort levetid: bildet skal slutte å vises når invitasjonen trekkes tilbake.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
