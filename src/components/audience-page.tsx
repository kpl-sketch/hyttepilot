import type { ReactNode } from "react";
import { VERSIONS } from "@/lib/audiences";
import { AudienceNav } from "./audience-nav";
import { CabinScene } from "./cabin-scene";
import { PublicShell } from "./public-shell";
import { ButtonLink, InviteOnlyBadge, Panel, StepNumber } from "./ui";

export type Audience = {
  /** Hvem siden snakker til, kort. Står rett under merket. */
  forWhom: string;
  title: ReactNode;
  /** Ingressen. Skal bruke WHAT_IT_IS, så kjernesetningen står likt overalt. */
  lead: ReactNode;
  stepsTitle: string;
  steps: string[];
  /** Et ekstra avsnitt etter stegene, for det som er særlig for målgruppen. */
  extra?: { title: string; body: ReactNode };
  /** Den som har fått invitasjon, trenger innlogging, ikke beskjed om å be om en. */
  invited?: boolean;
};

/**
 * Felles oppsett for sidene /v1 til /v10. De forklarer tjenesten for hver sin
 * målgruppe, men følger samme regler som forsiden: «Bare for inviterte» først,
 * ideen før reglene, og ingen løfter om vekst eller mange hytter.
 */
export function AudiencePage({ audience, number }: { audience: Audience; number: number }) {
  const { forWhom, title, lead, stepsTitle, steps, extra, invited } = audience;
  return (
    <PublicShell belowHeader={<AudienceNav current={number} versions={VERSIONS} />}>
      {/* Tjenesten er lukket. Det skal stå først, før noen leser resten. */}
      <InviteOnlyBadge />
      <p className="mb-3 font-display text-xl italic text-barn">{forWhom}</p>
      <h1 className="max-w-[20ch] text-4xl font-semibold leading-[1.08] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-6 max-w-[52ch] text-xl text-muted">{lead}</p>

      <CabinScene className="mt-10" />

      <h2 className="mt-10 text-2xl font-semibold">{stepsTitle}</h2>
      {/* role="list": Safari dropper listen for skjermlesere når punktene er skjult. */}
      <ol role="list" className="mt-5 space-y-5">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-4">
            <StepNumber n={index + 1} />
            <p className="max-w-[48ch] pt-1 text-lg">{step}</p>
          </li>
        ))}
      </ol>

      {extra && (
        <>
          <h2 className="mt-10 text-2xl font-semibold">{extra.title}</h2>
          <p className="mt-2 max-w-[52ch] text-lg">{extra.body}</p>
        </>
      )}

      <Panel className="mt-10">
        {invited ? (
          <>
            <h2 className="max-w-[26ch] text-2xl font-semibold">
              Logg inn med adressen invitasjonen ble sendt til
            </h2>
            <p className="mt-2 max-w-[48ch] text-lg">
              Du får en kode på e-post. Du trenger ikke lage passord.
            </p>
          </>
        ) : (
          <>
            <h2 className="max-w-[26ch] text-2xl font-semibold">
              Du må bli invitert av noen som allerede er med
            </h2>
            <p className="mt-2 max-w-[48ch] text-lg">
              Du kan ikke registrere deg selv.{" "}
              <strong className="font-semibold">
                Kjenner du noen som har hytte her? Be dem invitere deg.
              </strong>
            </p>
            <p className="mt-4 max-w-[48ch] text-muted">
              Har du fått en invitasjon, logger du inn med adressen den ble sendt til.
            </p>
          </>
        )}
        <ButtonLink href="/logg-inn" className="mt-3">
          Logg inn
        </ButtonLink>
      </Panel>

      <p className="mt-10 max-w-[52ch] border-t border-line pt-6 text-lg text-muted">
        Alle lover det samme før de blir med:{" "}
        <span className="font-display text-xl italic text-ink">Jeg behandler hytta som min egen.</span>
      </p>
    </PublicShell>
  );
}
