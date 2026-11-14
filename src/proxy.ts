import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/logg-inn", "/hytteloftet", "/personvern"];

/**
 * Rask førstesjekk før siden bygges: uten innloggingskake sendes man til
 * innlogging. Dette er bare en snarvei. Den egentlige tilgangskontrollen
 * skjer i requireViewer og i tjenestelaget, som slår opp økten i databasen.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie && !PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/logg-inn", request.url));
  }
  if (hasSessionCookie && pathname === "/") {
    return NextResponse.redirect(new URL("/hytter", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
