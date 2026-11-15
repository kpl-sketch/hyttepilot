"use client";

import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import { type ShareState, shareAction } from "@/app/(app)/actions";
import { MAX_INVITATIONS_PER_ROUND } from "@/lib/invitation-limits";
import type { InvitationResult, InvitationsPreview } from "@/lib/services/invitations";
import { buttonClass, Field, inputClass, Textarea } from "./ui";

type CabinChoice = { id: string; name: string; area: string };

/**
 * Skjema for å vise en hytte til én eller flere personer.
 *
 * Steg 1: eieren velger hytte og skriver én eller flere adresser, og kan
 *         skrive en hilsen.
 * Steg 2: eieren ser hva som skjer med hver adresse, hva mottakerne får
 *         tilgang til, hvem som ser hytta etterpå, og e-posten ord for ord.
 * Ingenting lagres eller sendes før eieren trykker på knappen i steg 2.
 * Hver adresse får sin egen invitasjon, også når flere sendes samtidig.
 *
 * Med `person` deles hytta med en som allerede er i kretsen, og e-postfeltet
 * vises ikke. Med `disclosure` ligger skjemaet bak en lenke som må åpnes.
 *
 * Skjemaet må stå på siden også etter at delingen er lagret, ellers
 * forsvinner bekreftelsen. Siden sender da en tom liste i `cabins`.
 */
export function ShareForm({
  cabins,
  person,
  disclosure,
}: {
  cabins: CabinChoice[];
  person?: { id: string; name: string };
  /** Teksten på lenken som åpner skjemaet, for eksempel et forslag om å dele tilbake. */
  disclosure?: string;
}) {
  const empty: ShareState = {
    step: "edit",
    values: { cabinId: cabins[0]?.id ?? "", email: "", personId: person?.id ?? "", message: "" },
  };
  const [state, action, pending] = useActionState(shareAction, empty);
  // «Endre» og «Inviter en til» går tilbake til skjemaet uten å spørre serveren.
  const [back, setBack] = useState<ShareState | null>(null);
  const current = back ?? state;
  const submit = (formData: FormData) => {
    setBack(null);
    action(formData);
  };

  // Når forhåndsvisningen kommer fram, flyttes fokus dit, slik at tastatur og
  // skjermleser følger med på at siden har endret seg.
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStep = useRef(current.step);
  useEffect(() => {
    if (lastStep.current !== current.step && current.step === "preview") {
      heading.current?.focus();
    }
    lastStep.current = current.step;
  }, [current.step]);

  const who = person?.name ?? "mottakeren";

  if (current.step === "sent") {
    return (
      <div className={disclosure ? "mt-3" : undefined}>
        <div role="status" className="rounded-xl bg-window p-4">
          <p className="font-semibold">{current.ok}</p>
          {current.results && (
            <ul className="mt-2 space-y-1">
              {current.results.map((result) => (
                <li key={result.email} className="break-words">
                  <span className="font-medium">{result.recipient}</span>: {resultText(result)}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!person && (
          <button
            type="button"
            onClick={() =>
              setBack({ ...empty, values: { ...empty.values, cabinId: current.values.cabinId } })
            }
            className={buttonClass("secondary", "mt-4")}
          >
            Inviter flere
          </button>
        )}
      </div>
    );
  }

  if (cabins.length === 0) return null;

  /** Legger skjemaet bak en lenke når siden har bedt om det. */
  const wrap = (form: ReactNode) =>
    disclosure ? (
      <details className="mt-3">
        <summary className="cursor-pointer font-semibold text-pine underline">{disclosure}</summary>
        <div className="mt-4">
          <p className="mb-4 max-w-[60ch] text-muted">
            Det er ditt valg. Ingenting skjer før du har sett over og bekreftet.
          </p>
          {form}
        </div>
      </details>
    ) : (
      form
    );

  if (current.step === "preview" && current.invitations) {
    const preview = current.invitations;
    const fresh = preview.recipients.filter((r) => r.status === "new");
    const blocked = preview.invalid.length > 0;
    const after = [
      ...preview.sharedWith,
      ...preview.waiting.map((email) => `${email} (invitert)`),
      ...fresh.map((r) => `${r.email} (ny)`),
    ];
    const many = fresh.length > 1;
    return wrap(
      <form action={submit} className="space-y-5">
        {Object.entries(current.values).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="step" value="send" />

        <h3 ref={heading} className="text-xl font-bold" tabIndex={-1}>
          Se over før du sender
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted">Hytte</dt>
          <dd className="font-semibold">
            {preview.cabinName}, {preview.cabinArea}
          </dd>
        </dl>

        <div>
          <h4 className="font-bold">
            {preview.recipients.length === 1 ? "Adressen" : `${preview.recipients.length} adresser`}
          </h4>
          <ul className="mt-2 space-y-2">
            {preview.recipients.map((r) => (
              <li
                key={r.email}
                className={`rounded-xl border p-3 break-words ${r.status === "new" ? "border-line bg-paper" : "border-dashed border-line text-muted"}`}
              >
                <span className="font-semibold">{r.email}</span>
                <span className="block text-sm">{recipientText(r)}</span>
              </li>
            ))}
          </ul>
          {blocked && (
            <p role="alert" className="mt-3 font-medium text-barn">
              {preview.invalid.length === 1
                ? "Dette er ikke en gyldig adresse"
                : "Dette er ikke gyldige adresser"}
              : {preview.invalid.join(", ")}. Trykk Endre og rett{" "}
              {preview.invalid.length === 1 ? "den" : "dem"} opp eller ta{" "}
              {preview.invalid.length === 1 ? "den" : "dem"} bort.
            </p>
          )}
          {!blocked && fresh.length === 0 && (
            <p role="alert" className="mt-3 font-medium text-barn">
              Ingen av adressene kan inviteres nå. Trykk Endre for å skrive andre.
            </p>
          )}
        </div>

        {fresh.length > 0 && (
          <>
            <Access who={many ? "hver av dem" : "mottakeren"} />

            <div>
              <h4 className="font-bold">Disse ser hytta etterpå</h4>
              <p className="mt-1 break-words">Du, {after.join(", ")}.</p>
            </div>

            <div>
              <h4 className="font-bold">E-posten som sendes</h4>
              <div className="mt-2 rounded-xl border border-line bg-paper p-4">
                <p className="font-semibold">{preview.mail.subject}</p>
                <p className="mt-2 text-sm whitespace-pre-line">{preview.mail.text}</p>
              </div>
              <p className="mt-2 text-sm text-muted">
                {many
                  ? "Hver mottaker får sin egen e-post med sin egen lenke. Ingen ser hvem andre som er invitert. "
                  : ""}
                Er noen med fra før, ser de hytta med en gang og får en kortere e-post om det.
              </p>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          {!blocked && fresh.length > 0 && (
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending
                ? "Sender …"
                : many
                  ? `Send ${fresh.length} invitasjoner`
                  : "Send invitasjonen"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setBack({ step: "edit", values: current.values })}
            className={buttonClass(blocked || fresh.length === 0 ? "primary" : "secondary")}
          >
            Endre
          </button>
        </div>
      </form>,
    );
  }

  if (current.step === "preview" && current.preview) {
    const preview = current.preview;
    const after = [
      ...preview.sharedWith,
      ...preview.waiting.map((email) => `${email} (invitert)`),
      `${preview.recipient} (ny)`,
    ];
    return wrap(
      <form action={submit} className="space-y-5">
        {Object.entries(current.values).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="step" value="send" />

        <h3 ref={heading} className="text-xl font-bold" tabIndex={-1}>
          Se over før du {person ? "bekrefter" : "sender"}
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted">Til</dt>
          <dd className="font-semibold break-words">{preview.recipient}</dd>
          <dt className="text-muted">Hytte</dt>
          <dd className="font-semibold">
            {preview.cabinName}, {preview.cabinArea}
          </dd>
        </dl>

        <Access who={who} />

        <div>
          <h4 className="font-bold">Disse ser hytta etterpå</h4>
          <p className="mt-1">Du, {after.join(", ")}.</p>
        </div>

        <div>
          <h4 className="font-bold">E-posten som sendes</h4>
          <div className="mt-2 rounded-xl border border-line bg-paper p-4">
            <p className="font-semibold">{preview.mail.subject}</p>
            <p className="mt-2 text-sm whitespace-pre-line">{preview.mail.text}</p>
          </div>
          {!person && (
            <p className="mt-2 text-sm text-muted">
              Er mottakeren med fra før, ser vedkommende hytta med en gang og får en kortere e-post
              om det.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {person ? `Vis ${person.name} hytta` : "Send invitasjonen"}
          </button>
          <button
            type="button"
            onClick={() => setBack({ step: "edit", values: current.values })}
            className={buttonClass("secondary")}
          >
            Endre
          </button>
        </div>
      </form>,
    );
  }

  return wrap(
    <form action={submit} className="space-y-4">
      <input type="hidden" name="step" value="preview" />
      {person && <input type="hidden" name="personId" value={person.id} />}
      {cabins.length === 1 ? (
        <input type="hidden" name="cabinId" value={cabins[0].id} />
      ) : (
        <Field label="Hvilken hytte gjelder det?" className="max-w-md">
          <select name="cabinId" defaultValue={current.values.cabinId} className={inputClass}>
            {cabins.map((cabin) => (
              <option key={cabin.id} value={cabin.id}>
                {cabin.name}, {cabin.area}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!person && (
        <Field
          label="E-postadressene til dem som skal få se hytta"
          hint={`Én eller flere, inntil ${MAX_INVITATIONS_PER_ROUND}. Skill dem med komma eller linjeskift. Hver får sin egen invitasjon.`}
          className="max-w-xl"
        >
          <Textarea
            name="email"
            rows={3}
            autoComplete="off"
            spellCheck={false}
            required
            defaultValue={current.values.email}
          />
        </Field>
      )}
      <Field
        label="Personlig hilsen"
        hint="Valgfritt. Står i e-posten og på velkomstsiden."
        className="max-w-xl"
      >
        <Textarea name="message" rows={3} maxLength={500} defaultValue={current.values.message} />
      </Field>
      {current.error && (
        <p role="alert" className="font-medium text-barn">
          {current.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        Se over før du {person ? "bekrefter" : "sender"}
      </button>
    </form>,
  );
}

/** Hva mottakeren får og ikke får, vist før eieren bekrefter. */
function Access({ who }: { who: string }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <h4 className="font-bold first-letter:uppercase">{who} får</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>se hytta, bildene, prisen og reglene dine</li>
          <li>se når hytta er ledig</li>
          <li>sende deg forespørsler, som du svarer ja eller nei på</li>
        </ul>
      </div>
      <div>
        <h4 className="font-bold first-letter:uppercase">{who} får ikke</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>adressen og nøkkelopplysningene før et opphold er betalt</li>
          <li>se andre hytter, heller ikke dine andre</li>
          <li>vise hytta di til andre</li>
        </ul>
      </div>
    </div>
  );
}

function recipientText(r: InvitationsPreview["recipients"][number]): string {
  switch (r.status) {
    case "new":
      return "Får invitasjon.";
    case "has-access":
      return `${r.name ?? "Personen"} ser hytta allerede. Hoppes over.`;
    case "waiting":
      return "Er invitert fra før og har ikke logget inn ennå. Hoppes over.";
    case "self":
      return "Din egen adresse. Hoppes over.";
  }
}

function resultText(result: InvitationResult): string {
  if (result.status === "skipped") return `hoppet over. ${result.reason ?? ""}`.trim();
  if (result.status === "shared") {
    return result.emailAccepted
      ? "ser hytta nå og har fått beskjed på e-post."
      : "ser hytta nå, men e-posten ble ikke sendt. Si gjerne fra selv.";
  }
  return result.emailAccepted
    ? "invitasjonen er sendt."
    : "invitasjonen er lagret, men e-posten ble ikke sendt. Si gjerne fra selv.";
}
