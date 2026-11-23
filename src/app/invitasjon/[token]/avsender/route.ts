import { getInviterPhotoByToken } from "@/lib/services/profile-photos";

/**
 * Bildet av den som sendte invitasjonen, for den som har åpnet lenken uten å
 * være logget inn ennå. Følger reglene i getInviterPhotoByToken: bare bildet
 * av den som inviterer, og bare så lenge invitasjonen gjelder.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/invitasjon/[token]/avsender">,
) {
  const { token } = await context.params;
  const image = await getInviterPhotoByToken(token, "thumb");
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
