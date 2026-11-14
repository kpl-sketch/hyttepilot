import { PublicShell } from "@/components/public-shell";
import { ButtonLink, Panel } from "@/components/ui";
import { WHAT_IT_IS } from "@/lib/brand";

/** Eierens tre steg. Kontrollen kommer etter ideen, som trygghet. */
const steps = [
  "Du velger hvem som får se hytta di. Ingen andre ser den.",
  "De spør om å låne den på datoer du har åpnet. Du svarer ja eller nei hver gang.",
  "De betaler et bidrag til strøm og faste kostnader med Vipps. Du setter prisen.",
];

export default function LandingPage() {
  return (
    <PublicShell>
      {/* Tjenesten er lukket. Det skal stå først, før noen leser resten. */}
      <p className="mb-5 inline-block rounded-full bg-pine px-3.5 py-1.5 text-sm font-bold uppercase tracking-wider text-white">
        Bare for inviterte
      </p>
      <h1 className="max-w-[17ch] text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
        Lån bort hytta til folk du kjenner.{" "}
        <span className="whitespace-nowrap">Lån deres.</span>
      </h1>
      {/* Å låne bort tilbake er frivillig. Derfor «kan de velge», ikke et løfte. */}
      <p className="mt-6 max-w-[52ch] text-xl text-muted">
        Mange hytter står tomme store deler av året. Her {WHAT_IT_IS}. Låner du bort din, kan
        de velge å låne bort sin til deg.
      </p>

      <Panel className="mt-8">
        <h2 className="max-w-[26ch] text-2xl font-bold tracking-tight">
          Du må bli invitert av noen som allerede er med
        </h2>
        {/* Den som ikke er invitert, får et neste steg i stedet for en stengt dør. */}
        <p className="mt-2 max-w-[48ch] text-lg">
          Du kan ikke registrere deg selv.{" "}
          <strong className="font-semibold">
            Kjenner du noen som er med? Be dem invitere deg.
          </strong>
        </p>
        <p className="mt-4 max-w-[48ch] text-muted">
          Har du fått en invitasjon, logger du inn med adressen den ble sendt til.
        </p>
        <ButtonLink href="/logg-inn" className="mt-3">
          Logg inn
        </ButtonLink>
      </Panel>

      {/* Et opplyst vindu betyr at hytta er ledig. Samme gulfarge brukes i kalenderen. */}
      <svg
        viewBox="0 0 640 220"
        className="mt-14 w-full"
        role="img"
        aria-label="En hytte i skogen med lys i vinduet"
      >
        <path d="M0 220 L0 180 Q160 150 320 172 T640 160 L640 220 Z" fill="#163027" />
        <path d="M70 176 l22 -70 l22 70 z M118 180 l16 -52 l16 52 z M500 168 l24 -78 l24 78 z M552 170 l16 -50 l16 50 z" fill="#163027" />
        <path d="M250 172 v-58 l70 -46 l70 46 v58 z" fill="#a3271c" />
        <path d="M238 118 l82 -54 l82 54" fill="none" stroke="#13241d" strokeWidth="10" strokeLinejoin="round" />
        <rect x="296" y="120" width="48" height="34" fill="#f4c04e" />
        <path d="M320 120 v34 M296 137 h48" stroke="#a3271c" strokeWidth="4" />
        <rect x="352" y="72" width="14" height="30" fill="#13241d" />
      </svg>

      <h2 className="mt-10 text-2xl font-bold tracking-tight">Slik virker det</h2>
      {/* role="list": Safari dropper listen for skjermlesere når punktene er skjult. */}
      <ol role="list" className="mt-5 space-y-5">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine font-bold text-white"
            >
              {index + 1}
            </span>
            <p className="max-w-[48ch] pt-0.5 text-lg">{step}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-2xl font-bold tracking-tight">Har du ikke hytte?</h2>
      <p className="mt-2 max-w-[52ch] text-lg">
        Da kan du spørre om å låne av dem som viser deg hytta si. Du trenger ikke eie en hytte
        for å være med.
      </p>

      <p className="mt-10 max-w-[52ch] border-t border-line pt-6 text-lg text-muted">
        Alle lover det samme før de blir med:{" "}
        <span className="font-semibold text-ink">Jeg behandler hytta som min egen.</span>
      </p>
    </PublicShell>
  );
}
