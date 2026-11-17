import Link from "next/link";

export type PreviewStep = "invitasjon" | "innlogget";

/** Adressene til de to forhåndsvisningene av en hytte. */
export function previewHref(cabinId: string, step: PreviewStep = "invitasjon") {
  return step === "invitasjon"
    ? `/mine-hytter/${cabinId}/forhandsvisning`
    : `/hytter/${cabinId}?som=laaner`;
}

/**
 * Stripen øverst når eieren ser sin egen hytte slik de inviterte ser den.
 * Den inviterte møter hytta i to steg: invitasjonssiden før innlogging, og
 * hyttesiden etter. Eieren kan bytte mellom dem her.
 */
export function OwnerPreviewBar({
  cabinId,
  step,
}: {
  cabinId: string;
  step: PreviewStep;
}) {
  const tabs: { step: PreviewStep; label: string }[] = [
    { step: "invitasjon", label: "1. Når de åpner invitasjonen" },
    { step: "innlogget", label: "2. Når de har logget inn" },
  ];
  return (
    <section
      aria-labelledby="forhandsvisning"
      className="mb-10 rounded-2xl border-2 border-dashed border-pine bg-fjord-soft p-5"
    >
      <h2 id="forhandsvisning" className="text-lg font-bold">
        Forhåndsvisning: slik ser de du inviterer, hytta
      </h2>
      <p className="mt-1 max-w-[60ch] text-sm">
        {step === "invitasjon"
          ? "Dette ser de når de trykker på lenken i e-posten, før de har logget inn. Navn, pris, datoer og adresse vises ikke her."
          : "Dette ser de når de har logget inn. Adressen, veien og hvor nøkkelen ligger, får de først når lånet er betalt. Her kan du ikke sende forespørsler."}
      </p>
      <nav aria-label="Velg forhåndsvisning" className="mt-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.step}
            href={previewHref(cabinId, tab.step)}
            aria-current={tab.step === step ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              tab.step === step
                ? "bg-pine text-white"
                : "border border-ink bg-surface text-ink hover:bg-paper"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        <Link href={`/mine-hytter/${cabinId}`} className="ml-auto text-sm underline">
          Tilbake til hytta
        </Link>
      </nav>
    </section>
  );
}
