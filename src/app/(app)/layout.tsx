import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { NavLink } from "@/components/nav-link";
import { Loading } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { getViewer } from "@/lib/session";
import { signOut } from "../logg-inn/actions";

/**
 * Ramme for alle sider som krever innlogging. Rammen selv er statisk.
 * Alt som leser innloggingen, ligger bak Suspense og strømmes inn.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
          <Link href="/hytter" className="text-xl font-bold text-pine">
            {APP_NAME}
          </Link>
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
      <nav className="flex flex-1 flex-wrap gap-x-6 gap-y-1" aria-label="Hovedmeny">
        <NavLink href="/hytter">Hytter</NavLink>
        <NavLink href="/foresporsler">Forespørsler</NavLink>
        {viewer.isOwner && <NavLink href="/mine-hytter">Mine hytter</NavLink>}
        {viewer.isAdmin && <NavLink href="/admin">Inviter hytteeiere</NavLink>}
      </nav>
      <form action={signOut} className="flex items-center gap-3 text-sm text-muted">
        <span>{viewer.name}</span>
        <button type="submit" className="cursor-pointer underline">
          Logg ut
        </button>
      </form>
    </>
  );
}
