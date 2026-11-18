import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CabinForm } from "@/components/cabin-form";
import { photoSrc } from "@/components/cabin-photo";
import { previewHref } from "@/components/owner-preview";
import { PhotoPicker } from "@/components/photo-picker";
import { ButtonLink, Field, Input, PageTitle, Panel } from "@/components/ui";
import { ShareForm } from "@/components/share-form";
import { formatDate, formatRange, freePeriods, todayInOslo } from "@/lib/dates";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { getCalendar, getOwnCabin } from "@/lib/services/cabins";
import { listCabinSharing } from "@/lib/services/invitations";
import { listCabinPhotos } from "@/lib/services/photos";
import { requireViewer } from "@/lib/session";
import {
  addAvailabilityAction,
  addCabinPhotosAction,
  approveAccessRequestAction,
  declineAccessRequestAction,
  makeCoverPhotoAction,
  removeAvailabilityAction,
  removeCabinPhotoAction,
  revokeAccessAction,
  revokeInvitationAction,
  setIdleRemindersAction,
  updateCabinAction,
} from "../../actions";

/** «Kari, Ola og Lise» */
function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

/**
 * Det eieren må vite før en deling fjernes: personen mister innsynet, men
 * forespørsler og opphold blir stående til eieren selv gjør noe med dem.
 */
function revokeQuestion(
  cabinName: string,
  person: { name: string; pendingRequests: number; confirmedStays: number },
): string {
  const parts = [
    `Skal ${person.name} slutte å se ${cabinName}?`,
    `${person.name} ser ikke lenger hytta og kan ikke sende nye forespørsler.`,
  ];
  if (person.confirmedStays > 0) {
    parts.push(
      person.confirmedStays === 1
        ? `${person.name} har ett opphold du har sagt ja til. Det står som før. Vil du avlyse det, gjør du det under Forespørsler.`
        : `${person.name} har ${person.confirmedStays} opphold du har sagt ja til. De står som før. Vil du avlyse dem, gjør du det under Forespørsler.`,
    );
  }
  if (person.pendingRequests > 0) {
    parts.push(
      person.pendingRequests === 1
        ? "Én forespørsel venter fortsatt på svar fra deg."
        : `${person.pendingRequests} forespørsler venter fortsatt på svar fra deg.`,
    );
  }
  return parts.join(" ");
}

export default async function ManageCabinPage({
  params,
  searchParams,
}: PageProps<"/mine-hytter/[id]">) {
  const viewer = await requireViewer();
  const [{ id }, { ny, endret }] = await Promise.all([params, searchParams]);
  const cabin = await getOwnCabin(viewer, id);
  if (!cabin) notFound();

  const [calendar, sharing, photos] = await Promise.all([
    getCalendar(cabin.id),
    listCabinSharing(viewer, cabin.id),
    listCabinPhotos(cabin.id),
  ]);
  const people = sharing?.people ?? [];
  const invitations = sharing?.invitations ?? [];
  const requests = sharing?.requests ?? [];
  const free = freePeriods(calendar.available, calendar.taken, calendar.today);
  const isShared = people.length > 0;
  const hasDates = free.length > 0;
  const ready = isShared && hasDates;
  const missingPractical = !cabin.address.trim() || !cabin.arrivalInfo.trim();

  return (
    <>
      <PageTitle title={cabin.name} lead={cabin.area} />

      {ny && (
        <p role="status" className="mb-8 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
          Hytta er lagret. Bare du ser den til du velger noen.
        </p>
      )}

      <section
        aria-labelledby="status"
        className="mb-8 rounded-2xl bg-fjord-soft p-5 sm:p-7"
      >
        <h2 id="status" className="text-2xl font-bold">
          {ready ? "Hytta kan lånes" : "Tre steg, så kan hytta lånes"}
        </h2>
        <ol className="mt-4 space-y-3">
          <Step done number={1} title="Legg inn hytta">
            {cabin.area}, {cabin.beds} sengeplasser.
          </Step>
          <Step done={hasDates} number={2} title="Åpne datoer" href="#datoer">
            {hasDates
              ? `Ledig for forespørsel: ${
                  list(free.slice(0, 3).map((p) => formatRange(p.startDate, p.endDate))) +
                  (free.length > 3 ? ` og ${free.length - 3} til` : "")
                }.`
              : "Ingen datoer er åpne ennå."}
          </Step>
          <Step done={isShared} number={3} title="Vis hytta til noen du kjenner" href="#deling">
            {isShared
              ? `${list(people.map((p) => p.name))} ser hytta.`
              : "Bare du ser hytta."}
            {invitations.length > 0 &&
              ` ${invitations.length === 1 ? "Én invitasjon" : `${invitations.length} invitasjoner`} venter.`}
            {requests.length > 0 &&
              ` ${requests.length === 1 ? "Én person" : `${requests.length} personer`} venter på at du godkjenner.`}
          </Step>
        </ol>
        {missingPractical && (
          <p className="mt-4 max-w-[60ch]">
            Før noen kommer:{" "}
            <a href="#detaljer" className="underline">
              legg inn adresse og hvor nøkkelen ligger
            </a>
            . Låneren ser det først når oppholdet er betalt.
          </p>
        )}
      </section>

      <div className="space-y-8">
        <Panel>
          <h2 id="datoer" className="scroll-mt-6 text-2xl font-bold">
            Steg 2: Åpne datoer
          </h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            Legg inn når hytta kan lånes. Skal du bruke den selv, fjerner du perioden eller
            legger inn kortere perioder rundt dine egne turer. Du svarer fortsatt ja eller nei
            på hver forespørsel.
          </p>

          {calendar.available.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {calendar.available.map((period) => (
                <li
                  key={period.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="font-semibold">
                    {formatRange(period.startDate, period.endDate)}
                  </span>
                  <ActionForm action={removeAvailabilityAction}>
                    <input type="hidden" name="availabilityId" value={period.id} />
                    <button type="submit" className="cursor-pointer text-barn underline">
                      Fjern
                    </button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}

          <ActionForm action={addAvailabilityAction} resetOnOk className="mt-5">
            <input type="hidden" name="cabinId" value={cabin.id} />
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Ledig fra">
                <Input name="startDate" type="date" min={calendar.today} required />
              </Field>
              <Field label="Siste avreisedag">
                <Input name="endDate" type="date" min={calendar.today} required />
              </Field>
              <SubmitButton variant="secondary">Legg til periode</SubmitButton>
            </div>
          </ActionForm>

          <ButtonLink href={previewHref(cabin.id, "innlogget")} variant="secondary" className="mt-6">
            Se kalenderen slik de du inviterer, ser den
          </ButtonLink>
        </Panel>

        <Panel>
          <h2 id="deling" className="scroll-mt-6 text-2xl font-bold">
            Steg 3: Vis hytta til noen du kjenner
          </h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            Bare du og de du velger her, ser hytta, i tillegg til tjenestens
            administratorer. Andre hytteeiere ser den ikke. De du velger, kan se hytta og
            spørre om å låne den. De kan ikke vise den til andre.
          </p>
          <p className="mt-3 max-w-[60ch]">
            <a href={previewHref(cabin.id)} className="font-semibold underline">
              Se hytta slik de du inviterer, ser den
            </a>
            , både når de åpner invitasjonen og når de har logget inn.
          </p>

          {endret === "deling" && (
            <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
              Personen ser ikke lenger hytta og kan ikke sende nye
              forespørsler. Forespørsler og opphold er ikke endret.
            </p>
          )}
          {endret === "invitasjon" && (
            <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
              Invitasjonen er trukket tilbake. Lenken i e-posten virker ikke lenger.
            </p>
          )}

          {endret === "godkjent" && (
            <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
              Personen ser nå hytta og har fått beskjed på e-post.
            </p>
          )}
          {endret === "avslatt" && (
            <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-window p-4 font-semibold">
              Du har sagt nei. Personen ser ikke hytta.
            </p>
          )}

          {requests.length > 0 && (
            <section aria-labelledby="godkjenn" className="mt-5 rounded-xl border-2 border-window p-4">
              <h3 id="godkjenn" className="font-bold">
                Venter på at du godkjenner
              </h3>
              <p className="mt-1 max-w-[60ch] text-sm text-muted">
                Disse åpnet en invitasjon du sendte, og logget inn med en annen adresse. De ser
                ikke hytta før du sier ja.
              </p>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold">{request.name}</span>
                      <span className="block text-sm break-words text-muted">
                        {request.email}. Invitasjonen ble sendt til {request.invitedEmail}.
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-4">
                      <ActionForm action={approveAccessRequestAction}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <SubmitButton>Godkjenn {request.name}</SubmitButton>
                      </ActionForm>
                      <ActionForm
                        action={declineAccessRequestAction}
                        confirm={`Si nei til ${request.name}? Personen ser ikke hytta.`}
                      >
                        <input type="hidden" name="requestId" value={request.id} />
                        <button
                          type="submit"
                          className="cursor-pointer py-2.5 text-barn underline"
                          aria-label={`Si nei til ${request.name}`}
                        >
                          Si nei
                        </button>
                      </ActionForm>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {people.length > 0 && (
            <>
              <h3 className="mt-5 font-bold">Disse ser hytta</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {people.map((person) => (
                  <li
                    key={person.userId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold">{person.name}</span>
                      <span className="block text-sm break-words text-muted">
                        {person.email ? `${person.email}. ` : ""}
                        Ser hytta siden {formatDate(todayInOslo(person.since))}.
                      </span>
                    </span>
                    <ActionForm
                      action={revokeAccessAction}
                      confirm={revokeQuestion(cabin.name, person)}
                    >
                      <input type="hidden" name="cabinId" value={cabin.id} />
                      <input type="hidden" name="userId" value={person.userId} />
                      <button
                        type="submit"
                        className="cursor-pointer text-barn underline"
                        aria-label={`Ta bort ${person.name}`}
                      >
                        Ta bort
                      </button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </>
          )}

          {invitations.length > 0 && (
            <>
              <h3 className="mt-5 font-bold">Invitert, har ikke logget inn ennå</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold break-words">{inv.email}</span>
                      <span className="block text-sm text-muted">
                        {inv.expired
                          ? "Invitasjonen er utløpt. Send en ny hvis personen fortsatt skal se hytta."
                          : `Invitasjonen gjelder til ${formatDate(todayInOslo(inv.expiresAt))}.`}
                      </span>
                    </span>
                    <ActionForm
                      action={revokeInvitationAction}
                      confirm={`Trekke tilbake invitasjonen til ${inv.email}? Lenken i e-posten slutter å virke.`}
                    >
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button
                        type="submit"
                        className="cursor-pointer text-barn underline"
                        aria-label={`Trekk tilbake invitasjonen til ${inv.email}`}
                      >
                        Trekk tilbake
                      </button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="mt-6 mb-3 font-bold">
            {isShared || invitations.length > 0
              ? "Vis hytta til en til"
              : "Hvem ville du selv lånt bort hytta til?"}
          </h3>
          <ShareForm cabins={[{ id: cabin.id, name: cabin.name, area: cabin.area }]} />
        </Panel>

        <Panel>
          <h2 id="paminnelser" className="scroll-mt-6 text-2xl font-bold">
            Påminnelse før feriene
          </h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            {cabin.remindWhenIdle
              ? "Noen uker før vinterferien, påsken, sommerferien, høstferien og julen får du en e-post hvis hytta er åpen for lån i ferien uten at noen har spurt. Ellers hører du ingenting."
              : "Påminnelsene er slått av. Du får ingen e-post når hytta står ledig."}
          </p>
          <ActionForm action={setIdleRemindersAction} className="mt-4">
            <input type="hidden" name="cabinId" value={cabin.id} />
            <input type="hidden" name="on" value={cabin.remindWhenIdle ? "0" : "1"} />
            <SubmitButton variant="secondary">
              {cabin.remindWhenIdle ? "Slå av påminnelsene" : "Slå på påminnelsene"}
            </SubmitButton>
          </ActionForm>
        </Panel>

        <Panel>
          <h2 className="text-2xl font-bold">Bilder</h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            Alle som får se hytta, ser bildene. Forsidebildet vises også i listen over hytter.
          </p>

          {photos.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <li key={photo.id}>
                  {/* Bildene ligger bak innlogging og er allerede forminsket. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoSrc(photo.id, true)}
                    alt={`Bilde ${index + 1} av ${photos.length}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-xl border border-line object-cover"
                  />
                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    {index === 0 ? (
                      <span className="font-semibold">Forsidebilde</span>
                    ) : (
                      <ActionForm action={makeCoverPhotoAction}>
                        <input type="hidden" name="photoId" value={photo.id} />
                        <button type="submit" className="cursor-pointer text-pine underline">
                          Bruk som forsidebilde
                        </button>
                      </ActionForm>
                    )}
                    <ActionForm action={removeCabinPhotoAction} confirm="Fjerne bildet?">
                      <input type="hidden" name="photoId" value={photo.id} />
                      <button
                        type="submit"
                        className="cursor-pointer text-barn underline"
                        aria-label={`Fjern bilde ${index + 1}`}
                      >
                        Fjern
                      </button>
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {photos.length < MAX_PHOTOS ? (
            <ActionForm action={addCabinPhotosAction} resetOnOk className="mt-5">
              <input type="hidden" name="cabinId" value={cabin.id} />
              <PhotoPicker room={MAX_PHOTOS - photos.length}>
                <SubmitButton>Last opp bildene</SubmitButton>
              </PhotoPicker>
            </ActionForm>
          ) : (
            <p className="mt-4 max-w-[60ch] text-muted">
              Hytta har {MAX_PHOTOS} bilder, og det er ikke plass til flere. Fjern ett for å
              legge til et nytt.
            </p>
          )}
        </Panel>

        <Panel>
          <h2 id="detaljer" className="scroll-mt-6 text-2xl font-bold">
            Pris, regler og veien dit
          </h2>
          <p className="mt-1 mb-6 max-w-[60ch] text-muted">
            Alt her kan endres når som helst. Adresse og nøkkel ser låneren først når
            oppholdet er betalt.
          </p>
          <CabinForm action={updateCabinAction} cabin={cabin} />
        </Panel>
      </div>
    </>
  );
}

/** Ett steg i sjekklisten øverst. Ferdige steg er krysset av, og status står som tekst. */
function Step({
  number,
  title,
  done,
  href,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  href?: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`grid size-8 shrink-0 place-items-center rounded-full font-bold ${
          done ? "bg-pine text-white" : "border-2 border-ink bg-surface"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <span>
        <span className="block font-semibold">
          <span className="sr-only">{done ? "Ferdig: " : "Gjenstår: "}</span>
          {href && !done ? (
            <a href={href} className="underline">
              {title}
            </a>
          ) : (
            title
          )}
        </span>
        <span className="block text-muted">{children}</span>
      </span>
    </li>
  );
}
