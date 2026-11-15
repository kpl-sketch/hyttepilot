"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Linje nederst på /v1 til /v10 for å bla mellom versjonene: forrige, neste,
 * et nummer per versjon og piltastene på tastaturet. Ligger utenfor <main>,
 * så «Bare for inviterte» fortsatt står først i selve siden.
 */
export function AudienceNav({
  current,
  versions,
}: {
  current: number;
  versions: { number: number; name: string }[];
}) {
  const router = useRouter();
  const count = versions.length;
  const prev = current === 1 ? count : current - 1;
  const next = current === count ? 1 : current + 1;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") router.push(`/v${prev}`);
      if (event.key === "ArrowRight") router.push(`/v${next}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next]);

  const current_ = versions.find((v) => v.number === current);
  const arrow =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-lg font-bold hover:bg-paper";

  return (
    <nav
      aria-label="Bla mellom versjonene"
      className="sticky bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-3">
        <Link href={`/v${prev}`} className={arrow} aria-label={`Forrige versjon: ${prev}`}>
          ←
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">
            <Link href="/v" className="underline">
              Versjon {current} av {count}
            </Link>
            <span className="text-muted">: {current_?.name}</span>
          </p>
          <ol role="list" className="mt-1.5 hidden justify-center gap-1 sm:flex">
            {versions.map((v) => (
              <li key={v.number}>
                <Link
                  href={`/v${v.number}`}
                  title={v.name}
                  aria-current={v.number === current ? "page" : undefined}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    v.number === current ? "bg-pine text-white" : "bg-paper text-ink hover:bg-fjord-soft"
                  }`}
                >
                  {v.number}
                </Link>
              </li>
            ))}
          </ol>
        </div>
        <Link href={`/v${next}`} className={arrow} aria-label={`Neste versjon: ${next}`}>
          →
        </Link>
      </div>
    </nav>
  );
}
