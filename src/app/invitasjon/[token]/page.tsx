import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AreaMap } from "@/components/area-map";
import { PhotoGallery } from "@/components/photo-gallery";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink, Loading, Panel } from "@/components/ui";
import { APP_NAME, WHAT_IT_IS } from "@/lib/brand";
import { firstName } from "@/lib/emails";
import {
  getAccessRequestState,
  getInvitationForViewer,
  getInvitationPreview,
  INVITATION_DAYS,
  isInvitationToken,
} from "@/lib/services/invitations";
import { getSessionUser, getViewer, type Viewer } from "@/lib/session";
import { acceptInvitationAction, requestAccessAction } from "../../(app)/actions";
import { signOut } from "../../logg-inn/actions";

export const metadata: Metadata = { title: "Invitasjon" };

/**
 * Siden invitasjonslenken i e-posten peker til.
 *
 * Ett klikk fra e-posten skal være nok til å se hytta og forstå ideen. Uten
 * innlogging viser siden derfor bildene, området på kart og en kort
 * forklaring, så lenge invitasjonen gjelder. Lenken kan åpnes flere ganger.
 *
 * Lenken kan være videresendt, så navn, pris, datoer, adresse og nøyaktig
 * posisjon vises ikke her. Tilgangen gis aldri på denne siden: den gis når
 * mottakeren logger inn med adressen invitasjonen ble sendt til. Logger
 * noen inn med en annen adresse, må eieren godkjenne personen først.
 */
export default function InvitationPage({ params }: PageProps<"/invitasjon/[token]">) {
  return (
    <PublicShell>
      <Suspense fallback={<Loading />}>
        <Invitation params={params} />
      </Suspense>
    </PublicShell>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1 className="max-w-[20ch] text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        {title}
      </h1>
      <div className="mt-5 max-w-[56ch] space-y-4 text-lg">{children}</div>
    </>
  );
}

async function Invitation({ params }: { params: PageProps<"/invitasjon/[token]">["params"] }) {
  const { token } = await params;
  const found = isInvitationToken(token) ? await getInvitationPreview(token) : null;
  if (!found) {
    return (
      <Message title="Vi finner ikke invitasjonen">
        <p>
          Sjekk at hele lenken fra e-posten kom med. Virker den fortsatt ikke, kan du be den
          som inviterte deg, om å sende en ny.
        </p>
        <ButtonLink href="/logg-inn" variant="secondary">
          Logg inn
        </ButtonLink>
      </Message>
    );
  }
  const inviter = firstName(found.inviterName);

  if (found.status === "revoked") {
    return (
      <Message title="Invitasjonen gjelder ikke lenger">
        <p>
          {found.inviterName} har trukket invitasjonen tilbake. Ta kontakt med {inviter} hvis
          du lurer på noe.
        </p>
      </Message>
    );
  }
  if (found.status === "expired") {
    return (
      <Message title="Invitasjonen er utløpt">
        <p>
          Invitasjoner gjelder i {INVITATION_DAYS} dager. Be {found.inviterName} om å sende en
          ny, så er du i gang.
        </p>
      </Message>
    );
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser && found.cabin) {
    return (
      <CabinPreview
        token={token}
        inviterName={found.inviterName}
        accepted={found.status === "accepted"}
        cabin={found.cabin}
      />
    );
  }
  if (!sessionUser) {
    return (
      <Message title={`${found.inviterName} inviterer deg til ${APP_NAME}`}>
        <p>
          I {APP_NAME} {WHAT_IT_IS}.
        </p>
        {found.kind === "cabin" ? (
          <p>
            {inviter} vil vise deg hytta si. Når du har logget inn, ser du hytta og når
            den er ledig, og du kan sende {inviter} en forespørsel om å låne den.
          </p>
        ) : (
          <p>
            Når du har logget inn, kan du legge inn din egen hytte og velge hvem som får se
            den.
          </p>
        )}
        <Panel>
          <p className="text-base">
            {found.status === "accepted"
              ? "Invitasjonen er allerede tatt i bruk. Logg inn for å fortsette."
              : `Invitasjonen er personlig og gjelder for ${found.maskedEmail}. Logg inn med den adressen. Du får en engangskode på e-post.`}
          </p>
          <ButtonLink href={`/logg-inn?invitasjon=${token}`} className="mt-4">
            {found.kind === "cabin" ? "Logg inn og se hytta" : "Logg inn"}
          </ButtonLink>
        </Panel>
        <p className="text-base text-muted">
          Eieren bestemmer når hytta er ledig, og svarer ja eller nei på hver forespørsel. En
          invitasjon er ikke en reservasjon.
        </p>
      </Message>
    );
  }

  // Innlogget, men velkomstsiden er ikke fullført: dit først, med invitasjonen i hånda.
  const viewer = await getViewer();
  if (!viewer) redirect(`/velkommen?invitasjon=${token}`);

  const mine = await getInvitationForViewer(viewer, token);
  if (mine && !mine.mine && found.kind === "cabin") {
    return <OtherAddress token={token} inviterName={found.inviterName} viewer={viewer} />;
  }
  if (!mine || !mine.mine) {
    return (
      <Message title="Invitasjonen gjelder en annen adresse">
        <p>
          Du er logget inn som {viewer.email}. Invitasjonen fra {found.inviterName} er sendt
          til {found.maskedEmail}.
        </p>
        <p className="text-base">
          Er det din adresse, logger du ut og inn igjen med den. Vil du heller bruke adressen
          du er logget inn med nå, kan du be {inviter} om en ny invitasjon dit.
        </p>
        <div className="flex flex-wrap gap-3">
          <form action={signOut}>
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-pine px-4 py-2.5 text-base font-semibold text-white hover:bg-ink"
            >
              Logg ut
            </button>
          </form>
          <ButtonLink href="/krets" variant="secondary">
            Gå til din hyttekrets
          </ButtonLink>
        </div>
      </Message>
    );
  }

  // Tatt imot: rett til hytta, ikke via hyttekretsen. Uten hytte går veien til kretsen.
  if (mine.status === "accepted") {
    redirect(
      mine.cabin
        ? `/hytter/${mine.cabin.id}?invitasjon=${token}`
        : `/krets?invitasjon=${token}`,
    );
  }

  // Invitasjonen venter fortsatt. Mottakeren tar imot med et eget trykk.
  return (
    <Message title={`${mine.inviterName} inviterer deg`}>
      <p>
        {mine.cabin
          ? `${inviter} vil vise deg ${mine.cabin.name} (${mine.cabin.area}).`
          : `${inviter} har invitert deg til ${APP_NAME}.`}
      </p>
      <ActionForm action={acceptInvitationAction}>
        <input type="hidden" name="invitasjon" value={token} />
        <SubmitButton>Ta imot invitasjonen</SubmitButton>
      </ActionForm>
    </Message>
  );
}

type PreviewCabin = NonNullable<NonNullable<Awaited<ReturnType<typeof getInvitationPreview>>>["cabin"]>;

/**
 * Det den inviterte ser etter ett klikk, uten innlogging: hvem som låner bort
 * hytta, bildene, området på kart og ideen. Neste steg er å logge inn.
 */
function CabinPreview({
  token,
  inviterName,
  accepted,
  cabin,
}: {
  token: string;
  inviterName: string;
  accepted: boolean;
  cabin: PreviewCabin;
}) {
  const inviter = firstName(inviterName);
  return (
    <>
      <h1 className="max-w-[22ch] text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        {inviter} låner deg hytta si
      </h1>
      <p className="mt-4 max-w-[56ch] text-xl">
        Har du hytte, kan du velge å låne bort din også.
      </p>

      <div className="mt-8">
        <PhotoGallery
          photos={cabin.photos}
          cabinName={`Hytta i ${cabin.area}`}
          base={`/invitasjon/${token}/bilder`}
        />
      </div>

      <section aria-labelledby="hvor" className="mb-10">
        <h2 id="hvor" className="text-xl font-bold">
          Hytta ligger i {cabin.area}
        </h2>
        {cabin.areaPosition && <AreaMap position={cabin.areaPosition} area={cabin.area} />}
        <p className="mt-2 max-w-[60ch] text-sm text-muted">
          Kartet viser området, ikke selve hytta. Adressen får du når lånet er betalt.
        </p>
      </section>

      <section aria-labelledby="ideen" className="mb-10 max-w-[60ch] space-y-3 text-lg">
        <h2 id="ideen" className="text-xl font-bold">
          Slik virker {APP_NAME}
        </h2>
        <p>
          I {APP_NAME} {WHAT_IT_IS}.
        </p>
        <p>
          {inviter} bestemmer når hytta er ledig, og svarer ja eller nei på hver forespørsel.
          {inviter} setter prisen, og du betaler med Vipps.
        </p>
      </section>

      <Panel>
        <h2 className="text-2xl font-bold">Vil du låne hytta?</h2>
        <p className="mt-2 max-w-[56ch]">
          {accepted
            ? "Logg inn for å se når hytta er ledig, og be om å låne den."
            : `Bli med for å se når hytta er ledig, hva den koster, og be ${inviter} om å låne den. Du får en kode på e-post. Det finnes ingen passord.`}
        </p>
        <ButtonLink href={`/logg-inn?invitasjon=${token}`} className="mt-4">
          {accepted ? "Logg inn og se ledige datoer" : "Bli med og se ledige datoer"}
        </ButtonLink>
      </Panel>
    </>
  );
}

/**
 * Innlogget med en annen adresse enn den invitasjonen ble sendt til. Personen
 * ser ikke hytta før eieren har godkjent.
 */
async function OtherAddress({
  token,
  inviterName,
  viewer,
}: {
  token: string;
  inviterName: string;
  viewer: Viewer;
}) {
  const inviter = firstName(inviterName);
  const access = await getAccessRequestState(viewer, token);
  if (access.state === "has-access") redirect(`/hytter/${access.cabinId}`);

  const other = (
    <p className="text-base text-muted">
      Du er logget inn som {viewer.email}. Invitasjonen fra {inviterName} ble sendt til en
      annen adresse.
    </p>
  );
  const toCircle = (
    <ButtonLink href="/krets" variant="secondary">
      Gå til din hyttekrets
    </ButtonLink>
  );

  switch (access.state) {
    case "pending":
      return (
        <Message title={`Venter på svar fra ${inviter}`}>
          <p>
            {inviter} har fått beskjed og må godkjenne deg før du ser hytta. Du får en e-post
            når det er gjort.
          </p>
          {other}
          {toCircle}
        </Message>
      );
    case "none":
      return (
        <Message title={`Vil du se hytta til ${inviter}?`}>
          {other}
          <p>
            Be {inviter} om å godkjenne deg. Når {inviter} har sagt ja, ser du hytta og kan be
            om å låne den.
          </p>
          <ActionForm action={requestAccessAction}>
            <input type="hidden" name="invitasjon" value={token} />
            <SubmitButton>Be {inviter} om å se hytta</SubmitButton>
          </ActionForm>
        </Message>
      );
    case "declined":
      return (
        <Message title="Du ser ikke denne hytta">
          <p>
            {inviter} har ikke godkjent at du ser hytta med denne invitasjonen. Ta kontakt med{" "}
            {inviter} hvis du lurer på noe.
          </p>
          {toCircle}
        </Message>
      );
    case "removed":
      return (
        <Message title="Du ser ikke denne hytta lenger">
          <p>
            {inviter} viser ikke lenger hytta til deg. Ta kontakt med {inviter} hvis du lurer på
            noe.
          </p>
          {toCircle}
        </Message>
      );
    case "full":
      return (
        <Message title="Lenken er brukt av for mange">
          {other}
          <p>Be {inviter} om en egen invitasjon til adressen din.</p>
          {toCircle}
        </Message>
      );
    default:
      return (
        <Message title="Invitasjonen gjelder ikke lenger">
          <p>Be {inviter} om en ny invitasjon hvis du fortsatt vil se hytta.</p>
          {toCircle}
        </Message>
      );
  }
}
