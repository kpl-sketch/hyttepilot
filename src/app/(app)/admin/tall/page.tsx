import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageTitle, Panel } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { formatDate } from "@/lib/dates";
import {
  getPilotMetrics,
  getWeeklyMetrics,
  MIN_MEMBERS_FOR_CONCLUSION,
  type PilotMetrics,
} from "@/lib/services/metrics";
import { requireViewer } from "@/lib/session";
import { AdminTabs } from "../tabs";

export const metadata: Metadata = { title: "Tall" };

/**
 * Nøkkeltall for administratorene. Bare antall og summer, aldri navn eller
 * hytter. Reglene og definisjonene står i src/lib/services/metrics.ts.
 */
export default async function MetricsPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const [m, weeks] = await Promise.all([getPilotMetrics(viewer), getWeeklyMetrics(viewer)]);

  return (
    <>
      <PageTitle
        title="Tall"
        lead={`Slik går piloten. Siden viser bare antall, aldri hvem som har gjort hva i ${APP_NAME}.`}
      />
      <AdminTabs active="tall" />

      <Section title="Medlemmer">
        <Tiles>
          <Tile label="Medlemmer" value={int(m.members)} note={m.admins === 1 ? "Pluss 1 administrator." : `Pluss ${int(m.admins)} administratorer.`} />
          <Tile label="Nye siste 7 dager" value={int(m.membersLast7)} />
          <Tile label="Nye siste 30 dager" value={int(m.membersLast30)} />
          <Tile
            label="Har lagt inn hytte"
            value={pct(m.membersWithCabin, m.members)}
            note={`${int(m.membersWithCabin)} av ${int(m.members)}`}
          />
        </Tiles>
      </Section>

      <KFactor m={m} />

      <Section title="Fra invitert til aktiv">
        <p className="mb-4 max-w-[60ch] text-muted">
          Hvor langt medlemmene har kommet. Hvert trinn er en andel av alle medlemmer.
        </p>
        <Funnel
          base={m.members}
          steps={[
            { label: "Er med", value: m.members },
            { label: "Har lagt inn hytte", value: m.membersWithCabin },
            { label: "Har invitert minst én", value: m.inviters },
            { label: "Har hentet inn minst én ny", value: m.bringers },
          ]}
        />
      </Section>

      <Section title="Invitasjoner">
        <Tiles>
          <Tile label="Sendt totalt" value={int(m.invitesTotal)} note="Fra både dere og medlemmene." />
          <Tile
            label="Tatt i bruk"
            value={pct(m.invitesAccepted, m.invitesTotal)}
            note={`${int(m.invitesAccepted)} av ${int(m.invitesTotal)}`}
          />
          <Tile
            label="Venter"
            value={int(m.invitesPending)}
            note={`${int(m.invitesExpired)} utløpt, ${int(m.invitesRevoked)} trukket tilbake`}
          />
          <Tile label="Tid til tatt i bruk" value={hours(m.medianHoursToAccept)} note="Median" />
        </Tiles>
      </Section>

      <Section title="Hytter">
        <Tiles>
          <Tile label="Hytter" value={int(m.cabins)} />
          <Tile
            label="Vist til minst én"
            value={int(m.cabinsShared)}
            note={
              m.avgViewersPerSharedCabin === null
                ? undefined
                : `Snitt ${dec(m.avgViewersPerSharedCabin)} personer per hytte`
            }
          />
          <Tile label="Har ledige datoer framover" value={int(m.cabinsOpen)} />
          <Tile
            label="Klare til utlån"
            value={int(m.cabinsLive)}
            note="Vist til noen og har ledige datoer"
          />
        </Tiles>
      </Section>

      <Section title="Lån">
        <Tiles>
          <Tile
            label="Forespørsler"
            value={int(m.requests)}
            note={`${int(m.requestsPending)} venter på svar`}
          />
          <Tile
            label="Eieren sa ja"
            value={pct(m.requestsApproved, m.requestsApproved + m.requestsDeclined)}
            note={`${int(m.requestsApproved)} ja, ${int(m.requestsDeclined)} nei`}
          />
          <Tile label="Svartid fra eier" value={hours(m.medianHoursToDecide)} note="Median" />
          <Tile
            label="Betalte opphold"
            value={int(m.staysPaid)}
            note={`${int(m.staysCompleted)} gjennomført`}
          />
          <Tile label="Netter lånt" value={int(m.nightsPaid)} note="Betalte opphold" />
          <Tile label="Betalt til eiere" value={kr(m.valuePaid)} note="Via Vipps, utenom tjenesten" />
        </Tiles>
      </Section>

      <Section title="Låner du bort, kan du låne">
        <p className="mb-4 max-w-[60ch] text-muted">
          Hypotesen er at det å låne bort hytta åpner nye turer for deg selv. Disse tallene viser
          om det skjer.
        </p>
        <Tiles>
          <Tile
            label="Har både lånt bort og lånt"
            value={int(m.reciprocal)}
            note="Betalte opphold begge veier"
          />
          <Tile
            label="Lånere som viser egen hytte"
            value={int(m.borrowersWhoShare)}
            note="Har fått ja som låner, og viser selv en hytte til noen"
          />
        </Tiles>
      </Section>

      <Section title={`Siste ${weeks.length} uker`}>
        <Weekly weeks={weeks} />
      </Section>

      <p className="mt-10 max-w-[60ch] text-sm text-muted">
        Administratorene telles ikke som medlemmer, og invitasjoner fra dem teller ikke i
        K-faktoren. Hytter og lån telles for alle, også administratorene. Et medlem tilskrives
        den første invitasjonen vedkommende tok i bruk.
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function KFactor({ m }: { m: PilotMetrics }) {
  const few = m.members < MIN_MEMBERS_FOR_CONCLUSION;
  return (
    <Section title="K-faktor">
      <Panel>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
          <div>
            <p className="text-sm font-semibold text-muted">K-faktor</p>
            <p className="text-6xl font-bold tabular-nums tracking-tight">{dec(m.k)}</p>
          </div>
          <p className="pb-2 text-lg tabular-nums">
            <span className="font-semibold">{dec(m.i)}</span>{" "}
            <span className="text-muted">invitasjoner per medlem</span>
            <span className="mx-2 text-muted" aria-hidden="true">
              ×
            </span>
            <span className="sr-only">ganger</span>
            <span className="font-semibold">{pct(m.broughtIn, m.invitesByMembers)}</span>{" "}
            <span className="text-muted">blir nye medlemmer</span>
          </p>
        </div>

        <p className="mt-5 max-w-[60ch]">{kVerdict(m.k)}</p>
        {few && (
          <p className="mt-3 max-w-[60ch] rounded-xl bg-window/40 p-3 text-sm">
            Bare {int(m.members)} medlemmer. Under {MIN_MEMBERS_FOR_CONCLUSION} er tallet for
            usikkert til å konkludere. Les det som en retning.
          </p>
        )}

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <Fact
            term="Hentet inn av medlemmer"
            value={int(m.broughtIn)}
            note={`Av ${int(m.invitesByMembers)} invitasjoner fra medlemmer. ${int(m.invitesByMembersPending)} venter fortsatt, så tallet kan stige.`}
          />
          <Fact
            term="K innen 14 dager"
            value={m.k14 === null ? "Ikke ennå" : dec(m.k14)}
            note={
              m.k14 === null
                ? "Ingen har vært med i 14 dager ennå."
                : `Nye hentet inn de første 14 dagene, for ${int(m.k14Base)} medlemmer som har vært med så lenge.`
            }
          />
          <Fact
            term="Generasjoner"
            value={m.maxGen === 0 ? "Ingen ennå" : int(m.maxGen)}
            note={`${int(m.gen1)} invitert av dere, ${int(m.gen2)} av dem igjen, ${int(m.gen3plus)} lenger ut.`}
          />
        </dl>
      </Panel>
      <p className="mt-3 max-w-[60ch] text-sm text-muted">
        K-faktoren sier hvor mange nye hvert medlem henter inn i snitt. Over 1 betyr at piloten
        kan vokse av seg selv. Gjentatt spredning ser dere når generasjon 2 og 3 også henter inn
        nye.
      </p>
    </Section>
  );
}

function kVerdict(k: number): string {
  if (k >= 1)
    return "Hvert medlem henter i snitt inn minst én ny. Se om det holder seg i flere generasjoner før dere kaller det spredning.";
  if (k >= 0.5)
    return "Medlemmene henter inn nye, men ikke nok til at piloten vokser av seg selv. Invitasjoner fra dere trengs fortsatt.";
  if (k > 0) return "Noen medlemmer henter inn nye. Det meste av veksten kommer fortsatt fra dere.";
  return "Ingen medlemmer har hentet inn nye ennå. All vekst kommer fra dere.";
}

/* -------------------------------------------------------------------------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Tiles({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</dl>;
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</dd>
      {note && <dd className="mt-1 text-sm text-muted">{note}</dd>}
    </div>
  );
}

function Fact({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted">{term}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
      <dd className="mt-1 text-sm text-muted">{note}</dd>
    </div>
  );
}

function Funnel({ base, steps }: { base: number; steps: { label: string; value: number }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step) => {
        const share = base > 0 ? step.value / base : 0;
        return (
          <li key={step.label} title={`${step.label}: ${int(step.value)} (${pct(step.value, base)})`}>
            <div className="flex justify-between gap-4 text-sm">
              <span className="font-semibold">{step.label}</span>
              <span className="tabular-nums text-muted">
                {int(step.value)} · {pct(step.value, base)}
              </span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-paper" aria-hidden="true">
              <div
                className="h-3 rounded-full bg-pine"
                style={{ width: `${Math.max(share * 100, step.value > 0 ? 1 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ukeoversikt: én søylegraf for nye medlemmer, og en tabell med alle tallene. */
function Weekly({ weeks }: { weeks: { week: string; newMembers: number; invitesSent: number; requests: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.newMembers));
  return (
    <>
      <Panel>
        <h3 className="font-semibold">Nye medlemmer per uke</h3>
        <div className="mt-4 flex h-40 items-end gap-2 border-b border-line" aria-hidden="true">
          {weeks.map((w) => (
            <div
              key={w.week}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              title={`Uka fra ${formatDate(w.week)}: ${int(w.newMembers)} nye`}
            >
              <span className="mb-1 text-xs tabular-nums text-muted">
                {w.newMembers > 0 ? int(w.newMembers) : ""}
              </span>
              <div
                className="w-full max-w-10 rounded-t bg-pine group-hover:bg-barn"
                style={{ height: `${(w.newMembers / max) * 85}%`, minHeight: w.newMembers > 0 ? 4 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2 text-xs text-muted" aria-hidden="true">
          {weeks.map((w) => (
            <span key={w.week} className="flex-1 text-center">
              {w.week.slice(8, 10)}.{w.week.slice(5, 7)}
            </span>
          ))}
        </div>
      </Panel>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="sr-only">Tall per uke</caption>
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 font-semibold">Uka fra</th>
              <th scope="col" className="py-2 text-right font-semibold">Nye medlemmer</th>
              <th scope="col" className="py-2 text-right font-semibold">Invitasjoner</th>
              <th scope="col" className="py-2 text-right font-semibold">Forespørsler</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week} className="border-b border-line">
                <th scope="row" className="py-2 font-normal">{formatDate(w.week)}</th>
                <td className="py-2 text-right">{int(w.newMembers)}</td>
                <td className="py-2 text-right">{int(w.invitesSent)}</td>
                <td className="py-2 text-right">{int(w.requests)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const nb = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("nb-NO", opts);
const int = (n: number) => nb({ maximumFractionDigits: 0 }).format(n);
const dec = (n: number) => nb({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const kr = (n: number) => `${int(n)} kr`;
function pct(a: number, b: number): string {
  if (b <= 0) return "Ingen ennå";
  return nb({ style: "percent", maximumFractionDigits: 0 }).format(a / b);
}
function hours(h: number | null): string {
  if (h === null) return "Ingen ennå";
  if (h < 1) return "Under 1 time";
  if (h < 48) return `${int(Math.round(h))} timer`;
  return `${int(Math.round(h / 24))} dager`;
}
