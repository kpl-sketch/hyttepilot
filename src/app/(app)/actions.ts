"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, toFormState } from "@/lib/errors";
import {
  cancelBooking,
  createBooking,
  decideBooking,
  markPaid,
} from "@/lib/services/bookings";
import {
  addAvailability,
  createCabin,
  removeAvailability,
  updateCabin,
} from "@/lib/services/cabins";
import {
  approveAccessRequest,
  claimInvitations,
  declineAccessRequest,
  INVITATION_DAYS,
  inviteAccount,
  type InvitationResult,
  type InvitationsPreview,
  inviteManyToCabin,
  isInvitationToken,
  previewInvitations,
  previewShare,
  requestAccessViaInvitation,
  revokeAccess,
  revokeAccountInvitation,
  revokeInvitation,
  type ShareOutcome,
  type SharePreview,
  shareWithPerson,
} from "@/lib/services/invitations";
import { suggestDescription } from "@/lib/services/descriptions";
import { addCabinPhotos, makeCoverPhoto, removeCabinPhoto } from "@/lib/services/photos";
import { setIdleReminders } from "@/lib/services/reminders";
import { requireViewer } from "@/lib/session";

/*
 * Hver handling henter brukeren fra innloggingen og sender jobben videre til
 * tjenestelaget i src/lib/services, der alle regler og tilgangssjekker ligger.
 */

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

const files = (formData: FormData, key: string) =>
  formData.getAll(key).filter((value): value is File => value instanceof File);

function cabinFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    area: text(formData, "area"),
    description: text(formData, "description"),
    beds: text(formData, "beds"),
    costPerNight: text(formData, "costPerNight"),
    markupPercent: text(formData, "markupPercent"),
    cleaningFee: text(formData, "cleaningFee"),
    rules: text(formData, "rules"),
    minAge: text(formData, "minAge"),
    vippsNumber: text(formData, "vippsNumber"),
    address: text(formData, "address"),
    position: text(formData, "position"),
    arrivalInfo: text(formData, "arrivalInfo"),
  };
}

export async function createCabinAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let cabinId: string;
  try {
    cabinId = await createCabin(viewer, cabinFields(formData), files(formData, "photos"));
  } catch (error) {
    return toFormState(error);
  }
  redirect(`/mine-hytter/${cabinId}/inviter?ny=1`);
}

export async function setIdleRemindersAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const on = text(formData, "on") === "1";
  try {
    await setIdleReminders(viewer, text(formData, "cabinId"), on);
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return {
    ok: on
      ? "Du får e-post når hytta står ledig og ingen har spurt."
      : "Du får ikke lenger e-post når hytta står ledig.",
  };
}

export async function updateCabinAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await updateCabin(viewer, text(formData, "cabinId"), cabinFields(formData));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return { ok: "Lagret." };
}

/**
 * Et utkast til beskrivelsen av hytta, ut fra forsidebildet og stedet. Kalles
 * fra knappen under beskrivelsesfeltet. Ingenting lagres: teksten legges i
 * feltet, og eieren lagrer selv med skjemaet.
 */
export async function suggestDescriptionAction(
  cabinId: string,
): Promise<{ text: string } | { error: string }> {
  const viewer = await requireViewer();
  try {
    return { text: await suggestDescription(viewer, String(cabinId)) };
  } catch (error) {
    return { error: toFormState(error)?.error ?? "Noe gikk galt hos oss. Prøv igjen om litt." };
  }
}

export async function addCabinPhotosAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let added: number;
  try {
    added = await addCabinPhotos(viewer, text(formData, "cabinId"), files(formData, "photos"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return { ok: added === 1 ? "Bildet er lagt til." : `${added} bilder er lagt til.` };
}

export async function removeCabinPhotoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await removeCabinPhoto(viewer, text(formData, "photoId"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}

export async function makeCoverPhotoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await makeCoverPhoto(viewer, text(formData, "photoId"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}

export async function addAvailabilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await addAvailability(
      viewer,
      text(formData, "cabinId"),
      text(formData, "startDate"),
      text(formData, "endDate"),
    );
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return { ok: "Perioden er lagt til." };
}

export async function removeAvailabilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await removeAvailability(viewer, text(formData, "availabilityId"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}

/* --------------------------------- Deling ---------------------------------- */

/**
 * Skjemaet for å dele en hytte går i to steg. Først viser serveren nøyaktig
 * hva som sendes og hvem som får se hytta («preview»). Først når eieren
 * bekrefter, lagres delingen og e-posten sendes («send»).
 */
export type ShareState = {
  step: "edit" | "preview" | "sent";
  /** I `email` står adressene slik eieren skrev dem, én eller flere. */
  values: { cabinId: string; email: string; personId: string; message: string };
  /** Forhåndsvisning når hytta vises til én person i kretsen. */
  preview?: SharePreview;
  /** Forhåndsvisning når eieren inviterer én eller flere adresser. */
  invitations?: InvitationsPreview;
  /** Hva som skjedde med hver adresse, når eieren har sendt. */
  results?: InvitationResult[];
  error?: string;
  ok?: string;
};

function shareMessage(outcome: ShareOutcome): string {
  if (outcome.status === "shared") {
    return outcome.emailAccepted
      ? `${outcome.recipient} ser nå hytta og har fått beskjed på e-post.`
      : `${outcome.recipient} ser nå hytta, men e-posten med beskjed ble ikke sendt. Si gjerne fra selv.`;
  }
  return outcome.emailAccepted
    ? `Invitasjonen er sendt til ${outcome.recipient}. Den gjelder i ${INVITATION_DAYS} dager.`
    : `Invitasjonen til ${outcome.recipient} er lagret, men e-posten ble ikke sendt. Mottakeren kan logge inn med adressen sin likevel. Si gjerne fra selv.`;
}

/** Oppsummeringen øverst i kvitteringen etter en runde med invitasjoner. */
function roundSummary(results: InvitationResult[]): string {
  if (results.length === 1) {
    const [only] = results;
    return only.status === "skipped"
      ? `Ingenting ble sendt. ${only.reason ?? ""}`.trim()
      : shareMessage({ ...only, status: only.status });
  }
  const invited = results.filter((r) => r.status === "invited").length;
  const shared = results.filter((r) => r.status === "shared").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const parts = [
    invited > 0 && `${invited} er invitert`,
    shared > 0 && `${shared} ser hytta med en gang`,
    skipped > 0 && `${skipped} hoppet over`,
  ].filter(Boolean);
  return `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());
}

export async function shareAction(prev: ShareState, formData: FormData): Promise<ShareState> {
  const viewer = await requireViewer();
  const values = {
    cabinId: text(formData, "cabinId"),
    email: text(formData, "email").trim(),
    personId: text(formData, "personId"),
    message: text(formData, "message"),
  };
  const send = text(formData, "step") === "send";
  try {
    if (values.personId) {
      if (send) {
        const outcome = await shareWithPerson(
          viewer,
          values.cabinId,
          values.personId,
          values.message,
        );
        refresh();
        return {
          step: "sent",
          values: { ...values, email: "", message: "" },
          ok: shareMessage(outcome),
        };
      }
      const preview = await previewShare(
        viewer,
        values.cabinId,
        { personId: values.personId },
        values.message,
      );
      return { step: "preview", values, preview };
    }

    if (send) {
      const results = await inviteManyToCabin(viewer, values.cabinId, values.email, values.message);
      refresh();
      return {
        step: "sent",
        values: { ...values, email: "", message: "" },
        ok: roundSummary(results),
        results: results.length > 1 ? results : undefined,
      };
    }
    const invitations = await previewInvitations(
      viewer,
      values.cabinId,
      values.email,
      values.message,
    );
    return { step: "preview", values, invitations };
  } catch (error) {
    return { step: "edit", values, error: toFormState(error)?.error };
  }
}

/*
 * Når en deling eller invitasjon fjernes, forsvinner raden med knappen fra
 * siden. Bekreftelsen vises derfor øverst i delingspanelet etter en
 * videresending, ikke ved knappen.
 */
export async function revokeAccessAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let cabinId: string;
  try {
    ({ cabinId } = await revokeAccess(
      viewer,
      text(formData, "cabinId"),
      text(formData, "userId"),
    ));
  } catch (error) {
    return toFormState(error);
  }
  redirect(`/mine-hytter/${cabinId}?endret=deling#deling`);
}

export async function revokeInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let cabinId: string;
  try {
    ({ cabinId } = await revokeInvitation(viewer, text(formData, "invitationId")));
  } catch (error) {
    return toFormState(error);
  }
  redirect(`/mine-hytter/${cabinId}?endret=invitasjon#deling`);
}

/** Mottakeren tar imot invitasjoner som venter, og går rett til hytta hun er invitert til. */
export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const token = text(formData, "invitasjon");
  try {
    await claimInvitations(viewer.id, viewer.email);
  } catch (error) {
    return toFormState(error);
  }
  // Invitasjonssiden sender videre til hytta når invitasjonen er tatt imot.
  redirect(isInvitationToken(token) ? `/invitasjon/${token}` : "/krets");
}

/**
 * Innlogget med en annen adresse enn invitasjonen ble sendt til: personen ber
 * eieren om å få se hytta. Eieren må godkjenne.
 */
export async function requestAccessAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const token = text(formData, "invitasjon");
  try {
    await requestAccessViaInvitation(viewer, token);
  } catch (error) {
    return toFormState(error);
  }
  redirect(isInvitationToken(token) ? `/invitasjon/${token}` : "/krets");
}

/** Eieren godkjenner en som logget inn fra invitasjonen med en annen adresse. */
export async function approveAccessRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let cabinId: string;
  try {
    ({ cabinId } = await approveAccessRequest(viewer, text(formData, "requestId")));
  } catch (error) {
    return toFormState(error);
  }
  redirect(`/mine-hytter/${cabinId}?endret=godkjent#deling`);
}

/** Eieren sier nei til en som logget inn fra invitasjonen med en annen adresse. */
export async function declineAccessRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let cabinId: string;
  try {
    ({ cabinId } = await declineAccessRequest(viewer, text(formData, "requestId")));
  } catch (error) {
    return toFormState(error);
  }
  redirect(`/mine-hytter/${cabinId}?endret=avslatt#deling`);
}

/* ------------------------------ Administrasjon ------------------------------ */

export async function inviteAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  let emailAccepted: boolean;
  try {
    ({ emailAccepted } = await inviteAccount(
      viewer,
      text(formData, "email"),
      text(formData, "message"),
    ));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return emailAccepted
    ? { ok: `Invitasjonen er sendt. Den gjelder i ${INVITATION_DAYS} dager.` }
    : { error: "Invitasjonen er lagret, men e-posten ble ikke sendt. Si gjerne fra selv." };
}

export async function revokeAccountInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await revokeAccountInvitation(viewer, text(formData, "invitationId"));
  } catch (error) {
    return toFormState(error);
  }
  redirect("/admin?endret=invitasjon");
}

export async function createBookingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await createBooking(viewer, text(formData, "cabinId"), {
      startDate: text(formData, "startDate"),
      endDate: text(formData, "endDate"),
      guests: text(formData, "guests"),
      message: text(formData, "message"),
    });
  } catch (error) {
    return toFormState(error);
  }
  redirect("/foresporsler?sendt=1");
}

export async function decideBookingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const decision = text(formData, "decision") === "approve" ? "approve" : "decline";
  try {
    await decideBooking(
      viewer,
      text(formData, "bookingId"),
      decision,
      text(formData, "ownerReply"),
    );
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}

export async function markPaidAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await markPaid(viewer, text(formData, "bookingId"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}

export async function cancelBookingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await cancelBooking(viewer, text(formData, "bookingId"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}
