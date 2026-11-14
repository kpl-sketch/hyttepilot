-- Pilotmåling: virker spredningen?
--
-- Leser bare. Kjøres for hånd i databasens SQL-vindu (Neon), eller lokalt med
--   psql "$DATABASE_URL" -f scripts/pilotmaaling.sql
--
-- Tallene bygger på det tjenesten allerede lagrer. Ingen sporing er lagt til.
-- Resultatet inneholder bare antall, aldri navn eller adresser.
--
-- TESTDATA: Brukere i listen under telles ikke, verken som inviterte eller
-- som de som inviterer. Legg inn prosjekteiernes egne adresser og alle
-- testadresser før du leser tallene. Adresser som slutter på @test.local,
-- er alltid holdt utenfor. (Ikke legg ekte adresser inn i denne filen i
-- repoet. Lim dem inn i SQL-vinduet.)
--
-- Tidsvindu: 14 dager regnes fra den dagen invitasjonen ble tatt i bruk.

with test_user as (
  select id from "user"
  where email like '%@test.local'
     or email = any (array[
       'din@adresse.no'            -- bytt ut: prosjekteiere og testkontoer
     ])
),
-- Hver person som er kommet inn gjennom en invitasjon: første invitasjon som
-- ble tatt i bruk, hvem som sendte den, og når.
joined as (
  select distinct on (u.id)
    u.id as user_id, i.invited_by, i.accepted_at, i.kind
  from invitation i
  join "user" u on u.email = i.email
  where i.accepted_at is not null
    and u.id not in (select id from test_user)
  order by u.id, i.accepted_at
),
-- Generasjon: 1 = invitert av en prosjekteier eller administrator (testlisten),
-- 2 = invitert av en i generasjon 1, og så videre.
generation as (
  with recursive g as (
    select j.user_id, 1 as gen from joined j
    where j.invited_by in (select id from test_user)
    union all
    select j.user_id, g.gen + 1 from joined j join g on j.invited_by = g.user_id
    where g.gen < 10
  )
  select user_id, min(gen) as gen from g group by user_id
),
-- En reell deling: hytta er delt med minst én person og har minst én åpen
-- periode som slutter etter i dag. En tom hytteprofil teller ikke.
real_share as (
  select c.owner_id, min(greatest(a.first_shared, d.first_opened)) as shared_at
  from cabin c
  join (select cabin_id, min(created_at) as first_shared from cabin_access group by 1) a
    on a.cabin_id = c.id
  join (select cabin_id, min(created_at) as first_opened from availability
        where end_date > current_date group by 1) d
    on d.cabin_id = c.id
  group by c.owner_id
),
-- Første gang en person selv inviterte noen til sin egen hytte.
invited_on as (
  select i.invited_by as user_id, min(i.created_at) as first_invite
  from invitation i
  where i.cabin_id is not null
  group by i.invited_by
)

select 1 as nr, 'Invitasjoner sendt til en hytte (ikke fra testbrukere)' as maal,
       count(*)::text as verdi
from invitation i
where i.cabin_id is not null and i.invited_by not in (select id from test_user)
  and i.email not like '%@test.local'

union all
select 2, 'Av disse: tatt i bruk innen 14 dager',
       count(*) filter (where i.accepted_at <= i.created_at + interval '14 days')::text
from invitation i
where i.cabin_id is not null and i.invited_by not in (select id from test_user)
  and i.email not like '%@test.local'

union all
select 3, 'Inviterte som har logget inn (nevner for 4 til 7)', count(*)::text from joined

union all
select 4, 'Har registrert en hytte', count(*)::text
from joined j where exists (select 1 from cabin c where c.owner_id = j.user_id)

union all
select 5, 'Har en reell deling innen 14 dager (delt med noen og åpne datoer)', count(*)::text
from joined j join real_share r on r.owner_id = j.user_id
where r.shared_at <= j.accepted_at + interval '14 days'

union all
select 6, 'Har invitert minst én videre innen 14 dager', count(*)::text
from joined j join invited_on o on o.user_id = j.user_id
where o.first_invite <= j.accepted_at + interval '14 days'

union all
select 7, 'Har både reell deling og invitert videre innen 14 dager', count(*)::text
from joined j
join real_share r on r.owner_id = j.user_id
join invited_on o on o.user_id = j.user_id
where r.shared_at <= j.accepted_at + interval '14 days'
  and o.first_invite <= j.accepted_at + interval '14 days'

union all
select 8, 'Inviterte i generasjon 1', count(*) filter (where gen = 1)::text from generation
union all
select 9, 'Inviterte i generasjon 2 eller senere', count(*) filter (where gen >= 2)::text from generation

union all
select 10, 'Forespørsler sendt (ikke fra testbrukere)', count(*)::text
from booking b where b.borrower_id not in (select id from test_user)
union all
select 11, 'Av disse: bekreftet (eieren har sagt ja, eller betalt)',
       count(*) filter (where b.status in ('approved', 'paid'))::text
from booking b where b.borrower_id not in (select id from test_user)
union all
select 12, 'Av disse: gjennomført opphold (betalt, og avreisedagen er passert)',
       count(*) filter (where b.status = 'paid' and b.end_date <= current_date)::text
from booking b where b.borrower_id not in (select id from test_user)

order by nr;
