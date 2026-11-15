import "server-only";
import { type Actor, UserError } from "../errors";

/**
 * Et forslag i feltet «Hvor ligger hytta?». Plasseringen kommer fra Kartverket.
 *
 * - `label`: det eieren ser i listen, og det som står i feltet etter valget.
 * - `detail`: linjen under, for eksempel «Fjell i Øyer».
 * - `area`: det andre ser før lånet er betalt, for eksempel «Hafjell».
 * - `address`: adressen låneren får når lånet er betalt. Tom for stedsnavn.
 */
export type AddressSuggestion = {
  kind: "adresse" | "sted";
  label: string;
  detail: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Satt for treff utenfor Norge. Da viser kartet OpenStreetMap. */
  abroad?: true;
};

/**
 * Kartverkets åpne adressesøk (matrikkelen). Gratis og uten nøkkel. Adressen
 * kan byttes med ADDRESS_SEARCH_URL, som testene bruker.
 */
const DEFAULT_URL = "https://ws.geonorge.no/adresser/v1/sok";

const SMALL_WORDS = new Set(["i", "på", "og", "ved", "under"]);

/** Kartverket skriver poststed med store bokstaver: «MO I RANA» blir «Mo i Rana». */
function placeName(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word)
        ? word
        : word.replace(/(^|-)(\p{L})/gu, (_, dash: string, letter: string) => dash + letter.toUpperCase()),
    )
    .join(" ");
}

/** Så mange forslag vises i skjemaet. */
const SHOWN = 6;

/** Vi henter flere treff enn vi viser, og legger de som ligner mest på søket, først. */
const FETCHED = 20;

type Found = AddressSuggestion & { street: string };

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Kartverket søker i nesten alle felt, så «Storgata 1» kan gi Storgata 61 før
 * Storgata 1. Her kommer adresser som står i søket først, deretter adresser
 * som begynner med søket, og til slutt resten i den rekkefølgen de kom.
 */
function rank(found: Found[], search: string): AddressSuggestion[] {
  const typed = search.toLowerCase();
  const score = (street: string) => {
    const name = street.toLowerCase();
    if (typed === name || typed.startsWith(`${name} `)) return 0;
    if (name.startsWith(typed)) return 1;
    return 2;
  };
  return found
    .map((item, index) => ({ item, index, score: score(item.street) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, SHOWN)
    .map(({ item }) => {
      const { street, ...suggestion } = item;
      void street;
      return suggestion;
    });
}

/** Plukker ut det vi trenger av svaret, og tåler at felt mangler. */
function toSuggestions(data: unknown): Found[] {
  const list = (data as { adresser?: unknown } | null)?.adresser;
  if (!Array.isArray(list)) return [];
  const suggestions: Found[] = [];
  const seen = new Set<string>();
  for (const item of list as Record<string, unknown>[]) {
    const street = typeof item?.adressetekst === "string" ? item.adressetekst.trim() : "";
    const point = item?.representasjonspunkt as { lat?: unknown; lon?: unknown } | undefined;
    const latitude = Number(point?.lat);
    const longitude = Number(point?.lon);
    if (!street || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (point?.lat === null || point?.lon === null) continue;

    const zip = typeof item.postnummer === "string" ? item.postnummer : "";
    const town = typeof item.poststed === "string" ? placeName(item.poststed) : "";
    const municipality = typeof item.kommunenavn === "string" ? placeName(item.kommunenavn) : "";
    // En hytte uten gateadresse har ofte bare gårds- og bruksnummer, «107/1».
    const property =
      item.objtype === "Matrikkeladresse" && Number.isInteger(item.gardsnummer)
        ? `Gnr. ${item.gardsnummer}${Number.isInteger(item.bruksnummer) ? `, bnr. ${item.bruksnummer}` : ""}`
        : "";
    const label = [property || street, [zip, town].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    if (seen.has(label)) continue;
    seen.add(label);
    const kind = property ? "Eiendom" : "Adresse";
    suggestions.push({
      kind: "adresse",
      street,
      label,
      detail: municipality ? `${kind} i ${municipality}` : kind,
      area: town || municipality,
      address: label,
      latitude: round(latitude),
      longitude: round(longitude),
    });
  }
  return suggestions;
}

async function lookUp(search: string): Promise<Found[]> {
  const url = new URL(process.env.ADDRESS_SEARCH_URL || DEFAULT_URL);
  url.searchParams.set("sok", search);
  url.searchParams.set("treffPerSide", String(FETCHED));
  url.searchParams.set("side", "0");
  url.searchParams.set("asciiKompatibel", "true");
  url.searchParams.set("utkoordsys", "4258");
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`Adressesøket svarte ${response.status}.`);
  return toSuggestions(await response.json());
}

/**
 * Forslag til adresser mens eieren skriver. Bare innloggede medlemmer får
 * søke: den som kaller, har hentet `actor` med requireViewer eller getViewer.
 * Svarer adressesøket ikke, får eieren ingen forslag og skriver adressen selv.
 */
export async function searchAddresses(
  actor: Actor | null,
  query: unknown,
): Promise<AddressSuggestion[]> {
  if (!actor) throw new UserError("Logg inn for å søke etter adresser.");
  const text = searchText(query);
  if (!text) return [];
  return addressesFor(text);
}

/** Søketeksten uten jokertegn, eller null hvis den er for kort. */
function searchText(query: unknown): string | null {
  if (typeof query !== "string") return null;
  // Stjerne og spørsmålstegn er jokertegn i søket. Komma skiller bare deler av adressen.
  const text = query.replace(/[*?]/g, "").replace(/[,\s]+/g, " ").trim().slice(0, 100);
  return text.length < 3 ? null : text;
}

async function addressesFor(text: string): Promise<AddressSuggestion[]> {
  try {
    // Stjernen gjør at «Fjellvegen 1» også finner Fjellvegen 12 mens eieren skriver.
    const started = await lookUp(`${text}*`);
    return rank(started.length > 0 ? started : await lookUp(text), text);
  } catch (error) {
    console.warn("Adressesøket svarte ikke:", error instanceof Error ? error.message : error);
    return [];
  }
}

/* -------------------------------- Stedsnavn -------------------------------- */

/**
 * Kartverkets åpne stedsnavnsøk. Gir treff på steder uten adresse, som
 * «Hafjell» eller «Tisleia». Adressen kan byttes med PLACE_SEARCH_URL.
 */
const PLACE_URL = "https://ws.geonorge.no/stedsnavn/v1/navn";

/** Gatenavn kommer allerede fra adressesøket. */
const SKIPPED_TYPES = new Set(["adressenavn"]);

/** Så mange stedsnavn vises på det meste. */
const PLACES_SHOWN = 4;

function toPlaces(data: unknown): Found[] {
  const list = (data as { navn?: unknown } | null)?.navn;
  if (!Array.isArray(list)) return [];
  const places: Found[] = [];
  const seen = new Set<string>();
  for (const item of list as Record<string, unknown>[]) {
    const name = typeof item?.["skrivemåte"] === "string" ? (item["skrivemåte"] as string).trim() : "";
    const type = typeof item?.navneobjekttype === "string" ? item.navneobjekttype.trim() : "";
    if (!name || SKIPPED_TYPES.has(type.toLowerCase())) continue;
    const point = item?.representasjonspunkt as Record<string, unknown> | undefined;
    const latitude = Number(point?.nord ?? point?.lat);
    const longitude = Number(point?.["øst"] ?? point?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const municipalities = Array.isArray(item.kommuner) ? (item.kommuner as Record<string, unknown>[]) : [];
    const municipality =
      typeof municipalities[0]?.kommunenavn === "string" ? placeName(municipalities[0].kommunenavn) : "";
    const detail = [type, municipality && `i ${municipality}`].filter(Boolean).join(" ") || "Sted";
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      kind: "sted",
      street: name,
      label: name,
      detail: detail.charAt(0).toUpperCase() + detail.slice(1),
      area: name,
      address: "",
      latitude: round(latitude),
      longitude: round(longitude),
    });
  }
  return places;
}

async function placesFor(text: string): Promise<AddressSuggestion[]> {
  try {
    const url = new URL(process.env.PLACE_SEARCH_URL || PLACE_URL);
    url.searchParams.set("sok", `${text}*`);
    url.searchParams.set("treffPerSide", String(FETCHED));
    url.searchParams.set("side", "1");
    url.searchParams.set("utkoordsys", "4258");
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`Stedsnavnsøket svarte ${response.status}.`);
    return rank(toPlaces(await response.json()), text).slice(0, PLACES_SHOWN);
  } catch (error) {
    console.warn("Stedsnavnsøket svarte ikke:", error instanceof Error ? error.message : error);
    return [];
  }
}

/* ---------------------------- Utenfor Norge ------------------------------ */

/**
 * Photon er et åpent søk i OpenStreetMap, gratis ved moderat bruk. Det brukes
 * bare når Kartverket ikke finner noe, eller eieren skriver et annet land, for
 * eksempel en hytte i Sverige. Adressen kan byttes med ABROAD_SEARCH_URL.
 */
const ABROAD_URL = "https://photon.komoot.io/api/";

const COUNTRIES: Record<string, string> = {
  SE: "Sverige",
  DK: "Danmark",
  FI: "Finland",
  DE: "Tyskland",
  ES: "Spania",
  FR: "Frankrike",
  IT: "Italia",
};

/** Ord som viser at eieren leter utenfor Norge. */
const ABROAD_WORDS =
  /\b(sverige|sweden|danmark|denmark|finland|suomi|tyskland|germany|spania|spain|frankrike|france|italia|italy)\b/i;

function toAbroad(data: unknown): AddressSuggestion[] {
  const list = (data as { features?: unknown } | null)?.features;
  if (!Array.isArray(list)) return [];
  const found: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of list as Record<string, unknown>[]) {
    const p = (feature?.properties ?? {}) as Record<string, unknown>;
    const coordinates = (feature?.geometry as { coordinates?: unknown } | undefined)?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const code = typeof p.countrycode === "string" ? p.countrycode.toUpperCase() : "";
    // Norske treff kommer fra Kartverket, som er mer nøyaktig.
    if (code === "NO") continue;
    const text = (key: string) => (typeof p[key] === "string" ? (p[key] as string).trim() : "");
    const country = COUNTRIES[code] || text("country");
    const town = text("city") || text("locality") || text("district") || text("county");
    const isAddress = text("street") !== "" && text("housenumber") !== "";
    let label: string;
    if (isAddress) {
      const street = `${text("street")} ${text("housenumber")}`;
      label = [street, [text("postcode"), town].filter(Boolean).join(" "), country]
        .filter(Boolean)
        .join(", ");
    } else {
      const name = text("name");
      if (!name) continue;
      label = [name, name === town ? "" : town, country].filter(Boolean).join(", ");
    }
    if (seen.has(label)) continue;
    seen.add(label);
    found.push({
      kind: isAddress ? "adresse" : "sted",
      label,
      detail: [isAddress ? "Adresse" : "Sted", country && `i ${country}`].filter(Boolean).join(" "),
      area: isAddress ? town || country : text("name"),
      address: isAddress ? label : "",
      latitude: round(latitude),
      longitude: round(longitude),
      abroad: true,
    });
  }
  return found;
}

async function abroadFor(text: string): Promise<AddressSuggestion[]> {
  try {
    const url = new URL(process.env.ABROAD_SEARCH_URL || ABROAD_URL);
    url.searchParams.set("q", text);
    url.searchParams.set("limit", "6");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "nb,sv,da,en",
        "User-Agent": "Hyttepilot (hyttepilot.no)",
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`Søket utenfor Norge svarte ${response.status}.`);
    return toAbroad(await response.json());
  } catch (error) {
    console.warn("Søket utenfor Norge svarte ikke:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Forslag i feltet «Hvor ligger hytta?»: adresser og stedsnavn i samme liste.
 * Med tall i søket leter eieren nok etter en adresse, og da kommer adressene
 * først. Ellers kommer stedsnavnene først. Finner Kartverket ingenting, eller
 * nevner eieren et annet land, søker vi også utenfor Norge. Bare for
 * innloggede medlemmer.
 */
export async function searchLocations(
  actor: Actor | null,
  query: unknown,
): Promise<AddressSuggestion[]> {
  if (!actor) throw new UserError("Logg inn for å søke etter adresser.");
  const text = searchText(query);
  if (!text) return [];
  const abroadFirst = ABROAD_WORDS.test(text);
  if (abroadFirst) {
    const abroad = await abroadFor(text);
    if (abroad.length > 0) return abroad.slice(0, SHOWN);
  }
  const [addresses, places] = await Promise.all([addressesFor(text), placesFor(text)]);
  const ordered = /\d/.test(text) ? [...addresses, ...places] : [...places, ...addresses];
  if (ordered.length > 0 || abroadFirst) return ordered.slice(0, SHOWN);
  return (await abroadFor(text)).slice(0, SHOWN);
}
