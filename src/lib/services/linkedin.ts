import "server-only";
import { appUrl } from "../brand";
import { canFetchFromLinkedIn } from "../linkedin";

/*
 * Henter profilbildet fra LinkedIn med LinkedIns egen løsning «Sign In with
 * LinkedIn using OpenID Connect». Det er den eneste veien LinkedIn tillater:
 * medlemmet godkjenner selv hos LinkedIn, og vi får adressen til bildet.
 *
 * Reglene som gjelder her:
 *  - LinkedIn brukes bare til å hente bildet. Det er ikke en innlogging. Den
 *    som er logget inn med engangskode, får bildet lagt på sin egen profil.
 *    Ingen kan komme inn i tjenesten gjennom LinkedIn.
 *  - Vi ber bare om `openid profile` (navn og bilde). Ikke e-postadresse, og
 *    ingen rett til å lese kontakter eller publisere noe.
 *  - Av det LinkedIn svarer, bruker vi bare adressen til bildet. Nøkkelen fra
 *    LinkedIn brukes til det ene oppslaget og lagres ikke. LinkedIn-ID, navn
 *    og resten av svaret tas ikke vare på og skrives ikke i loggen.
 *  - Bildet lastes bare ned fra LinkedIns egne bildeadresser, over https, med
 *    tak på størrelse og ventetid. Vi lagrer en kopi, se setProfilePhoto.
 *  - Svikter LinkedIn, får brukeren en vanlig melding og kan laste opp et
 *    bilde selv. Ingenting annet i tjenesten avhenger av dette.
 */

/** Så lenge venter vi på LinkedIn for hver forespørsel. */
const TIMEOUT_MS = 8000;

/** Største bilde vi laster ned fra LinkedIn. */
const MAX_PICTURE_BYTES = 8_000_000;

/**
 * Sant for LinkedIns egne bildeadresser: https, og media.licdn.com eller en
 * søsteradresse under licdn.com. Eksportert for testene.
 */
export function isLinkedInPictureUrl(url: URL): boolean {
  return url.protocol === "https:" && /(^|\.)licdn\.com$/i.test(url.hostname);
}

type Endpoints = {
  authorize: string;
  token: string;
  userinfo: string;
  /** Sant når bildet ligger et sted vi laster ned fra. */
  isPictureUrl(url: URL): boolean;
};

/**
 * Adressene hos LinkedIn. Testene peker dem til en etterligning med
 * LINKEDIN_TEST_ORIGIN. Den innstillingen virker aldri i produksjon.
 */
function endpoints(): Endpoints {
  const test =
    process.env.VERCEL_ENV === "production" ? "" : (process.env.LINKEDIN_TEST_ORIGIN ?? "").trim();
  if (test) {
    const origin = new URL(test).origin;
    return {
      authorize: `${origin}/oauth/v2/authorization`,
      token: `${origin}/oauth/v2/accessToken`,
      userinfo: `${origin}/v2/userinfo`,
      isPictureUrl: (url) => url.origin === origin,
    };
  }
  return {
    authorize: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfo: "https://api.linkedin.com/v2/userinfo",
    isPictureUrl: isLinkedInPictureUrl,
  };
}

/**
 * Adressen LinkedIn sender brukeren tilbake til. Den må stå nøyaktig slik
 * under «Authorized redirect URLs» i appen hos LinkedIn.
 */
export function linkedInRedirectUri(): string {
  return `${appUrl()}/profil/linkedin`;
}

/** Adressen hos LinkedIn der brukeren godkjenner at vi får se navn og bilde. */
export function linkedInAuthorizeUrl(state: string): string {
  const url = new URL(endpoints().authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID?.trim() ?? "");
  url.searchParams.set("redirect_uri", linkedInRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile");
  return url.toString();
}

/**
 * no-photo: brukeren har ikke noe profilbilde på LinkedIn.
 * failed: LinkedIn svarte ikke som ventet. Årsaken står i loggen.
 */
export type LinkedInPhotoResult =
  | { ok: true; image: Buffer }
  | { ok: false; reason: "no-photo" | "failed" };

/** Skriver hva som gikk galt, uten koder, nøkler eller noe fra profilen. */
function failed(step: string, detail: string): LinkedInPhotoResult {
  console.error(`LinkedIn: ${step} feilet. ${detail}`);
  return { ok: false, reason: "failed" };
}

async function readLimited(response: Response): Promise<Buffer | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_PICTURE_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Bytter koden fra LinkedIn mot profilbildet. Koden kommer fra LinkedIn når
 * brukeren har godkjent, se src/app/(app)/profil/linkedin/route.ts, som også
 * sjekker at det var denne brukeren som startet. `fetcher` kan byttes ut i
 * testene.
 */
export async function fetchLinkedInPhoto(
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<LinkedInPhotoResult> {
  if (!canFetchFromLinkedIn()) return failed("oppsettet", "Nøklene mangler.");
  const at = endpoints();
  const request = (input: string | URL, init: RequestInit) =>
    fetcher(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });

  try {
    // 1. Koden byttes mot en nøkkel som bare brukes til neste oppslag.
    const tokenResponse = await request(at.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: linkedInRedirectUri(),
        client_id: process.env.LINKEDIN_CLIENT_ID?.trim() ?? "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET?.trim() ?? "",
      }),
    });
    if (!tokenResponse.ok) {
      await tokenResponse.body?.cancel().catch(() => {});
      return failed("bytte av kode", `Status ${tokenResponse.status}.`);
    }
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string" || token.access_token === "") {
      return failed("bytte av kode", "Svaret hadde ingen nøkkel.");
    }

    // 2. Oppslaget gir blant annet adressen til bildet. Bare den brukes.
    const infoResponse = await request(at.userinfo, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    });
    if (!infoResponse.ok) {
      await infoResponse.body?.cancel().catch(() => {});
      return failed("oppslag av profil", `Status ${infoResponse.status}.`);
    }
    const info = (await infoResponse.json()) as { picture?: unknown };
    if (typeof info.picture !== "string" || info.picture === "") {
      return { ok: false, reason: "no-photo" };
    }

    // 3. Bildet lastes ned, men bare fra LinkedIns egne bildeadresser.
    let pictureUrl: URL;
    try {
      pictureUrl = new URL(info.picture);
    } catch {
      return failed("nedlasting av bildet", "Adressen til bildet kunne ikke leses.");
    }
    if (!at.isPictureUrl(pictureUrl)) {
      return failed("nedlasting av bildet", `Uventet vert: ${pictureUrl.hostname}.`);
    }
    const pictureResponse = await request(pictureUrl, { redirect: "error" });
    if (!pictureResponse.ok) {
      await pictureResponse.body?.cancel().catch(() => {});
      return failed("nedlasting av bildet", `Status ${pictureResponse.status}.`);
    }
    const image = await readLimited(pictureResponse);
    if (!image || image.length === 0) {
      return failed("nedlasting av bildet", "Bildet var tomt eller for stort.");
    }
    return { ok: true, image };
  } catch (error) {
    const name = error instanceof Error ? error.name : "ukjent feil";
    return failed("forespørselen", `${name}.`);
  }
}
