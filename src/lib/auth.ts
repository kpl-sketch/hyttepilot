import "server-only";
import { hkdfSync } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { logAuth } from "./auth-log";
import { APP_NAME, appUrl } from "./brand";
import { db } from "./db";
import { account, session, user, verification } from "./db/schema";
import { sendEmail } from "./email";
import { loginCodeMail } from "./emails";
import { isEmailAllowed } from "./services/invitations";

/**
 * Innlogging med engangskode på e-post, levert av Better Auth.
 *
 * Tjenesten er lukket: det sendes bare kode til adresser som er invitert,
 * og det opprettes bare bruker for slike adresser. Innloggingen kalles fra
 * serverhandlinger (se src/app/logg-inn/actions.ts). Det finnes ingen åpne
 * API-ruter for innlogging.
 */
/**
 * Nøkkelen som signerer innloggingskaker. Er BETTER_AUTH_SECRET satt, brukes
 * den. Ellers avledes nøkkelen av DATABASE_URL, som allerede er hemmelig og
 * settes automatisk av Vercel. Da er det én hemmelighet mindre å holde styr på.
 * Bytter databasen passord, må alle logge inn på nytt.
 */
function authSecret(): string | undefined {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;
  const key = hkdfSync("sha256", databaseUrl, "hyttepilot", "better-auth-secret", 32);
  return Buffer.from(key).toString("base64");
}

/**
 * I produksjon skal innloggingen aldri falle tilbake på Better Auths
 * standardnøkkel, som er lik for alle. Mangler både BETTER_AUTH_SECRET og
 * DATABASE_URL, stopper tjenesten heller enn å lage kaker som kan forfalskes.
 * Forhåndsvisninger uten database får bruke standardnøkkelen, for der finnes
 * ingen brukere å logge inn.
 */
function requiredAuthSecret(): string | undefined {
  const secret = authSecret();
  if (!secret && process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Innloggingen mangler nøkkel i produksjon. Sett BETTER_AUTH_SECRET eller DATABASE_URL.",
    );
  }
  return secret;
}

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: appUrl(),
  secret: requiredAuthSecret(),
  // Egen logg, slik at verdier fra spørringer ikke havner i loggen.
  logger: { log: logAuth },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dager
    updateAge: 60 * 60 * 24, // forlenges ved bruk, høyst én gang i døgnet
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (!(await isEmailAllowed(newUser.email))) return false;
        },
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        if (!(await isEmailAllowed(email))) return;
        await sendEmail(loginCodeMail(email, otp));
      },
    }),
    nextCookies(), // må stå sist
  ],
});
