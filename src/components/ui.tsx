import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { BookingStatus } from "@/lib/db/schema";

const buttonBase =
  "inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

const buttonVariants = {
  primary: "bg-barn text-white hover:bg-barn-dark",
  secondary: "border border-ink bg-surface text-ink hover:bg-paper",
  danger: "border border-barn text-barn hover:bg-barn hover:text-white",
};

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `${buttonBase} ${buttonVariants[variant]} ${extra}`;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export const inputClass =
  "mt-1 block w-full rounded-xl border border-[#d9ccbb] bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/70";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block font-semibold">{label}</span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea rows={4} {...props} className={`${inputClass} ${props.className ?? ""}`} />
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8 ${className}`}>
      {children}
    </section>
  );
}

export function PageTitle({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-tight">{title}</h1>
      {lead && <p className="mt-3 max-w-[60ch] text-lg text-muted">{lead}</p>}
    </header>
  );
}

const statusText: Record<BookingStatus, string> = {
  pending: "Venter på svar",
  approved: "Ja, venter på betaling",
  paid: "Betalt og reservert",
  declined: "Nei",
  cancelled: "Avlyst",
};

const statusStyle: Record<BookingStatus, string> = {
  pending: "bg-paper text-ink border-line",
  approved: "bg-window text-ink border-window",
  paid: "bg-pine text-white border-pine",
  declined: "bg-surface text-muted border-line",
  cancelled: "bg-surface text-muted border-line",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 text-sm font-semibold ${statusStyle[status]}`}
    >
      {statusText[status]}
    </span>
  );
}

export function Loading() {
  return (
    <p className="py-12 text-muted" role="status">
      Henter …
    </p>
  );
}

/**
 * Merket «Bare for inviterte». Ser ut som en liten invitasjon: tynn gullkant
 * og en stjerne. Stjernen er pynt, så teksten står først for skjermlesere.
 */
export function InviteOnlyBadge() {
  return (
    <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-window/70 bg-surface px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-pine">
      Bare for inviterte
      <svg viewBox="0 0 12 12" className="size-3 text-window" aria-hidden="true">
        <path d="M6 0l1.6 4.4L12 6 7.6 7.6 6 12 4.4 7.6 0 6l4.4-1.6z" fill="currentColor" />
      </svg>
    </p>
  );
}

/** Nummer foran et steg: seriff i en gullkant, som på et kort. */
export function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-window bg-surface font-display text-lg font-semibold text-pine"
    >
      {n}
    </span>
  );
}
