"use client";

import { type ChangeEvent, startTransition, useActionState, useRef, useState } from "react";
import type { FormState } from "@/lib/errors";
import { shrink } from "./photo-picker";
import { buttonClass } from "./ui";

/**
 * Knappene på profilsiden: hent bildet fra LinkedIn, last opp et bilde, og
 * fjern bildet. Handlingene kommer fra siden (src/app/(app)/profil/actions.ts).
 * Når en handling lykkes, sender den brukeren tilbake til profilsiden med en
 * beskjed øverst. Bare feil vises her.
 *
 * Et bilde som lastes opp, forminskes i nettleseren først, slik at store
 * mobilbilder går fort, og tegnes på nytt, så opptaksdata følger ikke med.
 * Serveren beskjærer det til et kvadrat (se processProfilePhoto).
 */
export function ProfilePhotoControls({
  hasPhoto,
  startLinkedIn,
  upload,
  remove,
}: {
  hasPhoto: boolean;
  /** Sender brukeren til LinkedIn. Null når henting fra LinkedIn er slått av. */
  startLinkedIn: (() => Promise<void>) | null;
  upload: (prev: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
}) {
  const [uploadState, runUpload, uploading] = useActionState(upload, undefined);
  const [removeState, runRemove, removing] = useActionState(remove, undefined);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Bare feilen fra den siste handlingen vises.
  const [last, setLast] = useState<"upload" | "remove" | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const busy = preparing || uploading || removing;

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Tømmes, slik at det samme bildet kan velges på nytt.
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    setLast("upload");
    setPreparing(true);
    try {
      const formData = new FormData();
      formData.set("photo", await shrink(file));
      startTransition(() => runUpload(formData));
    } catch {
      setProblem("Vi klarte ikke å lese bildet. Bruk et bilde i JPG eller PNG.");
    } finally {
      setPreparing(false);
    }
  }

  function onRemove() {
    setProblem(null);
    setLast("remove");
    startTransition(() => runRemove());
  }

  const error =
    problem ?? (last === "upload" ? uploadState?.error : last === "remove" ? removeState?.error : null);
  // LinkedIn er hovedveien når den er slått på og brukeren ikke har noe bilde.
  const uploadVariant = startLinkedIn || hasPhoto ? "secondary" : "primary";

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        {startLinkedIn && (
          <form action={startLinkedIn}>
            <button
              type="submit"
              disabled={busy}
              className={buttonClass(hasPhoto ? "secondary" : "primary")}
            >
              {hasPhoto ? "Hent bildet fra LinkedIn på nytt" : "Hent bildet fra LinkedIn"}
            </button>
          </form>
        )}
        <input
          ref={chooser}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          tabIndex={-1}
          onChange={onChoose}
          data-profilbilde
        />
        <button
          type="button"
          onClick={() => chooser.current?.click()}
          disabled={busy}
          className={buttonClass(uploadVariant)}
        >
          {preparing || uploading
            ? "Laster opp …"
            : hasPhoto
              ? "Last opp et annet bilde"
              : "Last opp et bilde"}
        </button>
        {hasPhoto && (
          <button type="button" onClick={onRemove} disabled={busy} className={buttonClass("danger")}>
            {removing ? "Fjerner …" : "Fjern bildet"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 font-medium text-barn">
          {error}
        </p>
      )}
    </div>
  );
}
