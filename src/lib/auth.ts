import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
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
export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
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
