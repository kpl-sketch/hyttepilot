import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_WIDTH } from "@/lib/layout";
import { Logo } from "./logo";

/**
 * Ramme for sidene man ser uten å være logget inn. `belowHeader` er plass til
 * en linje mellom toppen og selve siden, for eksempel navigasjon som ikke
 * hører til innholdet.
 */
export function PublicShell({
  children,
  belowHeader,
}: {
  children: ReactNode;
  belowHeader?: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className={`${PAGE_WIDTH} flex items-center justify-between py-4`}>
          <Logo href="/" />
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
