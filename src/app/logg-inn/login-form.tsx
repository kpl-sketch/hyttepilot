"use client";

import { useActionState, useState } from "react";
import { buttonClass, Field, Input } from "@/components/ui";
import { type LoginState, requestCode, verifyCode } from "./actions";

/** Feltene som sier hvilken adresse innloggingen gjelder. */
function AddressFields({ state, token }: { state: LoginState; token?: string }) {
  return (
    <>
      {token && <input type="hidden" name="invitasjon" value={token} />}
      {state.invited ? (
        <input type="hidden" name="modus" value="invitert" />
      ) : (
        <input type="hidden" name="email" value={state.email} />
      )}
    </>
  );
}

export function LoginForm({
  initialEmail,
  invitation,
}: {
  initialEmail: string;
  /** Satt når brukeren kom fra en invitasjonslenke som gjelder. */
  invitation?: {
    token: string;
    inviterName: string;
    maskedEmail: string;
    kind: "cabin" | "account";
  };
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
  // Fra en invitasjon er adressen fylt ut på forhånd. Bare den som velger det,
  // skriver en annen adresse.
  const [otherAddress, setOtherAddress] = useState(false);

  if (request.step === "code" && !changeEmail) {
    const shownEmail = request.invited?.maskedEmail ?? request.email;
    return (
      <div className="max-w-sm">
        <p className="mb-6 text-muted">
          {request.invited ? (
            <>
              Vi har sendt en kode til <strong className="text-ink">{shownEmail}</strong>. Sjekk
              søppelposten hvis den ikke dukker opp.
            </>
          ) : (
            <>
              Er <strong className="text-ink">{shownEmail}</strong> invitert, ligger det en kode
              i innboksen nå. Sjekk søppelposten hvis den ikke dukker opp.
            </>
          )}
        </p>
        <form action={verifyAction} className="space-y-4">
          <AddressFields state={request} token={invitation?.token} />
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
            <AddressFields state={request} token={invitation?.token} />
            <button type="submit" disabled={requesting} className="cursor-pointer underline">
              Send ny kode
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setChangeEmail(true);
              setOtherAddress(true);
            }}
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

  const error = request.error && (
    <p role="alert" className="font-medium text-barn">
      {request.error}
    </p>
  );

  if (invitation && !otherAddress) {
    return (
      <form
        action={requestAction}
        onSubmit={() => setChangeEmail(false)}
        className="max-w-sm space-y-4"
      >
        <input type="hidden" name="invitasjon" value={invitation.token} />
        <input type="hidden" name="modus" value="invitert" />
        <p className="rounded-xl border border-line bg-surface p-4">
          <strong>{invitation.inviterName}</strong> inviterte{" "}
          <strong>{invitation.maskedEmail}</strong>. Vi sender en kode dit. Den skriver du inn
          her, så er du inne.
        </p>
        {error}
        <button type="submit" disabled={requesting} className={buttonClass("primary")}>
          Send kode til {invitation.maskedEmail}
        </button>
        <p>
          <button
            type="button"
            onClick={() => setOtherAddress(true)}
            className="cursor-pointer text-muted underline"
          >
            Bruk en annen adresse
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      action={requestAction}
      onSubmit={() => setChangeEmail(false)}
      className="max-w-sm space-y-4"
    >
      {invitation && <input type="hidden" name="invitasjon" value={invitation.token} />}
      {invitation && (
        <p className="rounded-xl border border-line bg-surface p-4">
          {invitation.kind === "cabin"
            ? `Invitasjonen fra ${invitation.inviterName} ble sendt til ${invitation.maskedEmail}. Logger du inn med en annen adresse, må ${invitation.inviterName} godkjenne deg før du ser hytta.`
            : `Invitasjonen fra ${invitation.inviterName} gjelder bare for ${invitation.maskedEmail}. Er du med fra før, kan du logge inn med adressen din.`}
        </p>
      )}
      <Field
        label="E-postadresse"
        hint={invitation ? undefined : "Bruk adressen du ble invitert med."}
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
      {error}
      <button type="submit" disabled={requesting} className={buttonClass("primary")}>
        Send meg en kode
      </button>
      {invitation && (
        <p>
          <button
            type="button"
            onClick={() => setOtherAddress(false)}
            className="cursor-pointer text-muted underline"
          >
            Bruk adressen invitasjonen ble sendt til
          </button>
        </p>
      )}
    </form>
  );
}
