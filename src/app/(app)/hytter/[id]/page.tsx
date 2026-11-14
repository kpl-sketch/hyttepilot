import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DateRangePicker } from "@/components/date-range-picker";
import { PhotoGallery } from "@/components/photo-gallery";
import { ButtonLink, Field, Input, PageTitle, Panel, Textarea } from "@/components/ui";
import { firstName } from "@/lib/emails";
import { formatKroner } from "@/lib/pricing";
import { getCalendar, getVisibleCabin } from "@/lib/services/cabins";
import { getInvitationForViewer } from "@/lib/services/invitations";
import { listCabinPhotos } from "@/lib/services/photos";
import { requireViewer } from "@/lib/session";
import { createBookingAction } from "../../actions";

export default async function CabinPage({ params, searchParams }: PageProps<"/hytter/[id]">) {
  const viewer = await requireViewer();
  const [{ id }, { invitasjon }] = await Promise.all([params, searchParams]);
  const found = await getVisibleCabin(viewer, id);
  if (!found) notFound();
  const { cabin, ownerName } = found;
  const isOwn = cabin.ownerId === viewer.id;
  const [calendar, photos] = await Promise.all([
    getCalendar(cabin.id),
    listCabinPhotos(cabin.id),
  ]);
  const perNight = Math.round(cabin.costPerNight * (1 + cabin.markupPercent / 100));
  const owner = firstName(ownerName);

  // Kommer låneren rett fra invitasjonen, står hilsenen øverst på hytta.
  const invited =
    !isOwn && typeof invitasjon === "string"
      ? await getInvitationForViewer(viewer, invitasjon)
      : null;
  const welcome =
    invited?.mine && invited.status === "accepted" && invited.cabin?.id === cabin.id
      ? invited
      : null;

  return (
    <>
      <PageTitle
        title={cabin.name}
        lead={`${cabin.area}. ${isOwn ? "Dette er din hytte." : `Hytta til ${ownerName}.`}`}
      />

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

      <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
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

        <dl className="grid h-fit grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-t-4 border-pine pt-4">
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
      </div>

      <Panel className="mt-10">
        <h2 id="datoer" className="scroll-mt-24 text-2xl font-bold">
          {isOwn ? "Slik ser kalenderen ut for dem du har valgt" : "Når vil du låne hytta?"}
        </h2>
        <p className="mt-1 mb-5 max-w-[60ch] text-muted">
          {isOwn
            ? "Bare du og de du har valgt, ser denne siden."
            : `${owner} har åpnet datoene under for forespørsler. Du spør, og ${owner} svarer ja eller nei.`}
        </p>
        {isOwn ? (
          <>
            <DateRangePicker
              today={calendar.today}
              available={calendar.available}
              taken={calendar.taken}
              readOnly
            />
            <ButtonLink href={`/mine-hytter/${cabin.id}`} variant="secondary" className="mt-6">
              Endre hytta og ledige perioder
            </ButtonLink>
          </>
        ) : (
          <ActionForm action={createBookingAction}>
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
                <SubmitButton>Send forespørsel</SubmitButton>
                <p className="max-w-[60ch] text-sm text-muted">
                  {owner} svarer ja eller nei. Ingenting er avtalt før svaret er ja, og du
                  betaler ingenting før det.
                </p>
              </div>
            )}
          </ActionForm>
        )}
      </Panel>
    </>
  );
}
