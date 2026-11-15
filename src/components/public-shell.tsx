import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";

/** Ramme for sidene man ser uten å være logget inn. */
export function PublicShell({ children, after }: { children: ReactNode; after?: ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Logo href="/" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-10">{children}</main>
      <footer className="mx-auto w-full max-w-3xl border-t border-line px-5 py-6 text-sm text-muted">
        <nav className="flex gap-6">
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
      </footer>
      {after}
    </>
  );
}
