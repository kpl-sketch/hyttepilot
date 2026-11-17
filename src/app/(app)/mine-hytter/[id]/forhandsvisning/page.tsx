import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationCabinPreview } from "@/components/invitation-cabin";
import { OwnerPreviewBar } from "@/components/owner-preview";
import { getOwnInvitationPreview } from "@/lib/services/invitations";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Forhåndsvisning" };

/**
 * Eieren ser invitasjonssiden slik den inviterte ser den før innlogging.
 * Innholdet er det samme som på /invitasjon/[nøkkel], men knappen leder ingen
 * steder. Bare eieren kommer hit (getOwnInvitationPreview).
 */
export default async function InvitationPreviewPage({
  params,
}: PageProps<"/mine-hytter/[id]/forhandsvisning">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const preview = await getOwnInvitationPreview(viewer, id);
  if (!preview) notFound();

  return (
    <>
      <OwnerPreviewBar cabinId={id} step="invitasjon" />
      <InvitationCabinPreview
        inviterName={preview.inviterName}
        accepted={false}
        cabin={preview.cabin}
      />
    </>
  );
}
