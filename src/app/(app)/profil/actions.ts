"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/brand";
import { type FormState, toFormState } from "@/lib/errors";
import { canFetchFromLinkedIn } from "@/lib/linkedin";
import { linkedInAuthorizeUrl } from "@/lib/services/linkedin";
import { updateOwnPhone } from "@/lib/services/profile";
import { removeProfilePhoto, uploadProfilePhoto } from "@/lib/services/profile-photos";
import { requireViewer } from "@/lib/session";
import {
  LINKEDIN_STATE_COOKIE,
  LINKEDIN_STATE_PATH,
  LINKEDIN_STATE_SECONDS,
  stateCookieValue,
} from "./state";

/*
 * Handlingene på profilsiden. Brukeren hentes fra innloggingen, og reglene
 * ligger i tjenestelaget (src/lib/services/profile-photos.ts, linkedin.ts og
 * profile.ts).
 *
 * Når en handling lykkes, sendes brukeren til /profil?bilde=<utfall>, og siden
 * viser beskjeden øverst (NOTICES i page.tsx). Slik står det aldri mer enn én
 * beskjed, uansett om bildet ble hentet, lastet opp eller fjernet.
 */

/**
 * Sender brukeren til LinkedIn for å godkjenne at vi får hente profilbildet.
 * LinkedIn sender brukeren tilbake til /profil/linkedin, som henter bildet.
 */
export async function startLinkedInAction(): Promise<void> {
  const viewer = await requireViewer();
  if (!canFetchFromLinkedIn()) redirect("/profil");

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(LINKEDIN_STATE_COOKIE, stateCookieValue(state, viewer.id), {
    httpOnly: true,
    secure: appUrl().startsWith("https://"),
    // «lax»: kaken må følge med når LinkedIn sender brukeren tilbake hit.
    sameSite: "lax",
    path: LINKEDIN_STATE_PATH,
    maxAge: LINKEDIN_STATE_SECONDS,
  });
  redirect(linkedInAuthorizeUrl(state));
}

export async function uploadProfilePhotoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const file = formData.get("photo");
  try {
    await uploadProfilePhoto(viewer, file instanceof File ? file : null);
  } catch (error) {
    return toFormState(error);
  }
  // Toppmenyen viser bildet, så hele rammen hentes på nytt.
  refresh();
  redirect("/profil?bilde=lagret");
}

export async function removeProfilePhotoAction(): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await removeProfilePhoto(viewer);
  } catch (error) {
    return toFormState(error);
  }
  refresh();
  redirect("/profil?bilde=fjernet");
}

/**
 * Bytter mobilnummeret. Svaret vises under feltet, ikke øverst på siden:
 * beskjedene øverst handler om bildet.
 */
export async function updatePhoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    await updateOwnPhone(viewer, formData.get("phone"));
  } catch (error) {
    return toFormState(error);
  }
  return { ok: "Mobilnummeret er lagret." };
}
