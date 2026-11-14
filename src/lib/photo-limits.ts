/*
 * Grensene for bilder. Filen brukes både i nettleseren og på serveren, så den
 * skal ikke importere noe som bare finnes ett av stedene.
 */

/** Så mange bilder kan én hytte ha. */
export const MAX_PHOTOS = 8;

/** Lengste side på bildet nettleseren laster opp, i punkter. */
export const UPLOAD_SIDE = 1600;

/**
 * Størrelsen nettleseren sikter mot per bilde før opplasting. Åtte bilder på
 * denne størrelsen får plass i én forespørsel, se bodySizeLimit i next.config.ts.
 */
export const UPLOAD_TARGET_BYTES = 380_000;

/** Største fil serveren tar imot per bilde. */
export const MAX_UPLOAD_BYTES = 450_000;
