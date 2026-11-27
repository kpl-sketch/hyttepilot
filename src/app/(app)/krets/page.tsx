import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { CabinThumb } from "@/components/cabin-photo";
import { ShareForm } from "@/components/share-form";
import { ButtonLink, buttonClass, PageTitle, Panel } from "@/components/ui";
import { avatarSrc, inviterAvatarSrc } from "@/lib/avatar";
import { type DateRange, formatDate, formatRange, todayInOslo } from "@/lib/dates";
import { firstName } from "@/lib/emails";
import { canFetchFromLinkedIn } from "@/lib/linkedin";
import { listOwnCabins, listSharedCabins } from "@/lib/services/cabins";
import { getCircle, getInvitationForViewer } from "@/lib/services/invitations";
import { CARD_GRID } from "@/lib/layout";
import { requireViewer } from "@/lib/session";
import { startLinkedInAction } from "../profil/actions";

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
  // Bildet av den som inviterte, hentes med nøkkelen i lenken, se inviterAvatarSrc.
  const welcomeAvatar =
    welcome && typeof invitasjon === "string"
      ? inviterAvatarSrc(invitasjon, welcome.inviterPhoto)
      : null;
  const ownChoices = own.map(({ id, name, area }) => ({ id, name, area }));

  return (
    <>
      <PageTitle
        title="Din hyttekrets"
        lead={
          <>
            Hyttene du kan låne, og hyttene du låner bort. Du ser bare hytter eieren selv har
            valgt å vise deg.
            {circle.invitedBy && ` Du ble invitert av ${circle.invitedBy}.`}
          </>
        }
      />

      {welcome && (
        <section
          aria-labelledby="velkommen"
          className="mb-10 rounded-2xl bg-fjord-soft p-5 sm:p-7"
        >
          {welcome.cabin ? (
            <>
              <h2 id="velkommen" className="flex items-center gap-3 text-2xl font-bold">
                <Avatar name={welcome.inviterName} src={welcomeAvatar} size="lg" />
                <span>
                  {welcome.inviterName} viser deg {welcome.cabin.name}
                </span>
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
              <h2 id="velkommen" className="flex items-center gap-3 text-2xl font-bold">
                <Avatar name={welcome.inviterName} src={welcomeAvatar} size="lg" />
                <span>Velkommen. {welcome.inviterName} har invitert deg.</span>
              </h2>
              {welcome.message && (
                <blockquote className="mt-3 max-w-[60ch] border-l-4 border-window pl-4 whitespace-pre-line">
                  {welcome.message}
                </blockquote>
              )}
              <p className="mt-3 max-w-[60ch]">
                Invitasjonen gir deg adgang, men ingen hytter ennå. Du kan legge inn din egen
                hytte og velge hvem som får se den. Andres hytter ser du når eieren velger å vise
                deg dem.
              </p>
            </>
          )}
        </section>
      )}

      {!viewer.photo && (
        <aside
          aria-labelledby="vis-hvem-du-er"
          className="mb-10 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5"
        >
          <Avatar name={viewer.name} src={null} />
          <p className="min-w-[14rem] flex-1">
            <strong id="vis-hvem-du-er">Vis hvem du er.</strong> Med et bilde kjenner de deg
            igjen når du spør om å låne, og når du låner bort.
          </p>
          {canFetchFromLinkedIn() ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <form action={startLinkedInAction}>
                <button type="submit" className={buttonClass("secondary")}>
                  Hent bildet fra LinkedIn
                </button>
              </form>
              <Link href="/profil" className="underline">
                eller last opp et bilde
              </Link>
            </span>
          ) : (
            <ButtonLink href="/profil" variant="secondary">
              Legg til et bilde
            </ButtonLink>
          )}
        </aside>
      )}

      <section aria-labelledby="delt-med-deg" className="mb-12">
        <h2 id="delt-med-deg" className="text-3xl">
          Hytter du kan låne
        </h2>
        {shared.length === 0 ? (
          <Panel className="mt-4 max-w-3xl">
            <p className="text-lg">Ingen har vist deg en hytte ennå.</p>
            <p className="mt-2 max-w-[60ch] text-muted">
              En hytte dukker opp her når eieren velger å vise deg den. Kjenner du en
              hytteeier som er med, kan du be om en invitasjon til {viewer.email}.
            </p>
          </Panel>
        ) : shared.length === 1 ? (
          // Én hytte får hele bredden: stort bilde, og det viktigste ved siden av.
          <ul className="mt-5">
            {shared.map(({ cabin, ownerName, ownerPhoto, free }) => (
              <li key={cabin.id}>
                <Link
                  href={`/hytter/${cabin.id}`}
                  className="group grid overflow-hidden rounded-3xl border border-line bg-surface shadow-card lg:grid-cols-[3fr_2fr]"
                >
                  <CabinThumb photoId={cabin.coverPhotoId} feature />
                  <span className="flex flex-col items-start gap-4 p-6 sm:p-8">
                    <span className="block font-display text-4xl leading-[1.1] font-medium group-hover:underline">
                      {cabin.name}
                    </span>
                    <span className="flex items-center gap-3 text-muted">
                      <Avatar name={ownerName} src={avatarSrc(cabin.ownerId, ownerPhoto)} />
                      <span>
                        {cabin.area}. Hytta til {ownerName}.
                      </span>
                    </span>
                    <Free free={free} empty="Ingen ledige datoer akkurat nå." />
                    {/* Hele kortet er lenken. Dette ser ut som en knapp, men er ikke en egen lenke. */}
                    <span className={buttonClass("primary", "mt-auto")}>
                      Se hytta og ledige datoer
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={`mt-5 ${CARD_GRID}`}>
            {shared.map(({ cabin, ownerName, ownerPhoto, free }) => (
              <li key={cabin.id}>
                <Link
                  href={`/hytter/${cabin.id}`}
                  className="group block rounded-2xl"
                >
                  <CabinThumb photoId={cabin.coverPhotoId} card />
                  <span className="mt-4 block">
                    <span className="block font-display text-2xl leading-tight font-medium group-hover:underline">
                      {cabin.name}
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-muted">
                      <Avatar
                        name={ownerName}
                        src={avatarSrc(cabin.ownerId, ownerPhoto)}
                        size="sm"
                      />
                      <span>
                        {cabin.area}. Hytta til {ownerName}.
                      </span>
                    </span>
                    <span className="mt-3 block">
                      <Free free={free} empty="Ingen ledige datoer akkurat nå." />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 max-w-[60ch] text-sm text-muted">
          Her står hytter du kan se og spørre om å låne. Ledig betyr at eieren har åpnet
          datoene. Ingenting er avtalt før eieren har sagt ja.
        </p>
      </section>

      <section aria-labelledby="du-deler" className="mb-12">
        <h2 id="du-deler" className="text-3xl">
          Hytter du låner bort
        </h2>
        {own.length === 0 ? (
          <Panel className="mt-4 max-w-3xl">
            <h3 className="text-xl font-bold">
              Har du en hytte du vil låne bort til noen du kjenner?
            </h3>
            <p className="mt-2 max-w-[60ch]">
              Du velger hvem som får se hytta, når den er ledig, og hvilke opphold du sier ja
              til. Bare du ser hytta til du velger noen.
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
            <ul className={`mt-5 ${CARD_GRID}`}>
              {own.map((cabin) => (
                <li key={cabin.id}>
                  <Link
                    href={`/mine-hytter/${cabin.id}`}
                    className="group block rounded-2xl"
                  >
                    <CabinThumb photoId={cabin.coverPhotoId} card />
                    <span className="mt-4 block">
                      <span className="block font-display text-2xl leading-tight font-medium group-hover:underline">
                        {cabin.name}
                      </span>
                      <span className="mt-1 block text-muted">{cabin.area}</span>
                      <SharingStatus
                        sharedWith={cabin.sharedWith}
                        pending={cabin.pendingInvitations}
                        free={cabin.free}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <ButtonLink href="/mine-hytter/ny" variant="secondary" className="mt-8">
              Legg inn en hytte til
            </ButtonLink>
          </>
        )}
      </section>

      {(circle.people.length > 0 || circle.waiting.length > 0) && (
        <section aria-labelledby="folk" className="mb-12">
          <h2 id="folk" className="text-3xl">
            Folk i kretsen din
          </h2>
          <p className="mt-2 max-w-[60ch] text-muted">
            De som viser deg en hytte, og de du viser din. Ingen ser en liste over
            alle som er med.
          </p>
          {circle.people.length > 0 && (
            // Rader med en tynn strek mellom, ikke kort: dette er folk, ikke oppføringer.
            <ul className="mt-5 grid items-start gap-x-12 border-t border-line lg:grid-cols-2">
              {circle.people.map((person) => {
                const first = firstName(person.name);
                // Forslaget om å dele tilbake vises når personen deler med brukeren og
                // brukeren ikke deler noe tilbake. Skjemaet blir stående etterpå med en
                // tom liste, slik at bekreftelsen ikke forsvinner.
                const canShareBack = person.sharesWithMe.length > 0 && own.length > 0;
                return (
                  <li key={person.id} className="flex gap-4 border-b border-line py-4">
                    <Avatar name={person.name} src={avatarSrc(person.id, person.photo)} />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg leading-tight font-semibold">{person.name}</h3>
                      {person.sharesWithMe.length > 0 && (
                        <p className="mt-1">
                          {first} viser deg {list(person.sharesWithMe.map((c) => c.name))}.
                        </p>
                      )}
                      {person.iShareWith.length > 0 ? (
                        <p className="mt-1 text-muted">
                          Du viser {first} {list(person.iShareWith.map((c) => c.name))}.
                        </p>
                      ) : (
                        <p className="mt-1 text-muted">Du viser ikke {first} noen hytte.</p>
                      )}
                      {canShareBack && (
                        <ShareForm
                          cabins={person.iShareWith.length === 0 ? ownChoices : []}
                          person={{ id: person.id, name: person.name }}
                          disclosure={`Vil du vise ${first} hytta di?`}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {circle.waiting.length > 0 && (
            // De som ikke har logget inn ennå, ligger bak én linje, så de ikke tar
            // plassen fra dem som er med. Er det ingen andre å vise, står listen åpen.
            <details className="mt-5 max-w-3xl" open={circle.people.length === 0}>
              <summary className="cursor-pointer font-semibold text-pine underline">
                {circle.waiting.length === 1
                  ? "Én invitasjon venter"
                  : `${circle.waiting.length} invitasjoner venter`}
              </summary>
              <ul className="mt-3 border-t border-line">
                {circle.waiting.map((inv) => (
                  <li key={inv.id} className="border-b border-line py-3">
                    <h3 className="font-semibold break-words">{inv.email}</h3>
                    <p className="mt-0.5 text-muted">
                      Invitert til {inv.cabinName}, har ikke logget inn ennå.{" "}
                      {inv.expired
                        ? "Invitasjonen er utløpt."
                        : `Invitasjonen gjelder til ${formatDate(todayInOslo(inv.expiresAt))}.`}{" "}
                      <Link href={`/mine-hytter/${inv.cabinId}`} className="underline">
                        Se hvem som ser hytta
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {own.length > 0 && (
        <section aria-labelledby="inviter" className="mb-12">
          <Panel className="max-w-3xl">
            <h2 id="inviter" className="text-3xl leading-tight">
              Hvem ville du selv lånt bort hytta til?
            </h2>
            <p className="mt-2 mb-5 max-w-[60ch] text-muted">
              Inviter én eller flere du stoler på. Hver får sin egen invitasjon og ser bare
              hytta du velger her. Du ser nøyaktig hva som sendes før du bekrefter.
            </p>
            <ShareForm cabins={ownChoices} />
          </Panel>
        </section>
      )}
    </>
  );
}

/**
 * «Ledig» står i vindusgult, som et opplyst hyttevindu. Det er den samme
 * gulfargen som i kalenderen.
 */
function Free({ free, empty }: { free: DateRange[]; empty: string }) {
  if (free.length === 0) return <span className="block text-muted">{empty}</span>;
  return (
    <span className="inline-block rounded-2xl bg-window px-3 py-1 leading-snug">
      <span className="font-semibold">Ledig for forespørsel:</span> {nextFree(free)}
    </span>
  );
}

/** Sier rett ut om det finnes datoer å spørre om, og om hytta er delt med noen. */
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
      : `${sharedWith === 1 ? "Én person" : `${sharedWith} personer`} ser hytta.`;
  return (
    <>
      <span className="mt-3 block">
        <Free free={free} empty="Ingen ledige datoer." />
      </span>
      <span className="mt-2 block text-muted">{people}</span>
    </>
  );
}
