import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AreaMap } from "@/components/area-map";
import { Avatar } from "@/components/avatar";
import { DateRangePicker } from "@/components/date-range-picker";
import { OwnerPreviewBar, previewHref } from "@/components/owner-preview";
import { PhotoGallery } from "@/components/photo-gallery";
import { ButtonLink, buttonClass, Field, Input, PageTitle, Panel, Textarea } from "@/components/ui";
import { avatarSrc } from "@/lib/avatar";
import { firstName } from "@/lib/emails";
import { areaLink } from "@/lib/position";
import { formatKroner } from "@/lib/pricing";
import { getCalendar, getVisibleCabin } from "@/lib/services/cabins";
import { getInvitationForViewer } from "@/lib/services/invitations";
import { listCabinPhotos } from "@/lib/services/photos";
import { requireViewer } from "@/lib/session";
import { createBookingAction } from "../../actions";

export default async function CabinPage({ params, searchParams }: PageProps<"/hytter/[id]">) {
  const viewer = await requireViewer();
  const [{ id }, { invitasjon, som }] = await Promise.all([params, searchParams]);
  const found = await getVisibleCabin(viewer, id);
  if (!found) notFound();
  const { cabin, ownerName, areaPosition } = found;
  const ownerAvatar = avatarSrc(cabin.ownerId, found.ownerPhoto);
  // Administrator som ser hytta uten at eieren har vist den: bare lesing.
  const asAdmin = found.access === "admin";
  const areaSearch = areaLink(cabin.area);
  // Eieren kan se sin egen hytte slik de inviterte ser den (?som=laaner).
  // Det gir ikke mer innsyn: eieren ser allerede alt om hytta.
  const asBorrower = cabin.ownerId === viewer.id && som === "laaner";
  const isOwn = cabin.ownerId === viewer.id && !asBorrower;
  const [calendar, photos] = await Promise.all([
    getCalendar(cabin.id),
    listCabinPhotos(cabin.id),
  ]);
  const perNight = Math.round(cabin.costPerNight * (1 + cabin.markupPercent / 100));
  const owner = firstName(ownerName);

  // Kommer låneren rett fra invitasjonen, står hilsenen øverst på hytta.
  const invited =
    cabin.ownerId !== viewer.id && !asAdmin && typeof invitasjon === "string"
      ? await getInvitationForViewer(viewer, invitasjon)
      : null;
  // I forhåndsvisningen vises hilsenen slik den ser ut uten egen melding.
  const welcome = asBorrower
    ? { inviterName: ownerName, message: null }
    : invited?.mine && invited.status === "accepted" && invited.cabin?.id === cabin.id
      ? invited
      : null;

  return (
    <>
      {asBorrower && <OwnerPreviewBar cabinId={cabin.id} step="innlogget" />}
      <PageTitle
        title={cabin.name}
        lead={
          isOwn ? (
            `${cabin.area}. Dette er din hytte.`
          ) : (
            <span className="flex items-center gap-3">
              <Avatar name={ownerName} src={ownerAvatar} />
              <span>
                {cabin.area}. Hytta til {ownerName}.
              </span>
            </span>
          )
        }
      />

      {asAdmin && (
        <p className="mb-8 max-w-[60ch] rounded-xl border border-line bg-surface p-4">
          Du ser hytta som administrator. {owner} har ikke vist deg hytta, så du kan ikke
          spørre om å låne den.{" "}
          <a href="/admin/hytter" className="font-semibold underline">
            Tilbake til hytteoversikten
          </a>
        </p>
      )}

      {welcome && (
        <section
          aria-labelledby="velkommen"
          className="mb-8 rounded-2xl bg-fjord-soft p-5 sm:p-7"
        >
          <h2 id="velkommen" className="text-2xl font-bold">
            {welcome.inviterName} viser deg {cabin.name}
          </h2>
          {welcome.message && (
            <blockquote className="mt-3 max-w-[60ch] border-l-4 border-window pl-4 whitespace-pre-line">
              {welcome.message}
              <footer className="mt-1 text-sm text-muted">Hilsen {owner}</footer>
            </blockquote>
          )}
          <p className="mt-3 max-w-[60ch]">
            Velg datoer som passer, og send {owner} en forespørsel. {owner} svarer ja eller nei.
          </p>
          <ButtonLink href="#datoer" className="mt-4">
            Se ledige datoer
          </ButtonLink>
        </section>
      )}

      <PhotoGallery photos={photos} cabinName={cabin.name} />

      {/* Mobil: fakta, pris, kalender under hverandre. Stor skjerm (xl): fakta og kalender
          til venstre, prisen i en kolonne til høyre som blir stående når man blar. */}
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-x-16">
        <div className="space-y-6 xl:col-start-1 xl:row-start-1">
          <section aria-labelledby="hvor">
            <h2 id="hvor" className="text-xl font-bold">
              Hvor ligger hytta?
            </h2>
            <p className="mt-2 max-w-[60ch]">
              <span className="font-semibold">{cabin.area}</span>
              {areaSearch && (
                <>
                  {" · "}
                  <a href={areaSearch} target="_blank" rel="noopener noreferrer" className="underline">
                    Se området i Google Maps
                  </a>
                </>
              )}
            </p>
            {areaPosition && <AreaMap position={areaPosition} area={cabin.area} />}
            <p className="mt-2 max-w-[60ch] text-sm text-muted">
              {isOwn
                ? "Lånerne ser området og et kart over området. Adressen og veien til hytta får de når lånet er betalt."
                : asAdmin
                  ? "Kartet viser området, ikke selve hytta. Administratorer ser ikke adressen."
                  : `Kartet viser området, ikke selve hytta. Adressen og veibeskrivelsen får du når lånet er betalt.`}
            </p>
          </section>
          {cabin.description && (
            <p className="max-w-[60ch] whitespace-pre-line text-lg">{cabin.description}</p>
          )}
          {cabin.rules && (
            <div>
              <h2 className="text-xl font-bold">Eierens regler</h2>
              <p className="mt-2 max-w-[60ch] whitespace-pre-line">{cabin.rules}</p>
            </div>
          )}
        </div>

        <aside
          aria-label="Pris og plass"
          className="h-fit max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card xl:sticky xl:top-28 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:max-w-none"
        >
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
            <dt className="text-muted">Per døgn</dt>
            <dd className="text-right font-semibold tabular-nums">{formatKroner(perNight)}</dd>
            <dt className="text-muted">Vask</dt>
            <dd className="text-right font-semibold tabular-nums">
              {cabin.cleaningFee > 0 ? formatKroner(cabin.cleaningFee) : "Du vasker selv"}
            </dd>
            <dt className="text-muted">Sengeplasser</dt>
            <dd className="text-right font-semibold tabular-nums">{cabin.beds}</dd>
            {cabin.minAge && (
              <>
                <dt className="text-muted">Aldersgrense</dt>
                <dd className="text-right font-semibold tabular-nums">{cabin.minAge} år</dd>
              </>
            )}
          </dl>
          {/* På mobil står kalenderen rett under, så knappen trengs bare når prisen står i egen kolonne. */}
          {!isOwn && !asAdmin && calendar.available.length > 0 && (
            <div className="mt-5 hidden xl:block">
              <ButtonLink href="#datoer" className="w-full">
                Velg datoer
              </ButtonLink>
            </div>
          )}
        </aside>

        <Panel className="xl:col-start-1 xl:row-start-2">
          <h2 id="datoer" className="scroll-mt-24 text-2xl font-bold">
            {isOwn
              ? "Slik ser kalenderen ut for dem du har valgt"
              : asAdmin
                ? "Ledige datoer"
                : "Når vil du låne hytta?"}
          </h2>
          <p className="mt-1 mb-5 max-w-[60ch] text-muted">
            {isOwn
              ? "Bare du, de du har valgt, og administratorene ser denne siden."
              : asAdmin
                ? `Datoene ${owner} har åpnet for forespørsler.`
                : `${owner} har åpnet datoene under for forespørsler. Du spør, og ${owner} svarer ja eller nei.`}
          </p>
          {asAdmin ? (
            <DateRangePicker
              today={calendar.today}
              available={calendar.available}
              taken={calendar.taken}
              readOnly
            />
          ) : isOwn ? (
            <>
              <DateRangePicker
                today={calendar.today}
                available={calendar.available}
                taken={calendar.taken}
                readOnly
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={previewHref(cabin.id)}>
                  Se hytta slik de du inviterer, ser den
                </ButtonLink>
                <ButtonLink href={`/mine-hytter/${cabin.id}`} variant="secondary">
                  Endre hytta og ledige perioder
                </ButtonLink>
              </div>
            </>
          ) : (
            <BookingForm preview={asBorrower}>
              <input type="hidden" name="cabinId" value={cabin.id} />
              <DateRangePicker
                today={calendar.today}
                available={calendar.available}
                taken={calendar.taken}
                price={{
                  costPerNight: cabin.costPerNight,
                  markupPercent: cabin.markupPercent,
                  cleaningFee: cabin.cleaningFee,
                }}
              />
              {calendar.available.length === 0 && (
                <p className="mt-3 max-w-[60ch]">
                  Du ser hytta, men du kan ikke sende en forespørsel før {owner} har
                  åpnet noen datoer. Si gjerne fra til {owner} at du er interessert.
                </p>
              )}
              {calendar.available.length > 0 && (
                <div className="mt-6 space-y-4">
                  <Field label="Hvor mange blir dere?" className="max-w-[12rem]">
                    <Input
                      name="guests"
                      type="number"
                      min={1}
                      max={cabin.beds}
                      defaultValue={2}
                      required
                    />
                  </Field>
                  <Field
                    label={`Melding til ${owner}`}
                    hint="Hvem blir med, og hva er planen?"
                    className="max-w-xl"
                  >
                    <Textarea name="message" maxLength={1000} />
                  </Field>
                  {asBorrower ? (
                    <span aria-disabled="true" className={buttonClass("primary", "cursor-default")}>
                      Send forespørsel
                    </span>
                  ) : (
                    <SubmitButton>Send forespørsel</SubmitButton>
                  )}
                  <p className="max-w-[60ch] text-sm text-muted">
                    {owner} svarer ja eller nei. Ingenting er avtalt før svaret er ja, og du
                    betaler ingenting før det.
                  </p>
                </div>
              )}
            </BookingForm>
          )}
        </Panel>
      </div>
    </>
  );
}

/**
 * Skjemaet for forespørsler. I eierens forhåndsvisning er det bare en ramme
 * rundt feltene, så ingenting kan sendes.
 */
function BookingForm({ preview, children }: { preview: boolean; children: ReactNode }) {
  if (preview) return <div>{children}</div>;
  return <ActionForm action={createBookingAction}>{children}</ActionForm>;
}
