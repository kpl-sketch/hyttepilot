import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink, Loading, Panel } from "@/components/ui";
import { APP_NAME, WHAT_IT_IS } from "@/lib/brand";
import { firstName } from "@/lib/emails";
import {
  getInvitationForViewer,
  getPublicInvitation,
  INVITATION_DAYS,
  isInvitationToken,
} from "@/lib/services/invitations";
import { getSessionUser, getViewer } from "@/lib/session";
import { acceptInvitationAction } from "../../(app)/actions";
import { signOut } from "../../logg-inn/actions";

export const metadata: Metadata = { title: "Invitasjon" };

/**
 * Siden invitasjonslenken i e-posten peker til.
 *
 * Lenken kan være videresendt, så siden viser ingenting om hytta før rett
 * person er logget inn. Uinnloggede ser bare hvem som inviterer og en maskert
 * adresse. Tilgangen gis aldri her: den gis når mottakeren logger inn med
 * adressen invitasjonen ble sendt til.
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
  const found = isInvitationToken(token) ? await getPublicInvitation(token) : null;
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
  if (!sessionUser) {
    return (
      <Message title={`${found.inviterName} inviterer deg til ${APP_NAME}`}>
        <p>
          I {APP_NAME} {WHAT_IT_IS}.
        </p>
        {found.kind === "cabin" ? (
          <p>
            {inviter} vil dele hytta si med deg. Når du har logget inn, ser du hytta og når
            den er ledig, og du kan sende {inviter} en forespørsel om å låne den.
          </p>
        ) : (
          <p>
            Når du har logget inn, kan du legge inn din egen hytte og velge hvem du vil dele
            den med.
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
              className="cursor-pointer rounded-md bg-pine px-4 py-2.5 text-base font-semibold text-white hover:bg-ink"
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

  if (mine.status === "accepted") redirect(`/krets?invitasjon=${token}`);

  // Invitasjonen venter fortsatt. Mottakeren tar imot med et eget trykk.
  return (
    <Message title={`${mine.inviterName} inviterer deg`}>
      <p>
        {mine.cabin
          ? `${inviter} vil dele ${mine.cabin.name} (${mine.cabin.area}) med deg.`
          : `${inviter} har invitert deg til ${APP_NAME}.`}
      </p>
      <ActionForm action={acceptInvitationAction}>
        <input type="hidden" name="invitasjon" value={token} />
        <SubmitButton>Ta imot invitasjonen</SubmitButton>
      </ActionForm>
    </Message>
  );
}
