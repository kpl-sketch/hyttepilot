"use client";

import Link from "next/link";
import { type FormEvent, startTransition, useActionState, useEffect, useRef } from "react";
import { buttonClass, Field, Input, Textarea } from "@/components/ui";
import { type JoinRequestState, requestInvitationAction } from "./actions";

/**
 * Skjemaet der en som ikke er invitert, ber om invitasjon. Når det er sendt,
 * står kvitteringen i stedet for skjemaet. Feltene beholder det brukeren
 * skrev hvis serveren svarer med en feil.
 *
 * For den som bruker tastatur eller skjermleser: knappen gjøres ikke
 * `disabled` mens skjemaet sendes, for da mister den fokus. Når skjemaet er
 * sendt, flyttes fokus til overskriften i kvitteringen, så den blir lest opp
 * og neste Tab går videre derfra. Feilmeldingen leses opp av seg selv
 * (role="alert"), og fokus blir stående på knappen.
 */
export function RequestForm({ appName, answerDays }: { appName: string; answerDays: number }) {
  const [state, formAction, pending] = useActionState<JoinRequestState, FormData>(
    requestInvitationAction,
    {},
  );

  const receipt = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.sentTo) receipt.current?.focus();
  }, [state.sentTo]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Et trykk til mens skjemaet sendes, gjør ingenting.
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (state.sentTo) {
    return (
      <div id="kvittering" className="max-w-xl">
        <h2 ref={receipt} tabIndex={-1} className="text-2xl font-bold tracking-tight">
          Takk. Nå vet vi at du vil være med.
        </h2>
        <p className="mt-3 text-lg">
          Vi leser alt selv. Får du en invitasjon, kommer den på e-post til{" "}
          <strong className="break-words font-semibold">{state.sentTo}</strong>.
        </p>
        {/* Fristen gjør at ingen blir sittende og vente, selv om vi ikke sender e-post ved nei. */}
        <p className="mt-3 text-lg">
          Har du ikke hørt fra oss innen {answerDays} dager, har vi ikke plass nå.
        </p>
        <p className="mt-4 text-muted">
          Kjenner du noen som har hytte i {appName}? Da går det raskere å be dem invitere deg.
        </p>
        <p className="mt-6">
          <Link href="/" className="underline">
            Til forsiden
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      <Field label="Navn">
        <Input name="name" autoComplete="name" required minLength={2} maxLength={80} />
      </Field>
      <Field label="E-postadresse" hint="Hit kommer invitasjonen.">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <fieldset>
        <legend className="font-semibold">Har du hytte?</legend>
        <p className="text-sm text-muted">
          Du kan spørre uansett. Uten hytte ser du hytter først når en eier viser deg sin.
        </p>
        <div className="mt-2 flex gap-3">
          {[
            { value: "ja", label: "Ja" },
            { value: "nei", label: "Nei" },
          ].map((choice) => (
            <label
              key={choice.value}
              className="flex min-w-24 cursor-pointer items-center gap-3 rounded-xl border border-[#c9cfd2] bg-surface px-4 py-3 has-checked:border-ink has-checked:bg-paper"
            >
              <input
                type="radio"
                name="hasCabin"
                value={choice.value}
                required
                className="h-5 w-5 accent-pine"
              />
              <span className="font-semibold">{choice.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Hvem kjenner du her?" hint="Valgfritt. Eller hvordan du hørte om oss.">
        <Textarea name="note" rows={2} maxLength={300} />
      </Field>
      {/*
        Et felt mennesker ikke ser. Programmer som fyller ut alt, avslører seg.
        Navnet er valgt slik at ingen nettleser fyller det ut av seg selv.
      */}
      <div aria-hidden="true" className="hidden">
        <label>
          La dette feltet stå tomt
          <input name="la_sta_tomt" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="font-medium text-barn">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={pending}
        className={buttonClass("primary", "aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}
      >
        Be om invitasjon
      </button>
      <p className="text-sm text-muted">
        Vi lover ikke plass til alle. Vi bruker det du skriver, bare til å svare deg. Les mer
        under{" "}
        <Link href="/personvern" className="underline">
          Personvern
        </Link>
        .
      </p>
    </form>
  );
}
