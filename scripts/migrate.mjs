// Oppdaterer databasen til siste versjon av datamodellen (mappen drizzle/).
// Kjøres automatisk før hver bygging, og kan kjøres for hånd: npm run db:migrate
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL er ikke satt. Hopper over oppdatering av databasen.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Databasen er oppdatert.");
} finally {
  await pool.end();
}
