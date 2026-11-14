"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
} from "react";
import type { FormState } from "@/lib/errors";
import { type ButtonVariant, buttonClass } from "./ui";

const PendingContext = createContext(false);

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Skjema som sender innholdet til en serverhandling og viser svaret.
 * Feltene beholder det brukeren skrev hvis serveren svarer med en feil.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnOk = false,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Tøm feltene når handlingen lykkes. */
  resetOnOk?: boolean;
  /** Spørsmål brukeren må bekrefte før skjemaet sendes. */
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnOk && state?.ok) formRef.current?.reset();
  }, [resetOnOk, state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      <PendingContext value={pending}>{children}</PendingContext>
      {state?.error && (
        <p role="alert" className="mt-3 font-medium text-barn">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-3 font-medium text-pine">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  className = "",
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  name?: string;
  value?: string;
  className?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, className)}
    >
      {children}
    </button>
  );
}
