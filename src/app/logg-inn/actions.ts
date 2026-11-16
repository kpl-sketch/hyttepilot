"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSendEmail } from "@/lib/email";
import { profile } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/errors";
import {
  claimInvitations,
  getInvitedEmail,
  isInvitationToken,
  maskEmail,
  registerAccessRequest,
} from "@/lib/services/invitations";
import { isThrottled, pruneThrottle } from "@/lib/services/login";

export type LoginState = {
  step: "email" | "code";
  /** Adressen brukeren skrev. Tom når adressen er hentet fra invitasjonen. */
  email: string;
  /**
   * Satt når adressen er hentet fra invitasjonen. Da vises den bare maskert,
   * og serveren slår den opp på nytt fra nøkkelen. En videresendt lenke røper
   * derfor ikke hele adressen.
   */
  invited?: { maskedEmail: string };
  error?: string;
};

/** Invitasjonsnøkkelen fra skjemaet, hvis den har riktig form. */
function tokenFrom(formData: FormData): string {
  const value = formData.get("invitasjon");
  return isInvitationToken(value) ? value : "";
}

/**
 * Adressen innloggingen gjelder. Med `modus=invitert` er det adressen
 * invitasjonen ble sendt til, slått opp på serveren. Ellers adressen
 * brukeren skrev.
 */
async function loginEmail(formData: FormData): Promise<{ email: string; invited: boolean } | null> {
  const token = tokenFrom(formData);
  if (token && formData.get("modus") === "invitert") {
    const email = await getInvitedEmail(token);
    return email ? { email, invited: true } : null;
  }
  const parsed = z.email().safeParse(normalizeEmail(String(formData.get("email") ?? "")));
  return parsed.success ? { email: parsed.data, invited: false } : null;
}

const TOO_MANY = "For mange forsøk. Vent et kvarter og prøv igjen.";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukjent";
}

/** Steg 1: brukeren skriver e-postadressen og ber om en kode. */
export async function requestCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const found = await loginEmail(formData);
  if (!found) {
    return {
      step: "email",
      email: "",
      error:
        formData.get("modus") === "invitert"
          ? "Invitasjonen gjelder ikke lenger. Be den som inviterte deg, om en ny."
          : "Skriv en gyldig e-postadresse.",
    };
  }
  const { email } = found;
  const token = tokenFrom(formData);
  const invited = found.invited ? { maskedEmail: maskEmail(email) } : undefined;
  const shown = found.invited ? "" : email;

  // Uten e-post kan ingen få kode. Si det rett ut i stedet for å la folk vente.
  if (!canSendEmail()) {
    return {
      step: "email",
      email: shown,
      error:
        "E-post er ikke koblet til ennå, så vi kan ikke sende innloggingskoder. Prøv igjen senere.",
    };
  }

  const limited =
    (await isThrottled(`ip:${await clientIp()}`, 30)) ||
    (await isThrottled(`e:${email}`, 5));
  if (limited) return { step: "email", email: shown, invited, error: TOO_MANY };

  // Koden sendes etter at svaret er gitt. Da tar svaret like lang tid enten
  // adressen er invitert eller ikke, og siden røper ikke hvem som er med.
  after(async () => {
    try {
      // Fra en hytteinvitasjon med en annen adresse: adressen slipper inn,
      // men ser ingenting før eieren har godkjent.
      if (token && !found.invited) await registerAccessRequest(token, email);
      await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    } catch (error) {
      console.error("Kunne ikke sende innloggingskode:", error);
    }
  });

  return { step: "code", email: shown, invited };
}

/** Steg 2: brukeren skriver koden fra e-posten. */
export async function verifyCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const found = await loginEmail(formData);
  if (!found) return { step: "email", email: "" };
  const { email } = found;
  const invited = found.invited ? { maskedEmail: maskEmail(email) } : undefined;
  const shown = found.invited ? "" : email;
  const otp = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (otp.length !== 6) {
    return { step: "code", email: shown, invited, error: "Koden har seks sifre." };
  }
  if (await isThrottled(`v:${email}`, 15)) {
    return { step: "code", email: shown, invited, error: TOO_MANY };
  }

  let userId: string;
  try {
    const result = await auth.api.signInEmailOTP({
      body: { email, otp },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch {
    return {
      step: "code",
      email: shown,
      invited,
      error: "Koden stemmer ikke eller er utløpt. Prøv igjen, eller be om en ny kode.",
    };
  }

  const [registered] = await db
    .select({ userId: profile.userId })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1);
  if (registered) await claimInvitations(userId, email);
  after(pruneThrottle);

  // Kom brukeren fra en invitasjonslenke, går veien videre dit. Nøkkelen er
  // sjekket for form, og siden den peker til, sjekker selv hvem som ser hva.
  const token = tokenFrom(formData);
  if (registered) redirect(token ? `/invitasjon/${token}` : "/krets");
  redirect(token ? `/velkommen?invitasjon=${token}` : "/velkommen");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
