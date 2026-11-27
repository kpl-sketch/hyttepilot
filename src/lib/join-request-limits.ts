/*
 * Fristene for «Be om invitasjon» som både skjemaet og tjenestelaget bruker
 * (valgt av prosjekteier 2026-11-27). Reglene ellers ligger i
 * services/join-requests.ts. Denne filen leser ikke databasen, så sider som
 * lages ferdig under byggingen, kan bruke den.
 */

/**
 * Kvitteringen sier at den som ikke har hørt fra oss innen så mange dager,
 * ikke får plass nå. Tallet forplikter administratorene: endres det, endres
 * løftet til alle som spør.
 */
export const ANSWER_WITHIN_DAYS = 14;

/** Har noen ventet så mange dager uten svar, får administratorene én påminnelse. */
export const REMIND_AFTER_DAYS = 3;
