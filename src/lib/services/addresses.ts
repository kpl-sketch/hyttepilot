import "server-only";
import { type Actor, UserError } from "../errors";

/** Et forslag til adresse, med plasseringen fra det offisielle adresseregisteret. */
export type AddressSuggestion = { label: string; latitude: number; longitude: number };

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

/** Plukker ut det vi trenger av svaret, og tåler at felt mangler. */
function toSuggestions(data: unknown): AddressSuggestion[] {
  const list = (data as { adresser?: unknown } | null)?.adresser;
  if (!Array.isArray(list)) return [];
  const suggestions: AddressSuggestion[] = [];
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
    const label = [street, [zip, town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (seen.has(label)) continue;
    seen.add(label);
    suggestions.push({
      label,
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
    });
  }
  return suggestions;
}

async function lookUp(search: string): Promise<AddressSuggestion[]> {
  const url = new URL(process.env.ADDRESS_SEARCH_URL || DEFAULT_URL);
  url.searchParams.set("sok", search);
  url.searchParams.set("treffPerSide", "6");
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
 * Forslag til adresser mens eieren skriver. Bare hytteeiere får søke. Svarer
 * adressesøket ikke, får eieren ingen forslag og skriver adressen selv.
 */
export async function searchAddresses(
  actor: Actor,
  query: unknown,
): Promise<AddressSuggestion[]> {
  if (!actor.isOwner) throw new UserError("Bare hytteeiere kan søke etter adresser.");
  if (typeof query !== "string") return [];
  // Stjerne og spørsmålstegn er jokertegn i søket. Komma skiller bare deler av adressen.
  const text = query.replace(/[*?]/g, "").replace(/[,\s]+/g, " ").trim().slice(0, 100);
  if (text.length < 3) return [];

  try {
    // Stjernen gjør at «Fjellvegen 1» også finner Fjellvegen 12 mens eieren skriver.
    const started = await lookUp(`${text}*`);
    return started.length > 0 ? started : await lookUp(text);
  } catch (error) {
    console.warn("Adressesøket svarte ikke:", error instanceof Error ? error.message : error);
    return [];
  }
}
