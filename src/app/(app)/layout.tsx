import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { NavLink } from "@/components/nav-link";
import { Logo } from "@/components/logo";
import { Loading } from "@/components/ui";
import { getViewer } from "@/lib/session";
import { signOut } from "../logg-inn/actions";

/**
 * Ramme for alle sider som krever innlogging. Rammen selv er statisk.
 * Alt som leser innloggingen, ligger bak Suspense og strømmes inn.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
          <Logo href="/krets" />
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
      <footer className="mx-auto w-full max-w-4xl border-t border-line px-5 py-6 text-sm text-muted">
        <nav className="flex gap-6">
          <Link href="/hytteloftet" className="underline">
            Hytteløftet
          </Link>
          <Link href="/personvern" className="underline">
            Personvern
          </Link>
        </nav>
      </footer>
    </>
  );
}

async function Nav() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return (
    <>
      {/* På mobil står menyen på egen linje under navnet, så alle punktene får plass. */}
      <nav
        className="order-last flex basis-full flex-wrap gap-x-6 gap-y-1 sm:order-none sm:flex-1 sm:basis-auto"
        aria-label="Hovedmeny"
      >
        <NavLink href="/krets" also="/hytter">
          Hyttekrets
        </NavLink>
        <NavLink href="/foresporsler">Forespørsler</NavLink>
        <NavLink href="/mine-hytter">Dine hytter</NavLink>
        {/* Administrasjon gir ikke innsyn i andres hytter. Se /admin. */}
        {viewer.isAdmin && <NavLink href="/admin">Administrasjon</NavLink>}
      </nav>
      <form action={signOut} className="ml-auto flex items-center gap-3 text-sm text-muted">
        {/* Initialen i en rund brikke, slik mange tjenester viser hvem som er logget inn. */}
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-pine text-sm font-bold text-white"
          >
            {viewer.name.trim().charAt(0).toUpperCase()}
          </span>
          {viewer.name}
        </span>
        <button type="submit" className="cursor-pointer underline">
          Logg ut
        </button>
      </form>
    </>
  );
}
