import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { type Actor, UserError } from "../errors";

/*
 * Hvilke hytter som er mest populære, for administratorene.
 *
 * Valgt av prosjekteier 2026-11-18: administratorene ser hyttens navn, sted
 * og eier sammen med antall. Det er et unntak fra D018 som bare gjelder
 * denne listen. Reglene som gjelder her:
 *  - Bare administratorer får listen.
 *  - Listen inneholder navn, sted og eierens navn, og ellers bare antall og
 *    summer. Aldri adresse, kartposisjon, Vipps-nummer, praktiske
 *    opplysninger, bilder, datoer for opphold, meldinger eller hvem som har
 *    sett, spurt om eller lånt hytta.
 *  - Hver hytte lenker til hyttesiden. Administratorene ser den slik lånerne
 *    ser den, uten å kunne spørre om lån (D028, se getVisibleCabin).
 *
 * Tjenesten logger ikke hvem som åpner en hytteside. «Ser hytta» er derfor
 * antall personer eieren har vist hytta til, ikke antall visninger.
 */

export type CabinStat = {
  id: string;
  name: string;
  area: string;
  owner: string;
  /** Personer eieren viser hytta til. */
  viewers: number;
  /** Invitasjoner til hytta som er sendt, også de som ikke er tatt i bruk. */
  invitesSent: number;
  /** Alle forespørsler, også de som er avslått eller trukket. */
  requests: number;
  requestsLast30: number;
  /** Ulike personer som har spurt om å låne. */
  askers: number;
  /** Forespørsler eieren har sagt ja til (ja eller betalt). */
  approved: number;
  staysPaid: number;
  nightsPaid: number;
  valuePaid: number;
  /** Har ledige datoer framover. */
  open: boolean;
  createdAt: Date;
};

export const CABIN_SORTS = {
  foresporsler: "Forespørsler",
  netter: "Betalte netter",
  ser: "Ser hytta",
} as const;
export type CabinSort = keyof typeof CABIN_SORTS;

export function parseCabinSort(value: unknown): CabinSort {
  return typeof value === "string" && value in CABIN_SORTS ? (value as CabinSort) : "foresporsler";
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Alle hytter med tall, sortert med den mest populære først. */
export async function getCabinStats(actor: Actor, sort: CabinSort = "foresporsler"): Promise<CabinStat[]> {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");

  const result = await db.execute(sql`
    select
      c.id, c.name, c.area, u.name as owner, c.created_at,
      (select count(*) from cabin_access a where a.cabin_id = c.id) as viewers,
      (select count(*) from invitation i where i.cabin_id = c.id) as invites_sent,
      (select count(*) from booking b where b.cabin_id = c.id) as requests,
      (select count(*) from booking b
        where b.cabin_id = c.id and b.created_at > now() - interval '30 days') as requests_30,
      (select count(distinct b.borrower_id) from booking b where b.cabin_id = c.id) as askers,
      (select count(*) from booking b
        where b.cabin_id = c.id and b.status in ('approved', 'paid')) as approved,
      (select count(*) from booking b where b.cabin_id = c.id and b.status = 'paid') as stays_paid,
      (select coalesce(sum(b.end_date - b.start_date), 0) from booking b
        where b.cabin_id = c.id and b.status = 'paid') as nights_paid,
      (select coalesce(sum(b.total_price), 0) from booking b
        where b.cabin_id = c.id and b.status = 'paid') as value_paid,
      exists (select 1 from availability av
        where av.cabin_id = c.id and av.end_date > current_date) as open
    from cabin c
    join "user" u on u.id = c.owner_id
  `);

  const rows: CabinStat[] = (result.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    area: String(r.area),
    owner: String(r.owner),
    viewers: num(r.viewers),
    invitesSent: num(r.invites_sent),
    requests: num(r.requests),
    requestsLast30: num(r.requests_30),
    askers: num(r.askers),
    approved: num(r.approved),
    staysPaid: num(r.stays_paid),
    nightsPaid: num(r.nights_paid),
    valuePaid: num(r.value_paid),
    open: r.open === true || r.open === "t",
    createdAt: new Date(String(r.created_at)),
  }));

  // Først det valgte tallet, så de andre, så eldste hytte først ved likt.
  const keys: Record<CabinSort, (keyof CabinStat)[]> = {
    foresporsler: ["requests", "nightsPaid", "viewers"],
    netter: ["nightsPaid", "requests", "viewers"],
    ser: ["viewers", "requests", "nightsPaid"],
  };
  return rows.sort((a, b) => {
    for (const key of keys[sort]) {
      const diff = (b[key] as number) - (a[key] as number);
      if (diff !== 0) return diff;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}
