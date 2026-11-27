import { PublicShell } from "@/components/public-shell";
import Link from "next/link";
import { ButtonLink, Panel } from "@/components/ui";
import { FrontPhoto } from "@/components/front-photo";
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
      {/* På stor skjerm står teksten til venstre og bildet til høyre. */}
      <div className="grid items-center gap-x-16 lg:grid-cols-[6fr_5fr]">
        <div>
          {/* Tjenesten er lukket. Det skal stå først, før noen leser resten. */}
          <p className="mb-5 inline-block rounded-full bg-pine px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white">
            Bare for inviterte
          </p>
          {/* Overskriften selger ideen. Reglene kommer etterpå, som trygghet. */}
          <h1 className="max-w-[17ch] text-5xl leading-[1.05] sm:text-6xl">
            {TAGLINE}
          </h1>
          <p className="mt-6 max-w-[52ch] text-xl text-muted">
            Mange hytter står tomme store deler av året, og få av oss liker å spørre om å låne.
            Med {APP_NAME} {WHAT_IT_IS}. Eieren bestemmer alltid.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/logg-inn">Logg inn</ButtonLink>
            <ButtonLink href="/slik-virker-det" variant="secondary">
              Slik virker det
            </ButtonLink>
          </div>
          {/* Den som ikke er invitert, skal ikke måtte lete nederst på siden. */}
          <p className="mt-4 text-lg">
            Ikke invitert ennå?{" "}
            <Link href="/be-om-invitasjon" className="font-semibold underline">
              Be om invitasjon
            </Link>
          </p>
        </div>

        {/* Et ekte bilde fra en hytte. Reglene for bildet står i komponenten. */}
        <FrontPhoto className="mx-auto mt-12 w-full max-w-xl lg:mt-0 lg:max-w-none" />
      </div>

      <h2 className="mt-14 text-3xl lg:mt-20">Slik låner du bort hytta di</h2>
      {/* role="list": Safari dropper listen for skjermlesere når punktene er skjult. */}
      <ol role="list" className="mt-6 grid gap-6 lg:grid-cols-3 lg:gap-10">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            {/* Tallet er pynt: listen er nummerert fra før. */}
            <span aria-hidden="true" className="w-7 shrink-0 font-display text-5xl leading-[0.9] text-barn">
              {index + 1}
            </span>
            <p className="max-w-[48ch] text-lg">
              <strong className="font-semibold">{step.title}</strong> {step.text}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-5 max-w-[52ch] text-lg text-muted">
        Den som låner, betaler et bidrag til strøm og faste kostnader med Vipps. Du setter prisen.
      </p>

      {/* Tre korte svar, ved siden av hverandre på stor skjerm. */}
      <div className="grid gap-x-10 lg:mt-6 lg:grid-cols-3">
        <section>
          <h2 className="mt-12 text-2xl">Har du ikke hytte?</h2>
          <p className="mt-2 max-w-[52ch] text-lg">
            Da kan du likevel låne. Det eneste du trenger, er en invitasjon fra en hytteeier som
            kjenner deg.
          </p>
        </section>

        {/* Å låne bort tilbake er frivillig. Derfor «kan du velge», ikke et løfte. */}
        <section>
          <h2 className="mt-12 text-2xl">
            Har du hytte og låner hos andre?
          </h2>
          <p className="mt-2 max-w-[52ch] text-lg">
            Da kan du velge å vise dem din. Det er et tilbud, ikke en plikt.
          </p>
        </section>

        <section>
          <h2 className="mt-12 text-2xl">Bare folk du kjenner</h2>
          <p className="mt-2 max-w-[52ch] text-lg">
            Ingen annonser, ingen fremmede, og ingen ser hytta di uten at du har valgt dem.
            Venner av vennene dine får ikke tilgang av seg selv.
          </p>
        </section>
      </div>

      <Panel className="mt-12 max-w-3xl lg:mt-20">
        <h2 className="max-w-[26ch] text-3xl leading-tight">
          Du må bli invitert av noen som allerede er med
        </h2>
        {/* Bare eiere og administratorer kan invitere. Teksten lover ikke mer. */}
        <p className="mt-2 max-w-[48ch] text-lg">
          Du kan ikke registrere deg selv.{" "}
          <strong className="font-semibold">
            Kjenner du noen som har hytte i {APP_NAME}? Be dem invitere deg.
          </strong>
        </p>
        {/*
          Den som ikke kjenner noen her, kan spørre oss. Det er ikke en
          registrering: en administrator leser og svarer på hver enkelt.
        */}
        <p className="mt-4 max-w-[48ch] text-lg">
          Kjenner du ingen her ennå? Da kan du spørre oss.
        </p>
        <ButtonLink href="/be-om-invitasjon" className="mt-3">
          Be om invitasjon
        </ButtonLink>
        <p className="mt-6 max-w-[48ch] text-muted">
          Har du fått en invitasjon, logger du inn med adressen den ble sendt til.
        </p>
        <ButtonLink href="/logg-inn" variant="secondary" className="mt-3">
          Logg inn
        </ButtonLink>
      </Panel>
    </PublicShell>
  );
}
