/*
 * Henting av profilbilde fra LinkedIn: om det er slått på. Filen brukes også
 * av sider uten innlogging (personvernsiden), så den skal ikke importere
 * databasen eller tjenestelaget.
 */

/**
 * Sant når medlemmene kan hente profilbildet sitt fra LinkedIn: tjenesten er
 * registrert som app hos LinkedIn, og nøklene er satt. Uten
 * LINKEDIN_CLIENT_ID og LINKEDIN_CLIENT_SECRET vises ikke knappen, og
 * ingenting sendes til LinkedIn. Egen opplasting virker uansett.
 */
export function canFetchFromLinkedIn(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID?.trim() && process.env.LINKEDIN_CLIENT_SECRET?.trim(),
  );
}
