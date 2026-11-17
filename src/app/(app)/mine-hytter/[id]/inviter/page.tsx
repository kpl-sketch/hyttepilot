import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink, PageTitle, Panel } from "@/components/ui";
import { previewHref } from "@/components/owner-preview";
import { ShareForm } from "@/components/share-form";
import { getOwnCabin } from "@/lib/services/cabins";
import { listCabinSharing } from "@/lib/services/invitations";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Hvem skal få låne hytta?" };

/**
 * Øyeblikket rett etter at hytta er lagt inn, og målet for påminnelsen når
 * hytta står ledig. Siden har ett spørsmål: hvem skal få låne hytta? Selve
 * delingen går gjennom det vanlige skjemaet, så eieren ser over alt før noe
 * sendes, og bare eieren kommer hit (getOwnCabin).
 */
export default async function InviteToCabinPage({
  params,
  searchParams,
}: PageProps<"/mine-hytter/[id]/inviter">) {
  const viewer = await requireViewer();
  const [{ id }, { ny }] = await Promise.all([params, searchParams]);
  const cabin = await getOwnCabin(viewer, id);
  if (!cabin) notFound();

  const sharing = await listCabinSharing(viewer, cabin.id);
  const seen = (sharing?.people.length ?? 0) + (sharing?.invitations.length ?? 0);
  const next = `/mine-hytter/${cabin.id}${ny ? "?ny=1" : ""}`;

  return (
    <>
      <PageTitle
        title="Hvem skal få låne hytta?"
        lead={
          ny
            ? `${cabin.name} er lagret, og bare du ser den. Tenk på de du ville lånt bort hytta til uten å nøle, og skriv adressene deres her.`
            : `Tenk på de du ville lånt bort ${cabin.name} til uten å nøle, og skriv adressene deres her.`
        }
      />

      <Panel>
        <ul className="mb-5 max-w-[60ch] list-disc space-y-1 pl-5 text-muted">
          <li>De ser hytta og kan spørre om å låne den. De kan ikke vise den til andre.</li>
          <li>Du bestemmer når hytta er ledig, og svarer ja eller nei på hver forespørsel.</li>
        </ul>
        {seen > 0 && (
          <p className="mb-5 max-w-[60ch]">
            {seen === 1
              ? "Én person ser hytta eller er invitert fra før."
              : `${seen} personer ser hytta eller er invitert fra før.`}
          </p>
        )}
        <p className="mb-5 max-w-[60ch]">
          <a href={previewHref(cabin.id)} className="font-semibold underline">
            Se hva de får se når de åpner invitasjonen
          </a>
        </p>
        <ShareForm cabins={[{ id: cabin.id, name: cabin.name, area: cabin.area }]} />
      </Panel>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <ButtonLink href={next} variant="secondary">
          {ny ? "Gå videre til hytta" : "Tilbake til hytta"}
        </ButtonLink>
        {ny && (
          <p className="max-w-[45ch] text-sm text-muted">
            Du kan invitere senere under «Vis hytta til noen du kjenner». Datoer åpner du på
            siden for hytta.
          </p>
        )}
      </div>
    </>
  );
}
