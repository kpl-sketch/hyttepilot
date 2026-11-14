"use client";

import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, UPLOAD_SIDE, UPLOAD_TARGET_BYTES } from "@/lib/photo-limits";
import { buttonClass } from "./ui";

type Item = { key: number; file: File; url: string };

/**
 * Lar eieren velge bilder til en hytte. Bildene forminskes i nettleseren før
 * de sendes, slik at store mobilbilder får plass i skjemaet. De ferdige
 * filene legges i et skjult filfelt og følger med når skjemaet sendes.
 */
export function PhotoPicker({
  name = "photos",
  room = MAX_PHOTOS,
  children,
}: {
  name?: string;
  /** Hvor mange bilder det er plass til. */
  room?: number;
  /** Vises når bilder er valgt og klare, for eksempel en knapp som laster dem opp. */
  children?: ReactNode;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const carrier = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const nextKey = useRef(0);

  // Det skjulte filfeltet skal alltid inneholde de ferdige bildene, i rekkefølge.
  useEffect(() => {
    if (!carrier.current) return;
    const transfer = new DataTransfer();
    for (const item of items) transfer.items.add(item.file);
    carrier.current.files = transfer.files;
  }, [items]);

  useEffect(() => {
    const form = carrier.current?.form;
    if (!form) return;
    // Skjemaet skal ikke sendes mens bildene gjøres klare: da ble de ikke med.
    const onSubmit = (event: SubmitEvent) => {
      if (!busyRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setNotice("Vent til bildene er klare, og prøv igjen.");
    };
    // Når skjemaet tømmes etter en vellykket opplasting, tømmes utvalget også.
    const onReset = () => {
      setItems((previous) => {
        for (const item of previous) URL.revokeObjectURL(item.url);
        return [];
      });
      setNotice(null);
    };
    form.addEventListener("submit", onSubmit);
    form.addEventListener("reset", onReset);
    return () => {
      form.removeEventListener("submit", onSubmit);
      form.removeEventListener("reset", onReset);
    };
  }, []);

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    // Tømmes, slik at det samme bildet kan velges på nytt etter at det er fjernet.
    event.target.value = "";
    if (chosen.length === 0) return;

    const free = Math.max(room - items.length, 0);
    const accepted = chosen.slice(0, free);
    const problems: string[] = [];
    if (accepted.length < chosen.length) {
      problems.push(
        free === 0
          ? `En hytte kan ha opptil ${MAX_PHOTOS} bilder.`
          : `En hytte kan ha opptil ${MAX_PHOTOS} bilder, så bare ${free === 1 ? "det første bildet" : `de ${free} første`} ble med.`,
      );
    }

    busyRef.current = true;
    setBusy(true);
    const ready: Item[] = [];
    for (const file of accepted) {
      try {
        const small = await shrink(file);
        ready.push({ key: nextKey.current++, file: small, url: URL.createObjectURL(small) });
      } catch {
        problems.push(`Vi klarte ikke å lese «${file.name}». Bruk et bilde i JPG eller PNG.`);
      }
    }
    setItems((previous) => [...previous, ...ready]);
    setNotice(problems.length > 0 ? problems.join(" ") : null);
    busyRef.current = false;
    setBusy(false);
  }

  function remove(key: number) {
    setItems((previous) => {
      const gone = previous.find((item) => item.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return previous.filter((item) => item.key !== key);
    });
    setNotice(null);
  }

  function makeFirst(key: number) {
    setItems((previous) => {
      const chosen = previous.find((item) => item.key === key);
      if (!chosen) return previous;
      return [chosen, ...previous.filter((item) => item.key !== key)];
    });
  }

  const full = items.length >= room;

  return (
    <div>
      <input ref={carrier} type="file" name={name} multiple hidden tabIndex={-1} />
      <input
        ref={chooser}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        tabIndex={-1}
        onChange={onChoose}
      />

      {items.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item, index) => (
            <li key={item.key}>
              {/* Forhåndsvisning av en fil i nettleseren: ingenting for Next å optimalisere. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`Valgt bilde ${index + 1} av ${items.length}`}
                className="aspect-[4/3] w-full rounded-md border border-line object-cover"
              />
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                {index === 0 ? (
                  <span className="font-semibold">Forsidebilde</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeFirst(item.key)}
                    className="cursor-pointer text-pine underline"
                  >
                    Bruk som forsidebilde
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  className="cursor-pointer text-barn underline"
                  aria-label={`Fjern valgt bilde ${index + 1}`}
                >
                  Fjern
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => chooser.current?.click()}
          disabled={busy || full}
          className={buttonClass("secondary")}
        >
          {items.length === 0 ? "Velg bilder" : "Velg flere bilder"}
        </button>
        {busy && (
          <span role="status" className="text-muted">
            Gjør klar bildene …
          </span>
        )}
        {!busy && items.length > 0 && (
          <span className="text-muted">
            {items.length === 1 ? "1 bilde valgt." : `${items.length} bilder valgt.`}
            {full && " Det er ikke plass til flere."}
          </span>
        )}
      </div>

      {notice && (
        <p role="alert" className="mt-3 font-medium text-barn">
          {notice}
        </p>
      )}

      {children && items.length > 0 && !busy && <div className="mt-4">{children}</div>}
    </div>
  );
}

/**
 * Forminsker et bilde og lagrer det som JPG. Kvaliteten senkes trinnvis til
 * filen er liten nok. Bildet tegnes på nytt, så opptaksdata følger ikke med.
 */
async function shrink(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    let side = UPLOAD_SIDE;
    let quality = 0.86;
    for (;;) {
      const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Nettleseren kan ikke tegne bildet.");
      // Hvit bunn, slik at gjennomsiktige PNG-bilder ikke blir svarte.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) throw new Error("Nettleseren kan ikke lagre bildet.");

      const smallEnough = blob.size <= UPLOAD_TARGET_BYTES;
      const cannotShrinkMore = quality <= 0.5 && side <= 800;
      if (smallEnough || cannotShrinkMore) {
        const base = file.name.replace(/\.[^.]+$/, "") || "bilde";
        return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      }
      if (quality > 0.5) quality = Math.max(0.5, quality - 0.12);
      else side -= 200;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
