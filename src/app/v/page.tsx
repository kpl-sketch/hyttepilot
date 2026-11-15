import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { PageTitle } from "@/components/ui";
import { AUDIENCES } from "@/lib/audiences";

export const metadata: Metadata = { title: "Alle versjoner" };

/** Oversikt over de ti målgruppesidene, så de er lette å finne og sammenligne. */
export default function VersionsPage() {
  return (
    <PublicShell>
      <PageTitle
        title="Ti måter å forklare tjenesten på"
        lead="Hver versjon snakker til én målgruppe. Bruk pilene nederst på hver side, eller piltastene, for å bla videre."
      />
      <ol role="list" className="space-y-3">
        {Object.entries(AUDIENCES).map(([key, { audience }]) => (
          <li key={key}>
            <Link
              href={`/${key}`}
              className="flex gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card hover:bg-paper"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine font-bold text-white">
                {key.slice(1)}
              </span>
              <span>
                <span className="block text-sm font-semibold text-barn">{audience.forWhom}</span>
                <span className="block text-lg font-bold leading-snug">{audience.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </PublicShell>
  );
}
