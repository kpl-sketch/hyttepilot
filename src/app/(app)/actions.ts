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
  inviteFriend,
  inviteOwner,
  removeFriendInvitation,
} from "@/lib/services/invitations";
import { addCabinPhotos, makeCoverPhoto, removeCabinPhoto } from "@/lib/services/photos";
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
  redirect(`/mine-hytter/${cabinId}`);
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

export async function inviteFriendAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await inviteFriend(viewer, text(formData, "cabinId"), text(formData, "email"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return { ok: "Invitasjonen er sendt." };
}

export async function removeFriendAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await removeFriendInvitation(viewer, text(formData, "invitationId"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return undefined;
}

export async function inviteOwnerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await inviteOwner(viewer, text(formData, "email"));
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  return { ok: "Invitasjonen er sendt." };
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
