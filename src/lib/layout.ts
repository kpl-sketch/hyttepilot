/**
 * Bredden på sidene. Innholdet følger skjermen, slik store bestillingstjenester
 * gjør: smal marg på mobil, bredere marg på store skjermer, og et tak på 1440
 * punkter så linjene ikke blir uendelig lange. Lange tekster holdes lesbare
 * med egen makslengde i tegn (for eksempel max-w-[60ch]), ikke med en smal side.
 */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-10 xl:px-20";

/**
 * Rutenettet for hyttekort: ett kort på mobil, to på nettbrett og høyst tre
 * ved siden av hverandre. Bildene er det som gir hyttefølelsen, så kortene
 * skal være store nok til at man ser hva som er på dem.
 */
export const CARD_GRID = "grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3";
