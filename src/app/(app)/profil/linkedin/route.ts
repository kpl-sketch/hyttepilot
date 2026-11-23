import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { canFetchFromLinkedIn } from "@/lib/linkedin";
import { fetchLinkedInPhoto } from "@/lib/services/linkedin";
import { setProfilePhoto } from "@/lib/services/profile-photos";
import { getViewer } from "@/lib/session";
import { UserError } from "@/lib/errors";
import { LINKEDIN_STATE_COOKIE, LINKEDIN_STATE_PATH, stateCookieValue } from "../state";

/** Utfallene profilsiden kan vise, se NOTICES i page.tsx. */
type Outcome = "hentet" | "avbrutt" | "uten-bilde" | "feil";

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Hit sender LinkedIn brukeren tilbake etter godkjenningen. Bildet hentes og
 * legges på profilen til den som er logget inn, men bare hvis det var samme
 * bruker i samme nettleser som startet turen (kaken fra startLinkedInAction).
 *
 * LinkedIn er ikke en innlogging her: uten gyldig økt fra før skjer ingenting.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/logg-inn", request.url));

  const done = (outcome: Outcome) => {
    const response = NextResponse.redirect(new URL(`/profil?bilde=${outcome}`, request.url));
    // Kaken gjelder én tur. Den fjernes uansett hvordan turen endte.
    response.cookies.set(LINKEDIN_STATE_COOKIE, "", { path: LINKEDIN_STATE_PATH, maxAge: 0 });
    return response;
  };

  if (!canFetchFromLinkedIn()) return done("feil");

  const params = request.nextUrl.searchParams;
  const expected = request.cookies.get(LINKEDIN_STATE_COOKIE)?.value ?? "";
  const state = params.get("state") ?? "";
  if (!expected || !state || !same(expected, stateCookieValue(state, viewer.id))) {
    return done("feil");
  }

  // Brukeren trykket «Avbryt» hos LinkedIn, eller LinkedIn sa nei.
  const error = params.get("error");
  if (error) return done(error.startsWith("user_cancelled") ? "avbrutt" : "feil");

  const code = params.get("code") ?? "";
  if (!code) return done("feil");

  const result = await fetchLinkedInPhoto(code);
  if (!result.ok) return done(result.reason === "no-photo" ? "uten-bilde" : "feil");

  try {
    await setProfilePhoto(viewer, result.image, "linkedin");
  } catch (error) {
    if (!(error instanceof UserError)) console.error(error);
    return done("feil");
  }
  return done("hentet");
}
