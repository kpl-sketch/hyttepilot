import type { Metadata } from "next";
import Link from "next/link";
import { CabinThumb } from "@/components/cabin-photo";
import { ShareForm } from "@/components/share-form";
import { ButtonLink, PageTitle, Panel } from "@/components/ui";
import { type DateRange, formatDate, formatRange, todayInOslo } from "@/lib/dates";
import { firstName } from "@/lib/emails";
import { listOwnCabins, listSharedCabins } from "@/lib/services/cabins";
import { getCircle, getInvitationForViewer } from "@/lib/services/invitations";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Din hyttekrets" };

/** «12. til 20. februar 2027», og hvor mange perioder som kommer i tillegg. */
function nextFree(free: DateRange[]): string {
  const [first, ...rest] = free;
  const more =
    rest.length === 0 ? "" : rest.length === 1 ? " og én periode til" : ` og ${rest.length} perioder til`;
  return `${formatRange(first.startDate, first.endDate)}${more}`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

/**
 * Første side etter innlogging. Viser bare det som faktisk er delt: hyttene
 * andre har delt med brukeren, hyttene brukeren selv deler, og menneskene
 * det gjelder. Ingen medlemsliste og ingen hytter utenfor egne delinger.
 */
export default async function CirclePage({ searchParams }: PageProps<"/krets">) {
  const viewer = await requireViewer();
  const [{ invitasjon }, shared, own, circle] = await Promise.all([
    searchParams,
    listSharedCabins(viewer),
    listOwnCabins(viewer),
    getCircle(viewer),
  ]);
  const invited =
    typeof invitasjon === "string" ? await getInvitationForViewer(viewer, invitasjon) : null;
  const welcome = invited?.mine && invited.status === "accepted" ? invited : null;
  const ownChoices = own.map(({ id, name, area }) => ({ id, name, area }));

  return (
    <>
      <PageTitle
        title="Din hyttekrets"
        lead={
          <>
            Hyttene som er delt med deg, og hyttene du selv deler. Du ser bare det noen har valgt
            å dele med deg.
            {circle.invitedBy && ` Du ble invitert av ${circle.invitedBy}.`}
          </>
        }
      />

      {welcome && (
        <section
          aria-labelledby="velkommen"
          className="mb-10 rounded-lg border-2 border-pine bg-surface p-5 sm:p-6"
        >
          {welcome.cabin ? (
            <>
              <h2 id="velkommen" className="text-2xl font-bold">
                {welcome.inviterName} har delt {welcome.cabin.name} med deg
              </h2>
              {welcome.message && (
                <blockquote className="mt-3 max-w-[60ch] border-l-4 border-window pl-4 whitespace-pre-line">
                  {welcome.message}
                  <footer className="mt-1 text-sm text-muted">
                    Hilsen {firstName(welcome.inviterName)}
                  </footer>
                </blockquote>
              )}
              <p className="mt-3 max-w-[60ch]">
                Du ser hytta, bildene, prisen og når den er ledig. Finner du datoer som passer,
                sender du en forespørsel. {firstName(welcome.inviterName)} svarer ja eller nei på
                hver forespørsel.
              </p>
              <ButtonLink href={`/hytter/${welcome.cabin.id}`} className="mt-4">
                Se {welcome.cabin.name} og ledige datoer
              </ButtonLink>
            </>
          ) : (
            <>
              <h2 id="velkommen" className="text-2xl font-bold">
                Velkommen. {welcome.inviterName} har invitert deg.
              </h2>
              {welcome.message && (
                <blockquote className="mt-3 max-w-[60ch] border-l-4 border-window pl-4 whitespace-pre-line">
                  {welcome.message}
                </blockquote>
              )}
              <p className="mt-3 max-w-[60ch]">
                Invitasjonen gir deg adgang, men ingen hytter ennå. Du kan legge inn din egen
                hytte og velge hvem du vil dele den med. Andres hytter ser du når eieren deler
                dem med deg.
              </p>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="delt-med-deg" className="mb-12">
        <h2 id="delt-med-deg" className="text-2xl font-bold">
          Hytter delt med deg
        </h2>
        {shared.length === 0 ? (
          <Panel className="mt-4">
            <p className="text-lg">Ingen har delt en hytte med deg ennå.</p>
            <p className="mt-2 max-w-[60ch] text-muted">
              En hytte dukker opp her når eieren velger å dele den med deg. Kjenner du en
              hytteeier som er med, kan du be om en invitasjon til {viewer.email}.
            </p>
          </Panel>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {shared.map(({ cabin, ownerName, free }) => (
              <li key={cabin.id}>
                <Link
                  href={`/hytter/${cabin.id}`}
                  className="group flex items-start gap-4 py-4 sm:gap-6"
                >
                  <CabinThumb photoId={cabin.coverPhotoId} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-2xl font-bold group-hover:underline">
                      {cabin.name}
                    </span>
                    <span className="block text-muted">
                      {cabin.area}. Delt med deg av {ownerName}.
                    </span>
                    {free.length > 0 ? (
                      <span className="mt-1 block">
                        <span className="font-semibold">Ledig for forespørsel:</span>{" "}
                        {nextFree(free)}
                      </span>
                    ) : (
                      <span className="mt-1 block text-muted">
                        Ingen ledige datoer akkurat nå.
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 max-w-[60ch] text-sm text-muted">
          Delt med deg betyr at du kan se hytta og spørre. Ledig betyr at eieren har åpnet
          datoene. Ingenting er avtalt før eieren har sagt ja.
        </p>
      </section>

      <section aria-labelledby="du-deler" className="mb-12">
        <h2 id="du-deler" className="text-2xl font-bold">
          Hytter du deler
        </h2>
        {own.length === 0 ? (
          <Panel className="mt-4">
            <h3 className="text-xl font-bold">
              Har du en hytte du vil dele med noen du kjenner?
            </h3>
            <p className="mt-2 max-w-[60ch]">
              Du velger hvem som får se hytta, når den er ledig, og hvilke opphold du sier ja
              til. Hytta er privat til du deler den.
            </p>
            <p className="mt-2 max-w-[60ch] text-muted">
              Det er frivillig. Du kan låne uten å eie en hytte, og du kan gjøre dette når som
              helst.
            </p>
            <ButtonLink href="/mine-hytter/ny" variant="secondary" className="mt-4">
              Legg inn hytta di
            </ButtonLink>
          </Panel>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {own.map((cabin) => (
                <li key={cabin.id}>
                  <Link
                    href={`/mine-hytter/${cabin.id}`}
                    className="group flex items-start gap-4 py-4 sm:gap-6"
                  >
                    <CabinThumb photoId={cabin.coverPhotoId} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xl font-bold group-hover:underline">
                        {cabin.name}
                      </span>
                      <span className="block text-muted">{cabin.area}</span>
                      <span className="mt-1 block">
                        <SharingStatus
                          sharedWith={cabin.sharedWith}
                          pending={cabin.pendingInvitations}
                          free={cabin.free}
                        />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <ButtonLink href="/mine-hytter/ny" variant="secondary" className="mt-4">
              Legg inn en hytte til
            </ButtonLink>
          </>
        )}
      </section>

      {(circle.people.length > 0 || circle.waiting.length > 0) && (
        <section aria-labelledby="folk" className="mb-12">
          <h2 id="folk" className="text-2xl font-bold">
            Folk i kretsen din
          </h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            De du har en deling med, den ene eller den andre veien. Ingen ser en liste over
            alle som er med.
          </p>
          <ul className="mt-4 space-y-4">
            {circle.people.map((person) => {
              const first = firstName(person.name);
              // Forslaget om å dele tilbake vises når personen deler med brukeren og
              // brukeren ikke deler noe tilbake. Skjemaet blir stående etterpå med en
              // tom liste, slik at bekreftelsen ikke forsvinner.
              const canShareBack = person.sharesWithMe.length > 0 && own.length > 0;
              return (
                <li key={person.id} className="rounded-lg border border-line bg-surface p-5">
                  <h3 className="text-xl font-bold">{person.name}</h3>
                  {person.sharesWithMe.length > 0 && (
                    <p className="mt-1">
                      {first} deler {list(person.sharesWithMe.map((c) => c.name))} med deg.
                    </p>
                  )}
                  {person.iShareWith.length > 0 ? (
                    <p className="mt-1">
                      Du deler {list(person.iShareWith.map((c) => c.name))} med {first}.
                    </p>
                  ) : (
                    <p className="mt-1 text-muted">Du deler ingen hytte med {first}.</p>
                  )}
                  {canShareBack && (
                    <ShareForm
                      cabins={person.iShareWith.length === 0 ? ownChoices : []}
                      person={{ id: person.id, name: person.name }}
                      disclosure={`Vil du dele hytta di med ${first}?`}
                    />
                  )}
                </li>
              );
            })}
            {circle.waiting.map((inv) => (
              <li key={inv.id} className="rounded-lg border border-dashed border-line p-5">
                <h3 className="font-bold break-words">{inv.email}</h3>
                <p className="mt-1 text-muted">
                  Invitert til {inv.cabinName}, har ikke logget inn ennå.{" "}
                  {inv.expired
                    ? "Invitasjonen er utløpt."
                    : `Invitasjonen gjelder til ${formatDate(todayInOslo(inv.expiresAt))}.`}{" "}
                  <Link href={`/mine-hytter/${inv.cabinId}`} className="underline">
                    Styr delingen
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {own.length > 0 && (
        <section aria-labelledby="inviter" className="mb-12">
          <Panel>
            <h2 id="inviter" className="text-2xl font-bold">
              Hvem ville du selv lånt bort hytta til?
            </h2>
            <p className="mt-1 mb-5 max-w-[60ch] text-muted">
              Inviter én person du stoler på. Vedkommende får se hytta du velger her, og
              ingenting annet. Du ser nøyaktig hva som sendes før du bekrefter.
            </p>
            <ShareForm cabins={ownChoices} />
          </Panel>
        </section>
      )}
    </>
  );
}

/** Sier rett ut om hytta er delt med noen, og om det finnes datoer å spørre om. */
function SharingStatus({
  sharedWith,
  pending,
  free,
}: {
  sharedWith: number;
  pending: number;
  free: DateRange[];
}) {
  const people =
    sharedWith === 0
      ? pending > 0
        ? `Ingen ser hytta ennå. ${pending === 1 ? "Én invitasjon" : `${pending} invitasjoner`} venter.`
        : "Privat. Bare du ser den."
      : `Delt med ${sharedWith === 1 ? "én person" : `${sharedWith} personer`}.`;
  const dates =
    free.length > 0 ? `Ledig for forespørsel: ${nextFree(free)}.` : "Ingen ledige datoer.";
  return (
    <>
      <span className="font-semibold">{people}</span> {dates}
    </>
  );
}
