/** En feil med en melding som trygt kan vises til brukeren. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** Svaret et skjema får tilbake fra serveren. */
export type FormState = { error?: string; ok?: string } | undefined;

/** Gjør en feil om til et svar skjemaet kan vise. Ukjente feil logges. */
export function toFormState(error: unknown): FormState {
  if (error instanceof UserError) return { error: error.message };
  console.error(error);
  return { error: "Noe gikk galt hos oss. Prøv igjen om litt." };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Den som utfører en handling. Kommer alltid fra innloggingen, aldri fra skjemaet. */
export type Actor = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isOwner: boolean;
};
