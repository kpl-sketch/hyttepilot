import type { NextRequest } from "next/server";
import { getPhotoForViewer } from "@/lib/services/photos";
import { getViewer } from "@/lib/session";

/**
 * Viser et bilde av en hytte. Bildene ligger bak innlogging og følger samme
 * regler som hytta: den som ikke får se hytta, får heller ikke se bildet.
 * `?s=liten` gir det lille bildet som brukes i lister.
 */
export async function GET(request: NextRequest, context: RouteContext<"/bilder/[id]">) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 404 });

  const { id } = await context.params;
  const size = request.nextUrl.searchParams.get("s") === "liten" ? "thumb" : "full";
  const image = await getPhotoForViewer(viewer, id, size);
  if (!image) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.length),
      // Et bilde endrer seg aldri: et nytt bilde får ny adresse. «private»
      // hindrer at mellomlagre utenfor nettleseren tar vare på det.
      "Cache-Control": "private, max-age=2592000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
