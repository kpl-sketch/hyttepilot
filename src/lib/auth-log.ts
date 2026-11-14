/*
 * Loggen fra innloggingen. Når en spørring mot databasen feiler, tar feilen
 * med seg verdiene i spørringen, blant annet øktnøkkelen til brukeren. De skal
 * ikke stå i loggen, så her skrives bare det som trengs for å finne feilen.
 */

/** Fjerner verdiene som fulgte med en spørring. */
function withoutValues(text: string): string {
  return text.replace(/\nparams:[^\n]*/g, "\nparams: [skjult]");
}

/** Feilen med de første linjene av sporet, som viser hvor i koden den oppsto. */
function describeError(error: Error): string {
  const trace = error.stack ?? `${error.name}: ${error.message}`;
  return withoutValues(trace).split("\n").slice(0, 8).join("\n");
}

/** Gjør om det som skal logges, til tekst uten verdier fra spørringer. */
export function describeForLog(value: unknown): string {
  if (typeof value === "string") return withoutValues(value);
  if (value instanceof Error) {
    const cause = value.cause;
    if (!(cause instanceof Error)) return describeError(value);
    const code = "code" in cause && cause.code ? ` (${String(cause.code)})` : "";
    return `${describeError(value)}\nÅrsak: ${withoutValues(cause.message)}${code}`;
  }
  if (value === null || typeof value !== "object") return String(value);
  return "[objekt utelatt]";
}

export function logAuth(
  level: "error" | "warn" | "info" | "debug",
  message: string,
  ...details: unknown[]
) {
  const line = ["[Better Auth]", message, ...details].map(describeForLog).join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
