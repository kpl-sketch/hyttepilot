import { PublicShell } from "@/components/public-shell";
import { ButtonLink, InviteOnlyBadge, Panel, StepNumber } from "@/components/ui";
import { CabinScene } from "@/components/cabin-scene";
import { APP_NAME, TAGLINE, WHAT_IT_IS } from "@/lib/brand";

/**
 * Eierens tre steg. Eieren er den som gjør at tjenesten sprer seg, så hvert
 * steg sier hva eieren bestemmer.
 */
const steps = [
  { title: "Legg inn hytta.", text: "Den er privat helt til du selv viser den til noen." },
  { title: "Velg hvem som får se den.", text: "Én og én, bare folk du kjenner." },
  {
    title: "Si ja eller nei.",
    text: "Du godkjenner hvert opphold. Ingen kan booke uten deg.",
  },
];

export default function LandingPage() {
  return (
    <PublicShell>
      {/* Tjenesten er lukket. Det skal stå først, før noen leser resten. */}
      <InviteOnlyBadge />
      {/* Overskriften selger ideen. Reglene kommer etterpå, som trygghet. */}
      <h1 className="max-w-[17ch] text-5xl font-semibold leading-[1.05] sm:text-6xl">
        {TAGLINE}
      </h1>
      <p className="mt-6 max-w-[52ch] text-xl text-muted">
        Mange hytter står tomme store deler av året, og få av oss liker å spørre om å låne. Med{" "}
        {APP_NAME} {WHAT_IT_IS}. Eieren bestemmer alltid.
      </p>
      <ButtonLink href="/logg-inn" className="mt-6">
        Logg inn
      </ButtonLink>

      {/* Fjell, fjord og en rød hytte med lys i vinduet. */}
      <CabinScene className="mt-12" />

      <h2 className="mt-10 text-2xl font-semibold">Slik låner du bort hytta di</h2>
      {/* role="list": Safari dropper listen for skjermlesere når punktene er skjult. */}
      <ol role="list" className="mt-5 space-y-5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <StepNumber n={index + 1} />
            <p className="max-w-[48ch] pt-1 text-lg">
              <strong className="font-semibold">{step.title}</strong> {step.text}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-5 max-w-[52ch] text-lg text-muted">
        Den som låner, betaler et bidrag til strøm og faste kostnader med Vipps. Du setter prisen.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Har du ikke hytte?</h2>
      <p className="mt-2 max-w-[52ch] text-lg">
        Da kan du likevel låne. Det eneste du trenger, er en invitasjon fra en hytteeier som kjenner
        deg.
      </p>

      {/* Å låne bort tilbake er frivillig. Derfor «kan du velge», ikke et løfte. */}
      <h2 className="mt-10 text-2xl font-semibold">Har du hytte og låner hos andre?</h2>
      <p className="mt-2 max-w-[52ch] text-lg">
        Da kan du velge å vise dem din. Det er et tilbud, ikke en plikt.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Bare folk du kjenner</h2>
      <p className="mt-2 max-w-[52ch] text-lg">
        Ingen annonser, ingen fremmede, og ingen ser hytta di uten at du har valgt dem. Venner av
        vennene dine får ikke tilgang av seg selv.
      </p>

      <Panel className="mt-10">
        <h2 className="max-w-[26ch] text-2xl font-semibold">
          Du må bli invitert av noen som allerede er med
        </h2>
        {/* Bare eiere og administratorer kan invitere. Teksten lover ikke mer. */}
        <p className="mt-2 max-w-[48ch] text-lg">
          Du kan ikke registrere deg selv.{" "}
          <strong className="font-semibold">
            Kjenner du noen som har hytte i {APP_NAME}? Be dem invitere deg.
          </strong>
        </p>
        <p className="mt-4 max-w-[48ch] text-muted">
          Har du fått en invitasjon, logger du inn med adressen den ble sendt til.
        </p>
        <ButtonLink href="/logg-inn" className="mt-3">
          Logg inn
        </ButtonLink>
      </Panel>
    </PublicShell>
  );
}
