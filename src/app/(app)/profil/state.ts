/*
 * Kaken som binder turen til LinkedIn og tilbake til nettleseren og brukeren
 * som startet den. Uten den kunne noen lure en innlogget bruker til å få et
 * fremmed bilde lagt på profilen sin.
 */

export const LINKEDIN_STATE_COOKIE = "hp_linkedin_state";

/** Så lenge har brukeren på seg til å godkjenne hos LinkedIn, i sekunder. */
export const LINKEDIN_STATE_SECONDS = 600;

/** Kaken gjelder bare under /profil, der turen starter og slutter. */
export const LINKEDIN_STATE_PATH = "/profil";

/** Verdien i kaken: den tilfeldige nøkkelen og brukeren den ble laget for. */
export function stateCookieValue(state: string, userId: string): string {
  return `${state}.${userId}`;
}
