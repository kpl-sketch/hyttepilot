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
  "mt-1 block w-full rounded-xl border border-field bg-white px-4 py-3 text-base text-ink placeholder:text-muted/70";

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
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7 ${className}`}>
      {children}
    </section>
  );
}

export function PageTitle({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-4xl leading-[1.1] sm:text-5xl sm:leading-[1.05]">{title}</h1>
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
