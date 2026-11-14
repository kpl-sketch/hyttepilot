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
import { claimInvitations, isInvitationToken } from "@/lib/services/invitations";
import { isThrottled, pruneThrottle } from "@/lib/services/login";

export type LoginState = {
  step: "email" | "code";
  email: string;
  error?: string;
};

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
  const parsed = z.email().safeParse(normalizeEmail(String(formData.get("email") ?? "")));
  if (!parsed.success) {
    return { step: "email", email: "", error: "Skriv en gyldig e-postadresse." };
  }
  const email = parsed.data;

  // Uten e-post kan ingen få kode. Si det rett ut i stedet for å la folk vente.
  if (!canSendEmail()) {
    return {
      step: "email",
      email,
      error:
        "E-post er ikke koblet til ennå, så vi kan ikke sende innloggingskoder. Prøv igjen senere.",
    };
  }

  const limited =
    (await isThrottled(`ip:${await clientIp()}`, 30)) ||
    (await isThrottled(`e:${email}`, 5));
  if (limited) return { step: "email", email, error: TOO_MANY };

  // Koden sendes etter at svaret er gitt. Da tar svaret like lang tid enten
  // adressen er invitert eller ikke, og siden røper ikke hvem som er med.
  after(async () => {
    try {
      await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    } catch (error) {
      console.error("Kunne ikke sende innloggingskode:", error);
    }
  });

  return { step: "code", email };
}

/** Steg 2: brukeren skriver koden fra e-posten. */
export async function verifyCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const otp = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!z.email().safeParse(email).success) return { step: "email", email: "" };
  if (otp.length !== 6) {
    return { step: "code", email, error: "Koden har seks sifre." };
  }
  if (await isThrottled(`v:${email}`, 15)) {
    return { step: "code", email, error: TOO_MANY };
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
      email,
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
  const invitasjon = formData.get("invitasjon");
  const token = isInvitationToken(invitasjon) ? invitasjon : "";
  if (registered) redirect(token ? `/invitasjon/${token}` : "/krets");
  redirect(token ? `/velkommen?invitasjon=${token}` : "/velkommen");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
