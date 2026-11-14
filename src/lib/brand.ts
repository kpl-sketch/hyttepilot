/**
 * Tjenestens navn og kontaktadresse settes her, og bare her.
 * Navnet er et arbeidsnavn. Bytt det ved å sette NEXT_PUBLIC_APP_NAME.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Hyttepilot";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/** Adressen tjenesten ligger på, uten skråstrek til slutt. */
export function appUrl(): string {
  const explicit = process.env.BETTER_AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Forhåndsvisninger på Vercel har sin egen adresse. Lenker i e-post skal
  // peke dit, ikke til produksjon.
  if (process.env.VERCEL_ENV === "preview") {
    const preview = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (preview) return `https://${preview}`;
  }
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return "http://localhost:3000";
}

/** E-postadressene til administratorene, hentet fra ADMIN_EMAILS. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
}
