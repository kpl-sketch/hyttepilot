import "server-only";
import { type Position, isShortMapLink, parsePosition } from "../position";

/*
 * Korte delingslenker fra Google Maps (maps.app.goo.gl/…) har ingen
 * koordinater i seg. Her følger serveren lenken til den fulle adressen hos
 * Google og leser posisjonen der. Vi følger bare videresendinger til Googles
 * egne adresser, slik at ingen kan bruke tjenesten til å hente andre sider.
 */

/** Så mange videresendinger følger vi før vi gir opp. */
const MAX_REDIRECTS = 6;

/** Så lenge venter vi på Google for hver forespørsel. */
const TIMEOUT_MS = 5000;

/** Så mye av siden leser vi når posisjonen ikke står i adressen. */
const MAX_PAGE_BYTES = 2_000_000;

/** Adressene vi følger: goo.gl og Googles egne domener, for eksempel google.no. */
function isGoogleHost(host: string): boolean {
  const name = host.toLowerCase();
  if (name === "goo.gl" || name.endsWith(".goo.gl")) return true;
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(name);
}

/**
 * Innenfor EU sender Google ofte via en side der man godtar informasjonskapsler.
 * Den har den egentlige adressen i parameteren «continue».
 */
function unwrapConsent(url: URL): URL {
  if (!url.hostname.toLowerCase().startsWith("consent.")) return url;
  const next = url.searchParams.get("continue");
  if (!next) return url;
  try {
    return new URL(next);
  } catch {
    return url;
  }
}

const NUMBER = String.raw`(-?\d{1,3}\.\d+)`;

/** Mønstre i HTML fra Google Maps der stedet står, i den rekkefølgen de er mest presise. */
const PAGE_PATTERNS = [
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  // Kartbildet som deles på sosiale medier: center=61.23%2C10.45 eller markers=…
  new RegExp(`(?:markers|center)=${NUMBER}(?:%2C|,)${NUMBER}`, "i"),
  new RegExp(`\\[null,null,${NUMBER},${NUMBER}\\]`),
  new RegExp(`@${NUMBER},${NUMBER}`),
];

/** Finner posisjonen i HTML fra Google Maps. Eksportert for testene. */
export function positionInMapPage(html: string): Position | null {
  for (const pattern of PAGE_PATTERNS) {
    const found = pattern.exec(html);
    if (found) {
      const position = parsePosition(`${found[1]}, ${found[2]}`);
      if (position) return position;
    }
  }
  return null;
}

async function readPage(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const HEADERS = {
  // Uten et vanlig nettlesernavn svarer Google med en side uten posisjon.
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
  // Svarer på spørsmålet om informasjonskapsler, så vi slipper samtykkesiden.
  Cookie: "SOCS=CAI; CONSENT=YES+",
};

/**
 * Følger en kort delingslenke fra Google Maps og gir posisjonen den peker på.
 * Null hvis lenken ikke er en slik lenke, eller hvis vi ikke finner posisjonen.
 * `fetcher` kan byttes ut i testene.
 */
export async function resolveShortMapLink(
  link: string,
  fetcher: typeof fetch = fetch,
): Promise<Position | null> {
  const text = link.trim();
  if (!isShortMapLink(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  // Delingslenkene virker like godt med https, og vi sender aldri noe ukryptert.
  if (url.protocol === "http:") url.protocol = "https:";

  for (let step = 0; step <= MAX_REDIRECTS; step++) {
    url = unwrapConsent(url);
    if (url.protocol !== "https:" || !isGoogleHost(url.hostname)) return null;

    // Ofte står posisjonen rett i den fulle adressen.
    if (step > 0) {
      const inLink = parsePosition(url.toString());
      if (inLink) return inLink;
    }

    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: "manual",
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      return null;
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      try {
        url = new URL(location, url);
      } catch {
        return null;
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return positionInMapPage(await readPage(response));
  }
  return null;
}

/**
 * Det eieren skrev i feltet for kartposisjon, med korte delingslenker byttet
 * ut med koordinater. Alt annet kommer tilbake slik det var, så de vanlige
 * reglene for feltet gjelder etterpå.
 */
export async function expandPositionField(value: unknown): Promise<unknown> {
  if (typeof value !== "string" || !isShortMapLink(value.trim())) return value;
  const found = await resolveShortMapLink(value);
  return found ? `${found.latitude}, ${found.longitude}` : value;
}
