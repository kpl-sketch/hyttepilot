import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CabinForm } from "@/components/cabin-form";
import { photoSrc } from "@/components/cabin-photo";
import { PhotoPicker } from "@/components/photo-picker";
import { ButtonLink, Field, Input, PageTitle, Panel } from "@/components/ui";
import { formatRange } from "@/lib/dates";
import { MAX_PHOTOS } from "@/lib/photo-limits";
import { getCalendar, getOwnCabin } from "@/lib/services/cabins";
import { listFriendInvitations } from "@/lib/services/invitations";
import { listCabinPhotos } from "@/lib/services/photos";
import { requireViewer } from "@/lib/session";
import {
  addAvailabilityAction,
  addCabinPhotosAction,
  inviteFriendAction,
  makeCoverPhotoAction,
  removeAvailabilityAction,
  removeCabinPhotoAction,
  removeFriendAction,
  updateCabinAction,
} from "../../actions";

export default async function ManageCabinPage({ params }: PageProps<"/mine-hytter/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const cabin = await getOwnCabin(viewer, id);
  if (!cabin) notFound();

  const [calendar, friends, photos] = await Promise.all([
    getCalendar(cabin.id),
    listFriendInvitations(viewer, cabin.id),
    listCabinPhotos(cabin.id),
  ]);

  return (
    <>
      <PageTitle title={cabin.name} lead={cabin.area} />

      <div className="space-y-8">
        <Panel>
          <h2 className="text-2xl font-bold">Ledige perioder</h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            Legg inn når hytta kan lånes. Skal du bruke den selv, fjerner du perioden eller
            legger inn kortere perioder rundt dine egne turer.
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

          <ButtonLink href={`/hytter/${cabin.id}`} variant="secondary" className="mt-6">
            Se hytta slik vennene ser den
          </ButtonLink>
        </Panel>

        <Panel>
          <h2 className="text-2xl font-bold">Venner med tilgang</h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            Andre hytteeiere i kretsen ser hytta uansett. Venner uten egen hytte ser den bare
            hvis du inviterer dem her.
          </p>

          {friends.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span>
                    <span className="font-semibold">{friend.name || friend.email}</span>
                    <span className="block text-sm text-muted">
                      {friend.acceptedAt ? friend.email : "Invitert, har ikke logget inn ennå"}
                    </span>
                  </span>
                  <ActionForm
                    action={removeFriendAction}
                    confirm={`Fjerne tilgangen til ${friend.name || friend.email}?`}
                  >
                    <input type="hidden" name="invitationId" value={friend.id} />
                    <button type="submit" className="cursor-pointer text-barn underline">
                      Fjern tilgang
                    </button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}

          <ActionForm action={inviteFriendAction} resetOnOk className="mt-5">
            <input type="hidden" name="cabinId" value={cabin.id} />
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Vennens e-postadresse" className="min-w-[16rem] flex-1">
                <Input name="email" type="email" required />
              </Field>
              <SubmitButton variant="secondary">Inviter</SubmitButton>
            </div>
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
                    className="aspect-[4/3] w-full rounded-md border border-line object-cover"
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
          <CabinForm action={updateCabinAction} cabin={cabin} />
        </Panel>
      </div>
    </>
  );
}
