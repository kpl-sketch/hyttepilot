import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink, PageTitle, Panel } from "@/components/ui";
import { APP_NAME, WHAT_IT_IS } from "@/lib/brand";

export const metadata: Metadata = { title: `Slik virker ${APP_NAME}` };

/*
 * Forklaringen for den som aldri har brukt tjenesten. Den følger veien fra
 * invitasjon til nøkkel, i samme rekkefølge som tjenesten selv. Teksten må
 * stemme med reglene i src/lib/services/, særlig bookings.ts og invitations.ts.
 */

type Step = { title: string; text: ReactNode };

/** Låneren sin vei, i den rekkefølgen den skjer. */
const borrowerSteps: Step[] = [
  {
    title: "Du får en invitasjon på e-post.",
    text: "Lenken viser bilder av hytta og området den ligger i. Den virker bare for deg.",
  },
  {
    title: "Logg inn med adressen invitasjonen ble sendt til.",
    text: "Vi sender en kode til e-posten din. Du trenger ikke passord.",
  },
  {
    title: "Lov å ta vare på hytta.",
    text: (
      <>
        Første gang fyller du inn navn og mobilnummer og gir{" "}
        <Link href="/hytteloftet" className="underline">
          Hytteløftet
        </Link>
        : du behandler hytta som din egen og følger eierens regler.
      </>
    ),
  },
  {
    title: "Velg datoer og spør.",
    text: "Kalenderen viser når hytta er ledig. Skriv gjerne en hilsen. Prisen ser du før du sender.",
  },
  {
    title: "Eieren svarer ja eller nei.",
    text: "Du får svaret på e-post. Ved ja står Vipps-nummeret og beløpet der.",
  },
  {
    title: "Betal med Vipps.",
    text: "Når eieren har sett at pengene er kommet, er oppholdet ditt. Da får du adressen og alt du trenger å vite før du drar.",
  },
];

/** Eierens vei. Hvert steg sier hva eieren bestemmer. */
const ownerSteps: Step[] = [
  {
    title: "Legg inn hytta.",
    text: "Bilder, sengeplasser, dine regler og hva et døgn koster. Ingen ser den ennå.",
  },
  {
    title: "Velg hvem som får se den.",
    text: "Én og én, med e-postadressen deres. De får en personlig invitasjon fra deg.",
  },
  {
    title: "Si ja eller nei til hver forespørsel.",
    text: "Ingen kan booke uten deg. Du kan legge ved en melding.",
  },
  {
    title: "Merk lånet som betalt.",
    text: "Når Vipps-betalingen har kommet, trykker du på knappen. Først da får låneren adressen.",
  },
];

/** Spørsmålene folk stiller før de prøver. Svarene følger reglene i koden. */
const questions: { q: string; a: ReactNode }[] = [
  {
    q: "Hvorfor ser jeg ikke adressen med en gang?",
    a: "Før du har betalt, ser du bilder og området hytta ligger i på kartet. Den nøyaktige adressen får du når eieren har bekreftet betalingen. Slik er hytta trygg for eieren.",
  },
  {
    q: "Hva koster det?",
    a: "Eieren setter prisen. Den er et bidrag til strøm og faste kostnader per døgn, og noen legger til et beløp for vask. Du ser hele summen før du sender forespørselen, og pengene går rett til eieren med Vipps.",
  },
  {
    q: "Kan jeg sende invitasjonen videre til noen andre?",
    a: "Nei. Invitasjonen gjelder bare adressen den ble sendt til. Logger noen inn med en annen adresse, ser de ingenting før eieren har sagt ja.",
  },
  {
    q: "Kan venner av vennene mine se hytta mi?",
    a: "Nei. Bare de du selv har valgt, ser hytta di. Venner av vennene dine får ikke tilgang av seg selv.",
  },
  {
    q: "Må jeg ha hytte for å være med?",
    a: "Nei. Du kan låne så lenge en hytteeier har invitert deg.",
  },
  {
    q: "Må jeg låne bort min egen hytte hvis jeg låner hos andre?",
    a: "Nei. Har du hytte, kan du velge å vise den til dem du låner hos. Det er et tilbud, ikke en plikt.",
  },
  {
    q: "Hva om planene endrer seg?",
    a: "Du kan trekke forespørselen helt til du har betalt. Etter det tar du kontakt med eieren, som kan avlyse og betale tilbake.",
  },
  {
    q: "Hva om noe går i stykker?",
    a: "Si fra til eieren samme dag og gjør opp for det. Det er en del av Hytteløftet. Dere kjenner hverandre, så dere finner ut av det sammen.",
  },
];

function Steps({ steps }: { steps: Step[] }) {
  return (
    // role="list": Safari dropper listen for skjermlesere når punktene er skjult.
    <ol role="list" className="mt-5 space-y-5">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine font-bold text-white"
          >
            {index + 1}
          </span>
          <p className="max-w-[52ch] pt-0.5 text-lg">
            <strong className="font-semibold">{step.title}</strong> {step.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default function HowItWorksPage() {
  return (
    <PublicShell memberNav>
      <PageTitle
        title={`Slik virker ${APP_NAME}`}
        lead={`I ${APP_NAME} ${WHAT_IT_IS}. Her er hele veien, fra invitasjon til nøkkel.`}
      />

      <div className="max-w-[65ch]">
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Ideen</h2>
          <p className="mt-2 text-lg">
            Mange hytter står tomme store deler av året. Samtidig har de fleste av oss venner med
            hytter vi aldri har vært på, fordi det føles rart å spørre. Her ser du når hytta er
            ledig, og du spør med et par trykk. Eieren svarer ja eller nei, uten at noen blir
            flaue.
          </p>
          <p className="mt-2 text-lg">
            {APP_NAME} er bare for inviterte. Du kommer inn når noen som har hytte her, viser deg
            sin.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight">Slik låner du en hytte</h2>
          <Steps steps={borrowerSteps} />
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight">Slik låner du bort hytta di</h2>
          <Steps steps={ownerSteps} />
          <p className="mt-5 text-lg text-muted">
            Alle som er med, kan legge inn en hytte. Den er privat til du selv viser den til noen.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight">Spørsmål folk stiller</h2>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {questions.map(({ q, a }) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-lg font-semibold">
                  {q}
                  <span
                    aria-hidden="true"
                    className="text-2xl leading-none text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-lg">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <Panel className="mt-10">
          <h2 className="max-w-[26ch] text-2xl font-bold tracking-tight">
            Har du fått en invitasjon?
          </h2>
          <p className="mt-2 max-w-[48ch] text-lg">
            Trykk på lenken i e-posten, eller logg inn med adressen invitasjonen ble sendt til.
          </p>
          <ButtonLink href="/logg-inn" className="mt-4">
            Logg inn
          </ButtonLink>
          {/* Bare eiere og administratorer kan invitere. Teksten lover ikke mer. */}
          <p className="mt-6 max-w-[48ch] text-muted">
            Ikke invitert ennå? Du kan ikke registrere deg selv. Kjenner du noen som har hytte i{" "}
            {APP_NAME}, kan du be dem invitere deg. Kjenner du ingen her, kan du{" "}
            <Link href="/be-om-invitasjon" className="underline">
              be om invitasjon
            </Link>
            .
          </p>
        </Panel>
      </div>
    </PublicShell>
  );
}
