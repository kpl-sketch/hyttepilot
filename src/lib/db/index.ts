import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Én tilkoblingspool per serverprosess. I utvikling lagres den på globalThis,
// slik at omstart av kode ikke åpner nye tilkoblinger hver gang.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

/**
 * Databaseadressen fra Vercel sier sslmode=require. pg behandler det som
 * verify-full og advarer om at det endres i neste hovedversjon. Vi ber derfor
 * uttrykkelig om verify-full, som er det strengeste og det som gjelder i dag.
 */
function connectionString(): string | undefined {
  return process.env.DATABASE_URL?.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)\b/,
    "$1verify-full",
  );
}

const pool =
  globalForDb.pgPool ?? new Pool({ connectionString: connectionString(), max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
