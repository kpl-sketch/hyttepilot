import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  ButtonLink,
  buttonClass,
  Field,
  PageTitle,
  Panel,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { formatRange, nightsBetween } from "@/lib/dates";
import { directionLinks } from "@/lib/position";
import { formatKroner } from "@/lib/pricing";
import { listIncoming, listOutgoing } from "@/lib/services/bookings";
import { requireViewer } from "@/lib/session";
import {
  cancelBookingAction,
  decideBookingAction,
  markPaidAction,
} from "../actions";

export const metadata: Metadata = { title: "Forespørsler" };

function stay(startDate: string, endDate: string, guests: number) {
  const nights = nightsBetween(startDate, endDate);
  return `${formatRange(startDate, endDate)}, ${nights} ${nights === 1 ? "natt" : "netter"}, ${guests} ${guests === 1 ? "person" : "personer"}`;
}

export default async function RequestsPage({ searchParams }: PageProps<"/foresporsler">) {
  const viewer = await requireViewer();
  const [{ sendt }, incoming, outgoing] = await Promise.all([
    searchParams,
    listIncoming(viewer),
    listOutgoing(viewer),
  ]);

  return (
    <>
      <PageTitle title="Forespørsler" />

      {sendt && (
        <p role="status" className="mb-8 rounded-md bg-window p-4 font-semibold">
          Forespørselen er sendt. Du får e-post når eieren har svart.
        </p>
      )}

      {incoming.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold">Til hyttene dine</h2>
          <div className="space-y-4">
            {incoming.map(({ booking, cabinName, borrowerName, borrowerEmail, borrowerPhone }) => (
              <Panel key={booking.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-xl font-bold">
                    {borrowerName} vil låne {cabinName}
                  </h3>
                  <StatusBadge status={booking.status} />
                </div>
                <p className="mt-1">{stay(booking.startDate, booking.endDate, booking.guests)}</p>
                <p className="font-semibold tabular-nums">{formatKroner(booking.totalPrice)}</p>
                {booking.message && (
                  <blockquote className="mt-3 max-w-[60ch] border-l-4 border-line pl-4 whitespace-pre-line">
                    {booking.message}
                  </blockquote>
                )}
                <p className="mt-3 text-sm text-muted">
                  {borrowerName}: {borrowerPhone ? `${borrowerPhone}, ` : ""}
                  {borrowerEmail}. Har gitt Hytteløftet.
                </p>

                {booking.status === "pending" && (
                  <ActionForm action={decideBookingAction} className="mt-5">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <Field label={`Melding til ${borrowerName}`} hint="Valgfritt." className="max-w-xl">
                      <Textarea name="ownerReply" rows={2} maxLength={1000} />
                    </Field>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <SubmitButton name="decision" value="approve">
                        Si ja
                      </SubmitButton>
                      <SubmitButton name="decision" value="decline" variant="secondary">
                        Si nei
                      </SubmitButton>
                    </div>
                  </ActionForm>
                )}

                {booking.status === "approved" && (
                  <div className="mt-5">
                    <p className="max-w-[60ch]">
                      Du har sagt ja. {borrowerName} er bedt om å vippse{" "}
                      {formatKroner(booking.totalPrice)}. Marker som betalt når pengene er
                      kommet, så er oppholdet reservert.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <ActionForm action={markPaidAction}>
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <SubmitButton>Marker som betalt</SubmitButton>
                      </ActionForm>
                      <ActionForm
                        action={cancelBookingAction}
                        confirm={`Avlyse lånet til ${borrowerName}?`}
                      >
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <SubmitButton variant="danger">Avlys</SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                )}

                {booking.status === "paid" && (
                  <ActionForm
                    action={cancelBookingAction}
                    confirm={`Avlyse lånet til ${borrowerName}? Lånet er betalt, så du må selv betale tilbake.`}
                    className="mt-5"
                  >
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <SubmitButton variant="danger">Avlys lånet</SubmitButton>
                  </ActionForm>
                )}
              </Panel>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-2xl font-bold">Dine forespørsler</h2>
        {outgoing.length === 0 && (
          <Panel>
            <p className="text-lg">Du har ikke bedt om å låne noen hytte ennå.</p>
            <ButtonLink href="/hytter" className="mt-4">
              Se hyttene
            </ButtonLink>
          </Panel>
        )}
        <div className="space-y-4">
          {outgoing.map(({ booking, cabinName, cabinArea, ownerName, vippsNumber, ...arrival }) => (
            <Panel key={booking.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-xl font-bold">
                  {cabinName}, {cabinArea}
                </h3>
                <StatusBadge status={booking.status} />
              </div>
              <p className="mt-1">{stay(booking.startDate, booking.endDate, booking.guests)}</p>
              <p className="font-semibold tabular-nums">{formatKroner(booking.totalPrice)}</p>

              {booking.ownerReply && (
                <blockquote className="mt-3 max-w-[60ch] border-l-4 border-line pl-4 whitespace-pre-line">
                  {booking.ownerReply}
                  <footer className="mt-1 text-sm text-muted">{ownerName}</footer>
                </blockquote>
              )}

              {booking.status === "pending" && (
                <p className="mt-3 text-muted">{ownerName} har ikke svart ennå.</p>
              )}
              {booking.status === "approved" && vippsNumber && (
                <p className="mt-3 max-w-[60ch] rounded-md bg-window p-4 font-semibold">
                  Vipps {formatKroner(booking.totalPrice)} til {vippsNumber}. {ownerName}{" "}
                  markerer betalingen når den er mottatt, og da er oppholdet reservert.
                </p>
              )}
              {booking.status === "paid" && (
                <ArrivalDetails
                  ownerName={ownerName}
                  address={arrival.address ?? ""}
                  latitude={arrival.latitude}
                  longitude={arrival.longitude}
                  arrivalInfo={arrival.arrivalInfo ?? ""}
                />
              )}

              {(booking.status === "pending" || booking.status === "approved") && (
                <ActionForm
                  action={cancelBookingAction}
                  confirm="Trekke forespørselen?"
                  className="mt-5"
                >
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <SubmitButton variant="secondary">Trekk forespørselen</SubmitButton>
                </ActionForm>
              )}
            </Panel>
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * Det låneren trenger for å finne fram: adressen, lenker som viser veien i
 * kartet, og eierens egne opplysninger. Vises bare når lånet er betalt.
 */
function ArrivalDetails({
  ownerName,
  address,
  latitude,
  longitude,
  arrivalInfo,
}: {
  ownerName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  arrivalInfo: string;
}) {
  const directions = directionLinks({ address, latitude, longitude });
  return (
    <div className="mt-3 max-w-[60ch]">
      <h4 className="font-bold">Adresse og praktiske opplysninger</h4>
      {address && <p className="mt-1">{address}</p>}
      {!address && directions && (
        <p className="mt-1">
          Hytta har ingen adresse, men {ownerName} har lagt inn hvor den ligger i kartet.
        </p>
      )}
      {directions && (
        <p className="mt-3 flex flex-wrap gap-3">
          <a
            href={directions.google}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("secondary")}
          >
            Vis veien i Google Maps
          </a>
          <a
            href={directions.apple}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("secondary")}
          >
            Vis veien i Apple Kart
          </a>
        </p>
      )}
      {arrivalInfo && <p className="mt-3 whitespace-pre-line">{arrivalInfo}</p>}
      {!directions && !arrivalInfo && (
        <p className="mt-1">{ownerName} har ikke lagt inn noe ennå. Ta kontakt direkte.</p>
      )}
    </div>
  );
}
