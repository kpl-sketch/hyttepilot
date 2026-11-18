/**
 * Bredden på sidene. Innholdet følger skjermen, slik store bestillingstjenester
 * gjør: smal marg på mobil, bredere marg på store skjermer, og et tak på 1440
 * punkter så linjene ikke blir uendelig lange. Lange tekster holdes lesbare
 * med egen makslengde i tegn (for eksempel max-w-[60ch]), ikke med en smal side.
 */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-10 xl:px-20";

/** Rutenettet for hyttekort: ett kort på mobil, flere ved siden av hverandre jo bredere skjermen er. */
export const CARD_GRID = "grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
