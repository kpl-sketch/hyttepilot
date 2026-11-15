import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/logg-inn", "/hytteloftet", "/personvern", "/om"];

/** Sidene som forklarer tjenesten for hver sin målgruppe: /v1 til /v10, og oversikten på /v. */
const AUDIENCE_PATH = /^\/v([1-9]|10)?$/;

/**
 * Rask førstesjekk før siden bygges: uten innloggingskake sendes man til
 * innlogging. Dette er bare en snarvei. Den egentlige tilgangskontrollen
 * skjer i requireViewer og i tjenestelaget, som slår opp økten i databasen.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  // Invitasjonslenken må kunne åpnes uten innlogging. Siden viser da bare
  // hvem som inviterer, og ingenting om hytta.
  const isPublic = PUBLIC_PATHS.includes(pathname) ||
    AUDIENCE_PATH.test(pathname) ||
    pathname.startsWith("/invitasjon/");

  if (!hasSessionCookie && !isPublic) {
    return NextResponse.redirect(new URL("/logg-inn", request.url));
  }
  if (hasSessionCookie && pathname === "/") {
    return NextResponse.redirect(new URL("/krets", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
