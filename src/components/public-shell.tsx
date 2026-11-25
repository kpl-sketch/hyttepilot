import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { PAGE_WIDTH } from "@/lib/layout";
import { getViewer, type Viewer } from "@/lib/session";
import { AppNav } from "./app-nav";
import { Logo } from "./logo";

/**
 * Ramme for sidene man kan se uten å være logget inn. `belowHeader` er plass
 * til en linje mellom toppen og selve siden, for eksempel navigasjon som ikke
 * hører til innholdet.
 *
 * Med `memberNav` vises hovedmenyen i toppen for den som er logget inn. Det
 * brukes på sidene man kommer til fra lenkene nederst i tjenesten
 * (Hytteløftet, personvern, om oss, slik virker det), slik at det finnes en
 * vei tilbake. Rammen selv er fortsatt statisk: menyen leser innloggingen bak
 * Suspense og strømmes inn.
 *
 * Sett den ikke på forsiden eller på «Fant ikke siden» (src/app/not-found.tsx).
 * Den som er logget inn, sendes videre fra forsiden før den vises
 * (src/proxy.ts), og «Fant ikke siden» følger med i alle andre sider, så en
 * meny der ville gjort at ingen side lenger kunne ligge ferdig laget.
 */
export function PublicShell({
  children,
  belowHeader,
  memberNav = false,
}: {
  children: ReactNode;
  belowHeader?: ReactNode;
  memberNav?: boolean;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className={`${PAGE_WIDTH} flex flex-wrap items-center gap-x-8 gap-y-2 py-4`}>
          <Logo href="/" />
          {memberNav && (
            <Suspense fallback={null}>
              <MemberNav />
            </Suspense>
          )}
        </div>
      </header>
      {belowHeader}
      <main className={`${PAGE_WIDTH} flex-1 pb-16 pt-10`}>{children}</main>
      <footer className="border-t border-line">
        <div className={`${PAGE_WIDTH} py-6 text-sm text-muted`}>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/slik-virker-det" className="underline">
              Slik virker det
            </Link>
            <Link href="/hytteloftet" className="underline">
              Hytteløftet
            </Link>
            <Link href="/personvern" className="underline">
              Personvern
            </Link>
            <Link href="/om" className="underline">
              Om oss
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

/**
 * Hovedmenyen for den som er logget inn og har fullført velkomstsiden. Alle
 * andre får ingenting, og siden ser ut som før.
 */
async function MemberNav() {
  // Uten innloggingskake er det ingen å vise menyen for. Da skal de åpne
  // sidene ikke røre databasen: forsiden må virke også når den ikke svarer,
  // og forhåndsvisninger hos Vercel har ingen database.
  if (!getSessionCookie(await headers())) return null;
  const viewer = await viewerOrNull();
  return viewer ? <AppNav viewer={viewer} /> : null;
}

/**
 * Menyen er en hjelp, ikke innholdet på siden. Svarer ikke databasen, vises
 * siden uten meny heller enn med en feilmelding.
 */
async function viewerOrNull(): Promise<Viewer | null> {
  try {
    return await getViewer();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}
