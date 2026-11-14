import { waitUntil } from "@vercel/functions";
import { Pool, type PoolClient, type PoolConfig } from "pg";

/*
 * Tilkoblingene til databasen, tilpasset måten Vercel kjører tjenesten på.
 *
 * Vercel setter serveren på pause så snart en forespørsel er ferdig. Arbeid
 * mot databasen som da ikke er avsluttet, blir stående halvferdig: en
 * tilkobling midt i innloggingen mot databasen, eller en ledig tilkobling som
 * aldri blir lukket. Når serveren våkner minutter senere, har databasen for
 * lengst gitt opp, og det første som skjer, er feil som «Authentication timed
 * out» og «Connection terminated unexpectedly».
 *
 * Tre ting hindrer det:
 * 1. Serveren holdes våken så lenge en tilkobling er i bruk eller på vei opp.
 *    Det gjelder også arbeid Next har forlatt: når Next henter en side på
 *    forhånd, starter den spørringer uten å vente på svaret.
 * 2. Ledige tilkoblinger lukkes etter fem sekunder, og serveren holdes våken
 *    til det er gjort.
 * 3. En spørring som likevel treffer en død tilkobling, prøves på nytt når
 *    det er trygt.
 *
 * Vercel har en ferdig funksjon for punkt 2, attachDatabasePool. Den leser
 * klokka hver gang en tilkobling hentes, og det godtar ikke Next mens en side
 * lages på forhånd. Derfor gjør vi det samme selv, uten å lese klokka.
 */

/** Ber Vercel holde serveren våken til arbeidet er ferdig. Gjør ingenting lokalt. */
export type KeepAlive = (work: Promise<unknown>) => void;

/** Ledige tilkoblinger lukkes etter så lang tid, slik Vercel og Neon anbefaler. */
const IDLE_MS = 5_000;

/** Så lenge venter vi på en ny tilkobling. Databasen kan bruke litt tid på å våkne. */
const CONNECT_MS = 10_000;

/** Etter at tilkoblingen er lukket, venter vi litt til før serveren får sove. */
const CLOSE_MARGIN_MS = 100;

/** Lengste tid serveren holdes våken for én utlånt tilkobling, om den aldri leveres tilbake. */
const HOLD_LIMIT_MS = 60_000;

/** Så mange ganger prøves en spørring på nytt. Hvert forsøk rydder bort én død tilkobling. */
const RETRIES = 6;

export function createPool(config: PoolConfig, keepAlive: KeepAlive = waitUntil): Pool {
  const pool = new Pool({
    max: 5,
    idleTimeoutMillis: IDLE_MS,
    connectionTimeoutMillis: CONNECT_MS,
    ...config,
  });

  // En ledig tilkobling som brytes, melder feil på selve poolen. Uten noen som
  // lytter, ville den feilen stoppet hele serverprosessen.
  pool.on("error", (error) => {
    console.warn("En ledig databasetilkobling ble brutt:", error.message);
  });

  holdUntilClosed(pool, keepAlive);
  retryLostConnections(pool);
  return pool;
}

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

/**
 * Holder serveren våken fra en tilkobling blir bedt om, til den er levert
 * tilbake og poolen har rukket å lukke den som ledig. Det gjelder også når
 * forespørselen som ba om den, er avbrutt.
 */
function holdUntilClosed(pool: Pool, keepAlive: KeepAlive) {
  const held = new WeakMap<PoolClient, () => void>();
  const connect = pool.connect.bind(pool) as (
    callback?: ConnectCallback,
  ) => Promise<PoolClient> | void;

  pool.connect = ((callback?: ConnectCallback) => {
    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const limit = setTimeout(finish, HOLD_LIMIT_MS);
    limit.unref?.();
    void work.then(() => clearTimeout(limit));
    keepAlive(work);

    const track = (client: PoolClient | undefined) => {
      if (client) held.set(client, finish);
      else finish();
    };

    if (callback) {
      return connect((error, client, done) => {
        track(error ? undefined : client);
        callback(error, client, done);
      });
    }
    return (connect() as Promise<PoolClient>).then(
      (client) => {
        track(client);
        return client;
      },
      (error: unknown) => {
        finish();
        throw error;
      },
    );
  }) as typeof pool.connect;

  pool.on("release", (_error, client) => {
    const finish = held.get(client);
    held.delete(client);
    if (!finish) return;
    // Poolen lukker en ledig tilkobling etter idleTimeoutMillis. Blir den
    // brukt igjen før det, holder den nye brukeren serveren våken.
    const idle = pool.options.idleTimeoutMillis ?? IDLE_MS;
    setTimeout(finish, idle + CLOSE_MARGIN_MS).unref?.();
  });
}

/** Spørringer rett på poolen prøves på nytt når tilkoblingen sviktet. */
function retryLostConnections(pool: Pool) {
  const query = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  pool.query = ((...args: unknown[]) => {
    // Kall med tilbakekall brukes ikke hos oss, og går rett gjennom.
    if (args.some((arg) => typeof arg === "function")) return query(...args);
    return retry(() => query(...args) as Promise<unknown>, isRead(args[0]));
  }) as typeof pool.query;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Kjører arbeidet, og prøver på nytt hvis tilkoblingen sviktet og det er trygt.
 * Lesing kan alltid gjentas. Skriving gjentas bare når vi vet at spørringen
 * aldri nådde databasen, slik at ingenting kan bli lagret to ganger.
 */
export async function retry<T>(
  run: () => Promise<T>,
  read: boolean,
  pause: (ms: number) => Promise<void> = wait,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const failure = connectionFailure(error);
      const safe = failure === "never-ran" || (failure === "lost" && read);
      if (!safe || attempt >= RETRIES) throw error;
      await pause(attempt * 100);
    }
  }
}

/** Feil som betyr at spørringen aldri ble sendt til databasen. */
const NEVER_RAN = [
  /authentication timed out/i,
  /before secure TLS connection was established/i,
  /timeout exceeded when trying to connect/i,
  /connection terminated due to connection timeout/i,
];
const NEVER_RAN_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

/** Feil som betyr at tilkoblingen forsvant, uten at vi vet om spørringen rakk fram. */
const LOST = [/connection terminated/i, /terminating connection due to administrator command/i];
const LOST_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "57P01", // databasen avsluttet tilkoblingen
  "57P02",
  "57P03", // databasen tar ikke imot tilkoblinger akkurat nå
  "08000",
  "08003",
  "08006",
]);

/**
 * Sier om en feil skyldes tilkoblingen og ikke spørringen. «never-ran» betyr
 * at spørringen ikke ble sendt. «lost» betyr at tilkoblingen forsvant underveis.
 */
export function connectionFailure(error: unknown): "never-ran" | "lost" | null {
  if (!(error instanceof Error)) return null;
  const code = String((error as { code?: unknown }).code ?? "");
  if (NEVER_RAN.some((pattern) => pattern.test(error.message))) return "never-ran";
  if (NEVER_RAN_CODES.has(code)) return "never-ran";
  if (LOST.some((pattern) => pattern.test(error.message)) || LOST_CODES.has(code)) return "lost";
  return null;
}

/** Sier om spørringen bare leser. Lesing som låser rader, regnes som skriving. */
export function isRead(query: unknown): boolean {
  const text =
    typeof query === "string" ? query : String((query as { text?: unknown } | null)?.text ?? "");
  return /^\s*select\b/i.test(text) && !/\bfor\s+(no\s+key\s+)?(update|share|key\s+share)\b/i.test(text);
}
