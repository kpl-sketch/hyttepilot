// Overgangsrapport: hva endres når regelen «alle hytteeiere ser alle hytter»
// fjernes, og innsyn bare følger eksplisitt deling (tabellen cabin_access)?
//
// Rapporten LESER bare. Den skriver ut antall og interne ID-er, aldri navn,
// e-postadresser eller hyttenavn, slik at den trygt kan stå i en byggelogg.
//
// Kjør for hånd:  npm run overgang:rapport
// Den kjøres også automatisk rett før migreringen 0003_hyttekrets legges på,
// se scripts/migrate.mjs.
import { pathToFileURL } from "node:url";
import pg from "pg";

/** @param {import("pg").Pool} pool */
export async function transitionReport(pool) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // Disse hadde innsyn i alle hytter etter den gamle regelen.
  const oldViewers = `
    select u.id from "user" u
    join "profile" p on p.user_id = u.id
    where p.is_owner or lower(u.email) = any($1::text[])`;

  const one = async (text, params = []) => (await pool.query(text, params)).rows;

  const [totals] = await one(
    `select
       (select count(*)::int from "profile") as members,
       (select count(*)::int from "cabin") as cabins,
       (select count(*)::int from "cabin_access") as explicit_shares,
       (select count(*)::int from "invitation" where accepted_at is null) as waiting_invitations,
       (select count(*)::int from "booking" where status in ('pending','approved','paid') and end_date >= current_date) as active_bookings,
       (select count(*)::int from (${oldViewers}) v) as old_viewers`,
    [admins],
  );

  // Innsyn som bare fantes på grunn av den gamle regelen, per hytte.
  const lost = await one(
    `select c.id as cabin_id, count(*)::int as people
     from "cabin" c
     cross join (${oldViewers}) v
     where v.id <> c.owner_id
       and not exists (
         select 1 from "cabin_access" a where a.cabin_id = c.id and a.user_id = v.id)
     group by c.id
     order by c.id`,
    [admins],
  );

  // Forespørsler og opphold der låneren ikke har en eksplisitt deling.
  // De BEHOLDES uendret. Låneren ser dem under Forespørsler, men kan ikke
  // åpne hyttesiden før eieren deler hytta.
  const bookings = await one(
    `select b.id as booking_id, b.cabin_id, b.status
     from "booking" b
     where b.status in ('pending','approved','paid') and b.end_date >= current_date
       and not exists (
         select 1 from "cabin_access" a where a.cabin_id = b.cabin_id and a.user_id = b.borrower_id)
     order by b.start_date`,
  );

  const lostTotal = lost.reduce((sum, row) => sum + row.people, 0);
  const lines = [
    "Overgangsrapport: fra «alle hytteeiere ser alle hytter» til eksplisitt deling",
    `  Medlemmer: ${totals.members}. Hytter: ${totals.cabins}.`,
    `  Hadde innsyn i alle hytter etter gammel regel: ${totals.old_viewers} personer.`,
    `  Eksplisitte delinger som beholdes uendret: ${totals.explicit_shares}.`,
    `  Invitasjoner som venter og beholdes (får 30 dagers frist): ${totals.waiting_invitations}.`,
    `  Innsyn som faller bort: ${lostTotal} (person og hytte), fordelt på ${lost.length} hytter.`,
    ...lost.map((row) => `    hytte ${row.cabin_id}: ${row.people} personer mister innsyn`),
    `  Aktive forespørsler og opphold: ${totals.active_bookings}. Ingen endres eller avlyses.`,
    `  Av disse gjelder ${bookings.length} en låner uten eksplisitt deling:`,
    ...bookings.map(
      (row) => `    forespørsel ${row.booking_id} (${row.status}) på hytte ${row.cabin_id}`,
    ),
    "  Eieren av hver hytte må selv dele på nytt med dem som fortsatt skal se den.",
  ];
  return { totals, lost, bookings, text: lines.join("\n") };
}

// Kjørt direkte: skriv rapporten for databasen i DATABASE_URL.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL er ikke satt.");
    process.exit(1);
  }
  const connectionString = url.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)\b/,
    "$1verify-full",
  );
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    console.log((await transitionReport(pool)).text);
  } finally {
    await pool.end();
  }
}
