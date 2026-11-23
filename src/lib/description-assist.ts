/*
 * Tekstforslag til beskrivelsen av en hytte: om det er slått på, og grensene.
 * Filen brukes også av sider uten innlogging (personvernsiden), så den skal
 * ikke importere databasen eller tjenestelaget.
 */

/** Så mange forslag kan én hytte få i løpet av et døgn. */
export const MAX_SUGGESTIONS_PER_DAY = 10;

/**
 * Sant når tjenesten kan foreslå tekst: nøkkelen til AI-tjenesten er satt.
 * Uten AI_GATEWAY_API_KEY vises ikke knappen, og ingenting sendes ut.
 */
export function canSuggestDescription(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}
