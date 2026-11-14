import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";

/** Ramme for sidene man ser uten å være logget inn. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="text-xl font-bold text-pine">
          {APP_NAME}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-6">{children}</main>
      <footer className="mx-auto w-full max-w-3xl border-t border-line px-5 py-6 text-sm text-muted">
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
