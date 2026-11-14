// Oppdaterer databasen til siste versjon av datamodellen (mappen drizzle/).
// Kjøres automatisk før hver bygging, og kan kjøres for hånd: npm run db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { transitionReport } from "./overgang-rapport.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL er ikke satt. Hopper over oppdatering av databasen.");
  process.exit(0);
}

// En forhåndsvisning hos Vercel skal aldri endre en database uten at noen har
// bedt om det. Skulle forhåndsvisninger ved en feil få samme DATABASE_URL som
// produksjon, ville en gren under arbeid ellers migrert produksjonsdatabasen.
// Har forhåndsvisningene sin egen database, settes MIGRATE_ON_PREVIEW=1 der.
if (process.env.VERCEL_ENV === "preview" && process.env.MIGRATE_ON_PREVIEW !== "1") {
  console.log(
    "Forhåndsvisning: databasen oppdateres ikke. Sett MIGRATE_ON_PREVIEW=1 hvis forhåndsvisningene har egen database.",
  );
  process.exit(0);
}

// Samme justering som i src/lib/db/index.ts: be uttrykkelig om verify-full.
const connectionString = url.replace(
  /([?&]sslmode=)(prefer|require|verify-ca)\b/,
  "$1verify-full",
);
const pool = new pg.Pool({ connectionString, max: 1 });
try {
  // Rett før overgangen til eksplisitt deling (0003_hyttekrets) skrives det
  // ut hvilke tilganger som faller bort. Rapporten leser bare, og en feil i
  // den stopper ikke oppdateringen.
  try {
    const { rows } = await pool.query(
      `select
         to_regclass('public.invitation') is not null as has_table,
         exists (select 1 from information_schema.columns
                 where table_name = 'invitation' and column_name = 'token') as has_token`,
    );
    if (rows[0].has_table && !rows[0].has_token) {
      console.log((await transitionReport(pool)).text);
    }
  } catch (error) {
    console.warn("Overgangsrapporten kunne ikke lages:", error?.message ?? error);
  }
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Databasen er oppdatert.");
} finally {
  await pool.end();
}
