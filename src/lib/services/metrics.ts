import "server-only";
import { sql } from "drizzle-orm";
import { adminEmails } from "../brand";
import { db } from "../db";
import { type Actor, UserError } from "../errors";

/*
 * Nøkkeltall for administratorene.
 *
 * Reglene som gjelder her:
 *  - Bare administratorer får tallene.
 *  - Resultatet inneholder bare antall og summer, aldri navn, adresser,
 *    hytter eller forespørsler. Siden gir altså ikke innsyn i andres hytter.
 *  - Administratorene er «frøet»: de telles ikke som medlemmer, og
 *    invitasjoner fra dem teller ikke i K-faktoren. Personer de slipper inn,
 *    er generasjon 1.
 *  - Et nytt medlem tilskrives den første invitasjonen vedkommende tok i bruk.
 *
 * K-faktor = i × c
 *   i = invitasjoner sendt av medlemmer / antall medlemmer
 *   c = nye medlemmer de har hentet inn / invitasjoner de har sendt
 * Det gir det samme som nye medlemmer hentet inn av medlemmer / antall medlemmer.
 */

/** Under dette antallet medlemmer er tallene for usikre til å konkludere. */
export const MIN_MEMBERS_FOR_CONCLUSION = 20;

/** Antall uker i ukeoversikten. */
export const WEEKS = 8;

export type PilotMetrics = {
  admins: number;
  members: number;
  membersLast7: number;
  membersLast30: number;
  membersWithCabin: number;

  invitesByMembers: number;
  invitesByMembersPending: number;
  inviters: number;
  bringers: number;
  broughtIn: number;
  i: number;
  c: number;
  k: number;
  /** K-faktor innen 14 dager, bare for medlemmer som har vært med i minst 14 dager. */
  k14: number | null;
  k14Base: number;

  gen1: number;
  gen2: number;
  gen3plus: number;
  maxGen: number;

  invitesTotal: number;
  invitesAccepted: number;
  invitesPending: number;
  invitesExpired: number;
  invitesRevoked: number;
  medianHoursToAccept: number | null;

  cabins: number;
  cabinsShared: number;
  cabinsOpen: number;
  cabinsLive: number;
  avgViewersPerSharedCabin: number | null;

  requests: number;
  requestsApproved: number;
  requestsDeclined: number;
  requestsCancelled: number;
  requestsPending: number;
  staysPaid: number;
  staysCompleted: number;
  nightsPaid: number;
  valuePaid: number;
  medianHoursToDecide: number | null;
  /** Har både lånt bort og lånt (betalte opphold begge veier). */
  reciprocal: number;
  /** Har lånt (ja eller betalt) og viser selv en hytte til noen. */
  borrowersWhoShare: number;
};

export type WeekRow = {
  /** Mandag i uka, ÅÅÅÅ-MM-DD. */
  week: string;
  newMembers: number;
  invitesSent: number;
  requests: number;
};

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Administratorene som SQL. Lagt som JSON, slik at en tom liste også virker. */
function adminCte() {
  const emails = JSON.stringify(adminEmails());
  return sql`admin_user as (
    select id from "user"
    where lower(email) in (select jsonb_array_elements_text(${emails}::jsonb))
  ),
  member as (
    select p.user_id as id, p.created_at
    from profile p
    where p.user_id not in (select id from admin_user)
  ),
  joined as (
    select distinct on (u.id) u.id as user_id, i.invited_by, i.accepted_at
    from invitation i
    join "user" u on lower(u.email) = lower(i.email)
    where i.accepted_at is not null
      and u.id in (select id from member)
    order by u.id, i.accepted_at
  )`;
}

export async function getPilotMetrics(actor: Actor): Promise<PilotMetrics> {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");

  const result = await db.execute(sql`
    with recursive ${adminCte()},
    gen as (
      select j.user_id, 1 as g from joined j
      where j.invited_by in (select id from admin_user)
      union all
      select j.user_id, gen.g + 1 from joined j join gen on j.invited_by = gen.user_id
      where gen.g < 20
    ),
    generation as (select user_id, min(g) as g from gen group by user_id),
    member_invite as (
      select * from invitation where invited_by in (select id from member)
    ),
    k14 as (
      select m.id,
        (select count(*) from joined j
          where j.invited_by = m.id
            and j.accepted_at <= m.created_at + interval '14 days') as brought
      from member m
      where m.created_at <= now() - interval '14 days'
    ),
    shared_cabin as (
      select cabin_id, count(*) as viewers from cabin_access group by cabin_id
    ),
    open_cabin as (
      select distinct cabin_id from availability where end_date > current_date
    )
    select
      (select count(*) from admin_user) as admins,
      (select count(*) from member) as members,
      (select count(*) from member where created_at > now() - interval '7 days') as members_7,
      (select count(*) from member where created_at > now() - interval '30 days') as members_30,
      (select count(distinct owner_id) from cabin where owner_id in (select id from member)) as members_with_cabin,

      (select count(*) from member_invite) as invites_by_members,
      (select count(*) from member_invite
        where accepted_at is null and revoked_at is null and expires_at > now()) as invites_by_members_pending,
      (select count(distinct invited_by) from member_invite) as inviters,
      (select count(distinct invited_by) from joined
        where invited_by in (select id from member)) as bringers,
      (select count(*) from joined where invited_by in (select id from member)) as brought_in,
      (select count(*) from k14) as k14_base,
      (select avg(brought) from k14) as k14,

      (select count(*) from generation where g = 1) as gen1,
      (select count(*) from generation where g = 2) as gen2,
      (select count(*) from generation where g >= 3) as gen3plus,
      (select coalesce(max(g), 0) from generation) as max_gen,

      (select count(*) from invitation) as invites_total,
      (select count(*) from invitation where accepted_at is not null) as invites_accepted,
      (select count(*) from invitation
        where accepted_at is null and revoked_at is null and expires_at > now()) as invites_pending,
      (select count(*) from invitation
        where accepted_at is null and revoked_at is null and expires_at <= now()) as invites_expired,
      (select count(*) from invitation where accepted_at is null and revoked_at is not null) as invites_revoked,
      (select percentile_cont(0.5) within group (
          order by extract(epoch from (accepted_at - created_at)) / 3600)
        from invitation where accepted_at is not null) as median_hours_accept,

      (select count(*) from cabin) as cabins,
      (select count(*) from shared_cabin) as cabins_shared,
      (select count(*) from open_cabin) as cabins_open,
      (select count(*) from shared_cabin s join open_cabin o using (cabin_id)) as cabins_live,
      (select avg(viewers) from shared_cabin) as avg_viewers,

      (select count(*) from booking) as requests,
      (select count(*) from booking where status in ('approved', 'paid')) as requests_approved,
      (select count(*) from booking where status = 'declined') as requests_declined,
      (select count(*) from booking where status = 'cancelled') as requests_cancelled,
      (select count(*) from booking where status = 'pending') as requests_pending,
      (select count(*) from booking where status = 'paid') as stays_paid,
      (select count(*) from booking where status = 'paid' and end_date <= current_date) as stays_completed,
      (select coalesce(sum(end_date - start_date), 0) from booking where status = 'paid') as nights_paid,
      (select coalesce(sum(total_price), 0) from booking where status = 'paid') as value_paid,
      (select percentile_cont(0.5) within group (
          order by extract(epoch from (decided_at - created_at)) / 3600)
        from booking where decided_at is not null) as median_hours_decide,
      (select count(*) from (
          select b.borrower_id from booking b where b.status = 'paid'
          intersect
          select c.owner_id from booking b join cabin c on c.id = b.cabin_id where b.status = 'paid'
        ) x) as reciprocal,
      (select count(*) from (
          select b.borrower_id from booking b where b.status in ('approved', 'paid')
          intersect
          select c.owner_id from cabin c join shared_cabin s on s.cabin_id = c.id
        ) y) as borrowers_who_share
  `);

  const r = result.rows[0] as Record<string, unknown>;
  const members = num(r.members);
  const invitesByMembers = num(r.invites_by_members);
  const broughtIn = num(r.brought_in);
  const k14Base = num(r.k14_base);

  return {
    admins: num(r.admins),
    members,
    membersLast7: num(r.members_7),
    membersLast30: num(r.members_30),
    membersWithCabin: num(r.members_with_cabin),

    invitesByMembers,
    invitesByMembersPending: num(r.invites_by_members_pending),
    inviters: num(r.inviters),
    bringers: num(r.bringers),
    broughtIn,
    i: ratio(invitesByMembers, members),
    c: ratio(broughtIn, invitesByMembers),
    k: ratio(broughtIn, members),
    k14: k14Base > 0 ? num(r.k14) : null,
    k14Base,

    gen1: num(r.gen1),
    gen2: num(r.gen2),
    gen3plus: num(r.gen3plus),
    maxGen: num(r.max_gen),

    invitesTotal: num(r.invites_total),
    invitesAccepted: num(r.invites_accepted),
    invitesPending: num(r.invites_pending),
    invitesExpired: num(r.invites_expired),
    invitesRevoked: num(r.invites_revoked),
    medianHoursToAccept: numOrNull(r.median_hours_accept),

    cabins: num(r.cabins),
    cabinsShared: num(r.cabins_shared),
    cabinsOpen: num(r.cabins_open),
    cabinsLive: num(r.cabins_live),
    avgViewersPerSharedCabin: numOrNull(r.avg_viewers),

    requests: num(r.requests),
    requestsApproved: num(r.requests_approved),
    requestsDeclined: num(r.requests_declined),
    requestsCancelled: num(r.requests_cancelled),
    requestsPending: num(r.requests_pending),
    staysPaid: num(r.stays_paid),
    staysCompleted: num(r.stays_completed),
    nightsPaid: num(r.nights_paid),
    valuePaid: num(r.value_paid),
    medianHoursToDecide: numOrNull(r.median_hours_decide),
    reciprocal: num(r.reciprocal),
    borrowersWhoShare: num(r.borrowers_who_share),
  };
}

/** Nye medlemmer, invitasjoner og forespørsler per uke, de siste ukene. Uker starter mandag, norsk tid. */
export async function getWeeklyMetrics(actor: Actor): Promise<WeekRow[]> {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
  const result = await db.execute(sql`
    with ${adminCte()},
    weeks as (
      select generate_series(
        date_trunc('week', (now() at time zone 'Europe/Oslo')) - interval '1 week' * ${WEEKS - 1},
        date_trunc('week', (now() at time zone 'Europe/Oslo')),
        interval '1 week'
      ) as start
    )
    select to_char(w.start, 'YYYY-MM-DD') as week,
      (select count(*) from member m
        where (m.created_at at time zone 'Europe/Oslo') >= w.start
          and (m.created_at at time zone 'Europe/Oslo') < w.start + interval '1 week') as new_members,
      (select count(*) from invitation i
        where (i.created_at at time zone 'Europe/Oslo') >= w.start
          and (i.created_at at time zone 'Europe/Oslo') < w.start + interval '1 week') as invites_sent,
      (select count(*) from booking b
        where (b.created_at at time zone 'Europe/Oslo') >= w.start
          and (b.created_at at time zone 'Europe/Oslo') < w.start + interval '1 week') as requests
    from weeks w
    order by w.start
  `);
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    week: String(row.week),
    newMembers: num(row.new_members),
    invitesSent: num(row.invites_sent),
    requests: num(row.requests),
  }));
}
