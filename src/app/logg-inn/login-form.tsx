"use client";

import { useActionState, useState } from "react";
import { buttonClass, Field, Input } from "@/components/ui";
import { type LoginState, requestCode, verifyCode } from "./actions";

export function LoginForm({
  initialEmail,
  invitation,
}: {
  initialEmail: string;
  /** Satt når brukeren kom fra en invitasjonslenke. */
  invitation?: { token: string; inviterName: string; maskedEmail: string };
}) {
  const [request, requestAction, requesting] = useActionState<LoginState, FormData>(
    requestCode,
    { step: "email", email: initialEmail },
  );
  const [verify, verifyAction, verifying] = useActionState<LoginState, FormData>(
    verifyCode,
    { step: "code", email: "" },
  );
  const [changeEmail, setChangeEmail] = useState(false);

  if (request.step === "code" && !changeEmail) {
    return (
      <div className="max-w-sm">
        <p className="mb-6 text-muted">
          Er <strong className="text-ink">{request.email}</strong> invitert, ligger det en
          kode i innboksen nå. Sjekk søppelposten hvis den ikke dukker opp.
        </p>
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="email" value={request.email} />
          {invitation && <input type="hidden" name="invitasjon" value={invitation.token} />}
          <Field label="Kode fra e-posten">
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              className="text-2xl tracking-[0.3em]"
            />
          </Field>
          {verify.error && (
            <p role="alert" className="font-medium text-barn">
              {verify.error}
            </p>
          )}
          <button type="submit" disabled={verifying} className={buttonClass("primary")}>
            Logg inn
          </button>
        </form>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-muted">
          <form action={requestAction}>
            <input type="hidden" name="email" value={request.email} />
            <button type="submit" disabled={requesting} className="cursor-pointer underline">
              Send ny kode
            </button>
          </form>
          <button
            type="button"
            onClick={() => setChangeEmail(true)}
            className="cursor-pointer underline"
          >
            Bruk en annen adresse
          </button>
        </div>
        {request.error && (
          <p role="alert" className="mt-3 font-medium text-barn">
            {request.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={requestAction}
      onSubmit={() => setChangeEmail(false)}
      className="max-w-sm space-y-4"
    >
      {invitation && (
        <p className="rounded-xl border border-line bg-surface p-4">
          Du logger inn for å ta imot invitasjonen fra{" "}
          <strong>{invitation.inviterName}</strong>. Den gjelder for {invitation.maskedEmail}.
        </p>
      )}
      <Field
        label="E-postadresse"
        hint={
          invitation
            ? "Bruk adressen invitasjonen ble sendt til."
            : "Bruk adressen du ble invitert med."
        }
      >
        <Input
          type="email"
          name="email"
          defaultValue={request.email}
          autoComplete="email"
          required
          autoFocus
        />
      </Field>
      {request.error && (
        <p role="alert" className="font-medium text-barn">
          {request.error}
        </p>
      )}
      <button type="submit" disabled={requesting} className={buttonClass("primary")}>
        Send meg en kode
      </button>
    </form>
  );
}
