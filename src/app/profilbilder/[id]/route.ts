import type { NextRequest } from "next/server";
import { getProfilePhotoForViewer } from "@/lib/services/profile-photos";
import { getViewer } from "@/lib/session";

/**
 * Viser profilbildet til et medlem. Bildene ligger bak innlogging og følger
 * reglene i getProfilePhotoForViewer: bare den som alt ser navnet til
 * personen, får se bildet. `?s=liten` gir det lille bildet som står ved navn.
 */
export async function GET(request: NextRequest, context: RouteContext<"/profilbilder/[id]">) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 404 });

  const { id } = await context.params;
  const size = request.nextUrl.searchParams.get("s") === "liten" ? "thumb" : "full";
  const image = await getProfilePhotoForViewer(viewer, id, size);
  if (!image) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.length),
      // Et nytt bilde får ny adresse (?v=). «private» hindrer at mellomlagre
      // utenfor nettleseren tar vare på det. Én dag, ikke lenger: bildet skal
      // slutte å vises når personen fjerner det eller forbindelsen er borte.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
