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
      <p className="mb-5 inline-block rounded-full bg-pine px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white">
        Bare for inviterte
      </p>
      <h1 className="max-w-[17ch] text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
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
            Kjenner du noen som har hytte her? Be dem invitere deg.
          </strong>
        </p>
        <p className="mt-4 max-w-[48ch] text-muted">
          Har du fått en invitasjon, logger du inn med adressen den ble sendt til.
        </p>
        <ButtonLink href="/logg-inn" className="mt-3">
          Logg inn
        </ButtonLink>
      </Panel>

      {/* Fjell, fjord og en rød hytte med lys i vinduet. Et opplyst vindu betyr
          at hytta er ledig. Samme gulfarge brukes i kalenderen. */}
      <svg
        viewBox="0 0 640 300"
        className="mt-12 w-full overflow-hidden rounded-3xl"
        role="img"
        aria-label="En rød hytte ved en fjord, med fjell bak og lys i vinduet"
      >
        <defs>
          <linearGradient id="himmel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cfe2ec" />
            <stop offset="1" stopColor="#f3f7f9" />
          </linearGradient>
          <linearGradient id="fjord" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5d8aa3" />
            <stop offset="1" stopColor="#2f5d78" />
          </linearGradient>
        </defs>
        <rect width="640" height="300" fill="url(#himmel)" />
        <path d="M0 190 L90 92 L150 140 L230 60 L320 160 L400 100 L470 150 L560 70 L640 140 L640 200 L0 200 Z" fill="#9db6c4" />
        <path d="M230 60 L254 86 L242 84 L230 92 L218 82 L208 85 Z M560 70 L582 94 L570 92 L560 100 L549 90 L540 92 Z M90 92 L108 112 L98 110 L90 116 L82 108 L74 110 Z" fill="#ffffff" />
        <path d="M0 200 L60 150 L130 185 L210 130 L300 196 L380 150 L450 188 L540 140 L640 196 L640 214 L0 214 Z" fill="#6f8fa1" />
        <rect y="206" width="640" height="94" fill="url(#fjord)" />
        <path d="M0 214 Q60 206 120 212 T240 212 T360 212 T480 212 T640 212" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
        <path d="M300 300 L300 238 Q420 214 640 226 L640 300 Z" fill="#2e4a3a" />
        <path d="M612 236 l14 -46 l14 46 z M584 238 l11 -34 l11 34 z" fill="#1f3a2c" />
        <path d="M430 236 v-34 l42 -26 l42 26 v34 z" fill="#b8312a" />
        <path d="M422 204 l50 -32 l50 32" fill="none" stroke="#1d2327" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M430 236 v-34 M514 236 v-34" stroke="#ffffff" strokeWidth="3" />
        <rect x="456" y="206" width="30" height="20" fill="#f4c04e" stroke="#ffffff" strokeWidth="3" />
        <path d="M471 206 v20" stroke="#ffffff" strokeWidth="2" />
        <rect x="492" y="172" width="9" height="20" fill="#1d2327" />
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
