import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DateRangePicker } from "@/components/date-range-picker";
import { PhotoGallery } from "@/components/photo-gallery";
import { ButtonLink, Field, Input, PageTitle, Panel, Textarea } from "@/components/ui";
import { formatKroner } from "@/lib/pricing";
import { getCalendar, getVisibleCabin } from "@/lib/services/cabins";
import { listCabinPhotos } from "@/lib/services/photos";
import { requireViewer } from "@/lib/session";
import { createBookingAction } from "../../actions";

export default async function CabinPage({ params }: PageProps<"/hytter/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const found = await getVisibleCabin(viewer, id);
  if (!found) notFound();
  const { cabin, ownerName } = found;
  const isOwn = cabin.ownerId === viewer.id;
  const [calendar, photos] = await Promise.all([
    getCalendar(cabin.id),
    listCabinPhotos(cabin.id),
  ]);
  const perNight = Math.round(cabin.costPerNight * (1 + cabin.markupPercent / 100));

  return (
    <>
      <PageTitle
        title={cabin.name}
        lead={`${cabin.area}. ${isOwn ? "Dette er din hytte." : `Eier: ${ownerName}.`}`}
      />

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
        <h2 className="mb-4 text-2xl font-bold">
          {isOwn ? "Slik ser kalenderen ut for vennene dine" : "Når vil du låne hytta?"}
        </h2>
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
                  label={`Melding til ${ownerName}`}
                  hint="Hvem blir med, og hva er planen?"
                  className="max-w-xl"
                >
                  <Textarea name="message" maxLength={1000} />
                </Field>
                <SubmitButton>Send forespørsel</SubmitButton>
                <p className="text-sm text-muted">
                  {ownerName} svarer ja eller nei. Du betaler ingenting før svaret er ja.
                </p>
              </div>
            )}
          </ActionForm>
        )}
      </Panel>
    </>
  );
}
