import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, PageTitle } from "@/components/ui";
import {
  CABIN_SORTS,
  type CabinSort,
  type CabinStat,
  getCabinStats,
  parseCabinSort,
} from "@/lib/services/cabin-stats";
import { requireViewer } from "@/lib/session";
import { AdminTabs } from "../tabs";

export const metadata: Metadata = { title: "Hytter" };

/** Hvor mange hytter som får en søyle i grafen. Tabellen viser alle. */
const TOP = 10;

/**
 * Hvilke hytter som er mest populære. Navn, sted og eier, og ellers bare
 * antall. Reglene står i src/lib/services/cabin-stats.ts.
 */
export default async function CabinStatsPage({ searchParams }: PageProps<"/admin/hytter">) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const { sorter } = await searchParams;
  const sort = parseCabinSort(sorter);
  const cabins = await getCabinStats(viewer, sort);

  return (
    <>
      <PageTitle
        title="Hytter"
        lead="Hvilke hytter som er mest populære. Trykk på en hytte for å se den slik lånerne ser den, uten adresse."
      />
      <AdminTabs active="hytter" />

      {cabins.length === 0 ? (
        <p className="text-muted">Ingen hytter er lagt inn ennå.</p>
      ) : (
        <>
          <SortPicker active={sort} />
          <TopChart cabins={cabins.slice(0, TOP)} sort={sort} />
          <CabinTable cabins={cabins} />
          <p className="mt-4 max-w-[60ch] text-sm text-muted">
            «Ser hytta» er antall personer eieren har vist hytta til. Tjenesten teller ikke hvor
            ofte hyttesiden åpnes. Forespørsler tar med alle, også de som er avslått eller
            trukket. Betalt er summen eieren har markert som betalt.
          </p>
        </>
      )}
    </>
  );
}

function SortPicker({ active }: { active: CabinSort }) {
  return (
    <nav aria-label="Sorter etter" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-muted">Mest populær etter:</span>
      {(Object.keys(CABIN_SORTS) as CabinSort[]).map((key) => (
        <Link
          key={key}
          href={key === "foresporsler" ? "/admin/hytter" : `/admin/hytter?sorter=${key}`}
          aria-current={key === active ? "page" : undefined}
          className={`rounded-full border px-3 py-1 font-semibold ${
            key === active ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-ink"
          }`}
        >
          {CABIN_SORTS[key]}
        </Link>
      ))}
    </nav>
  );
}

const sortValue: Record<CabinSort, (c: CabinStat) => number> = {
  foresporsler: (c) => c.requests,
  netter: (c) => c.nightsPaid,
  ser: (c) => c.viewers,
};

/** Liggende søyler for de mest populære hyttene, etter det valgte tallet. */
function TopChart({ cabins, sort }: { cabins: CabinStat[]; sort: CabinSort }) {
  const value = sortValue[sort];
  const max = Math.max(1, ...cabins.map(value));
  return (
    <Panel className="mb-6">
      <h2 className="font-semibold">
        {cabins.length < TOP ? "Hyttene" : `Topp ${TOP}`} etter {CABIN_SORTS[sort].toLowerCase()}
      </h2>
      <ol className="mt-4 space-y-3">
        {cabins.map((c, index) => (
          <li key={c.id}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 truncate">
                <span className="tabular-nums text-muted">{index + 1}.</span>{" "}
                <Link href={`/hytter/${c.id}`} className="font-semibold underline">
                  {c.name}
                </Link>
                <span className="text-muted"> · {c.area}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{int(value(c))}</span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-paper" aria-hidden="true">
              <div
                className="h-3 rounded-full bg-pine"
                style={{ width: `${Math.max((value(c) / max) * 100, value(c) > 0 ? 1 : 0)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function CabinTable({ cabins }: { cabins: CabinStat[] }) {
  const th = "py-2 pl-3 text-right font-semibold whitespace-nowrap";
  const td = "py-2 pl-3 text-right";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">Alle hytter med tall</caption>
        <thead className="text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-2 font-semibold">#</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Hytte</th>
            <th scope="col" className={th}>Ser hytta</th>
            <th scope="col" className={th}>Invitert</th>
            <th scope="col" className={th}>Forespørsler</th>
            <th scope="col" className={th}>Siste 30 d.</th>
            <th scope="col" className={th}>Har spurt</th>
            <th scope="col" className={th}>Sa ja</th>
            <th scope="col" className={th}>Betalte opphold</th>
            <th scope="col" className={th}>Netter</th>
            <th scope="col" className={th}>Betalt</th>
          </tr>
        </thead>
        <tbody>
          {cabins.map((c, index) => (
            <tr key={c.id} className="border-b border-line align-top">
              <td className="py-2 pr-2 text-muted">{index + 1}</td>
              <th scope="row" className="min-w-40 py-2 pr-4 font-normal">
                <Link href={`/hytter/${c.id}`} className="font-semibold underline">
                  {c.name}
                </Link>
                <span className="block text-muted">
                  {c.area} · {c.owner}
                  {!c.open && " · ingen ledige datoer"}
                </span>
              </th>
              <td className={td}>{int(c.viewers)}</td>
              <td className={td}>{int(c.invitesSent)}</td>
              <td className={td}>{int(c.requests)}</td>
              <td className={td}>{int(c.requestsLast30)}</td>
              <td className={td} title="Andel av dem som ser hytta">
                {int(c.askers)}
                {c.viewers > 0 && <span className="block text-xs text-muted">{pct(c.askers, c.viewers)}</span>}
              </td>
              <td className={td}>{int(c.approved)}</td>
              <td className={td}>{int(c.staysPaid)}</td>
              <td className={td}>{int(c.nightsPaid)}</td>
              <td className={`${td} whitespace-nowrap`}>{kr(c.valuePaid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const nb = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("nb-NO", opts);
const int = (n: number) => nb({ maximumFractionDigits: 0 }).format(n);
const kr = (n: number) => `${int(n)} kr`;
const pct = (a: number, b: number) => nb({ style: "percent", maximumFractionDigits: 0 }).format(a / b);
