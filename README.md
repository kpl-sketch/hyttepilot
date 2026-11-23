# Hyttepilot (arbeidsnavn)

Pilot for en lukket tjeneste der hytteeiere deler hytta med folk de kjenner, til
litt over selvkost. Navnet er et arbeidsnavn og byttes ett sted: `NEXT_PUBLIC_APP_NAME`.

## Hva piloten gjør

- **Lukket innlogging.** Engangskode på e-post. Bare inviterte adresser får kode.
- **Hytteløftet.** Alle må gi løftet på velkomstsiden før de slipper inn.
- **Hytter.** Eieren legger inn hytte, pris, regler og ledige perioder.
- **Bilder.** Opptil åtte bilder per hytte, valgt når hytta legges inn eller senere.
  Det første er forsidebildet. Bildene vises bare til dem som får se hytta.
- **Tekstforslag til beskrivelsen.** Under beskrivelsesfeltet på siden for hytta
  står knappen «Foreslå tekst fra bilde og sted». En AI-tjeneste skriver et kort,
  personlig utkast ut fra forsidebildet og stedsnavnet. Utkastet legges i feltet,
  og ingenting lagres før eieren trykker «Lagre endringene». Uten bilde er knappen
  grå. Høyst ti forslag per hytte i døgnet. Slått av uten `AI_GATEWAY_API_KEY`.
- **Adresse og vei.** Eieren legger inn adressen, med forslag fra Kartverkets
  adresseregister, og en nøyaktig kartposisjon. Låneren får adressen og lenker som
  viser veien i kartet når lånet er betalt. Før det ser låneren området, med et
  kart der en sirkel på 5 km viser omtrent hvor hytta ligger.
- **Privat som utgangspunkt.** En ny hytte ser bare eieren. Eieren velger selv
  hvem som får se hver hytte. Det å eie en hytte eller være administrator gir
  ikke innsyn i andres.
- **Personlige invitasjoner.** Eieren deler én hytte med én person og ser
  mottaker, hytte, tilgang og e-posten før noe sendes. Invitasjonen gjelder i 30
  dager og kan trekkes tilbake.
- **Din hyttekrets.** Første side etter innlogging viser hyttene som er delt med
  deg, hyttene du selv deler, og menneskene du har en deling med.
- **Hvem skal få låne hytta?** Rett etter at hytta er lagt inn, kommer eieren til
  `/mine-hytter/<id>/inviter`, som bare spør om det. Invitasjonene går gjennom
  det vanlige delingsskjemaet, så eieren ser over alt før noe sendes.
- **Påminnelse før feriene.** Noen uker før vinterferien, påsken, sommerferien,
  høstferien og julen får eieren e-post hvis hytta er åpen for lån minst to
  netter i ferien uten at noen har spurt. Høyst én per ferie, ikke den første
  uka, og eieren kan slå den av på siden for hytta. Jobben
  (`/jobber/ledige-hytter`, planlagt i `vercel.json`) sjekker daglig, men sender
  bare når en ferie nærmer seg. Feriene ligger i `src/lib/holidays.ts` (foreløpig
  bare Norge, med vinter- og høstferie for Oslo og Akershus), reglene i
  `src/lib/services/reminders.ts`.
- **Forespørsler.** Låneren velger datoer i kalenderen. Eieren svarer ja eller nei.
- **Betaling.** Skjer med vanlig Vipps utenfor tjenesten. Eieren markerer «betalt»,
  og da er oppholdet reservert og adressen vises til låneren.
- **Varsler på e-post** til eier og låner i hvert steg.

Ikke med ennå: integrert Vipps, kart, vurderinger, venners venner, grupper,
husbytte, vask som tjeneste, engelsk versjon og sletting av hytter.

## Hvem kan hva

Det finnes ikke lenger egne roller for «hytteeier» og «venn». Alle som er med,
kan låne, eie og dele. Forskjellen ligger i hva som er delt med hvem.

| Hvem | Kan |
|---|---|
| Alle som er med | Se hyttene som er delt med dem, og be om å låne. Legge inn egen hytte. |
| Eieren av en hytte | Velge hvem som ser hytta, åpne datoer, svare ja eller nei, markere betalt, avlyse, slutte å dele. |
| Den en hytte er delt med | Se hytta, bildene, prisen og ledige datoer, og sende forespørsler. Kan ikke dele hytta videre. |
| Administrator (`ADMIN_EMAILS`) | Slippe en person inn i tjenesten uten å dele en hytte. Ser ellers akkurat det samme som alle andre. |

## Deling og invitasjoner

- Innsyn i en hytte følger av én ting: en rad i tabellen `cabin_access`. Den
  lages bare når eieren aktivt deler. Sjekken ligger i `getVisibleCabin` i
  `src/lib/services/cabins.ts`, og sider, bilder og forespørsler går gjennom den.
- En invitasjon (`invitation`) er personlig. Tilgangen gis til den som logger inn
  med adressen invitasjonen ble sendt til. Lenken i e-posten
  (`/invitasjon/<nøkkel>`) gir ingen tilgang alene.
- **Invitasjon med ett klikk.** Uten innlogging viser lenken hvem som låner bort
  hytta, bildene, området på kart og ideen, så lenge invitasjonen gjelder (30
  dager, ikke trukket tilbake). Lenken kan åpnes flere ganger. Navn, pris,
  datoer, adresse og nøyaktig posisjon vises ikke før innlogging. Bildene
  hentes gjennom `/invitasjon/<nøkkel>/bilder/<id>`.
- Ved innlogging fra lenken er den inviterte adressen fylt ut på forhånd, vist
  maskert. Mottakeren trenger bare å skrive koden fra e-posten.
- Logger noen inn fra lenken med en annen adresse, for eksempel fordi e-posten
  er videresendt, lagres det i `invitation_request`. Personen ser ingenting før
  eieren har godkjent under «Vis hytta til noen du kjenner». Eieren får e-post.
  Høyst fem andre adresser kan prøve seg på én invitasjon.
- Gjensidig deling er to valg. Deler Kari med Per, får Per et forslag om å dele
  tilbake. Ingenting deles før Per har sett over og bekreftet.
- Den som har fått en hytte delt med seg, kan ikke dele den videre. Venners
  venner får ingenting.
- Slutter eieren å dele, ser ikke personen hytta lenger og kan ikke sende nye
  forespørsler. Forespørsler og opphold røres ikke. De avlyses bare med en egen
  handling under Forespørsler.
- Administratorene ser alle hytter slik lånerne ser dem, og en oversikt over
  de mest populære hyttene (`/admin/hytter`). Valgt av prosjekteier 2026-11-18
  (D027 og D028). De ser aldri adresse, kartposisjon, Vipps-nummer eller
  praktiske opplysninger, ikke andres delinger eller forespørsler, og kan ikke
  spørre om å låne en hytte eieren ikke har vist dem. Reglene står i
  `getVisibleCabin` og `src/lib/services/cabin-stats.ts`.
  Det finnes ingen støttevisning. Trengs innsyn for å hjelpe noen, må den som er
  ansvarlig for opplysningene, slå opp direkte i databasen og føre det i
  prosjektets beslutningslogg.

## Overgang fra «alle hytteeiere ser alle hytter»

Fram til migreringen `0003_hyttekrets` så alle hytteeiere og administratorer alle
hytter. Den regelen er fjernet i koden. Migreringen selv rører ingen hytter,
delinger eller reservasjoner:

- Delinger som finnes fra før (`cabin_access`), beholdes.
- Invitasjoner som venter, får lenkenøkkel og 30 dagers frist.
- Innsyn som bare fulgte av den gamle regelen, faller bort. Eieren må dele på nytt
  med dem som fortsatt skal se hytta.
- Forespørsler og opphold står som før. Låneren ser dem under Forespørsler, men
  kan ikke åpne hyttesiden før eieren deler hytta.

Migreringen legger bare til kolonner, og de har standardverdier. Forrige
kodeversjon virker derfor mot den nye databasen, både i sekundene mens ny versjon
legges ut, og hvis koden rulles tilbake. Rulles koden tilbake, gjelder de gamle
reglene igjen: alle hytteeiere ser alle hytter, og en invitasjon som er trukket
tilbake i ny versjon, virker igjen. En tilbakerulling er derfor en egen beslutning.

`npm run overgang:rapport` viser hvor mange tilganger som faller bort, per hytte,
og hvilke forespørsler som gjelder en låner uten eksplisitt deling. Rapporten
leser bare, og bruker interne ID-er i stedet for navn. Den skrives også i
byggeloggen rett før migreringen legges på. Kolonnen `profile.is_owner` brukes
ikke lenger og kan fjernes i en senere opprydding.

## Kjøre lokalt

Du trenger Node 22 og en Postgres-database.

```bash
npm install
cp .env.example .env.local   # fyll inn verdiene
npm run db:migrate           # oppretter tabellene
npm run dev                  # http://localhost:3000
```

Uten `RESEND_API_KEY` sendes ingen e-post lokalt. Innloggingskoder og varsler
skrives i stedet til filen `.dev-outbox.jsonl` og til terminalen.

## Legge ut på Vercel

1. Legg koden i et GitHub-repo og importer repoet som nytt prosjekt i Vercel.
2. Legg til en Postgres-database under Storage i prosjektet (for eksempel Neon).
   Vercel setter da `DATABASE_URL` selv.
3. Opprett en konto hos Resend, bekreft et domene du eier, og lag en API-nøkkel.
   Inntil domenet er bekreftet, sender tjenesten fra Resends testadresse, og
   da kommer e-posten bare fram til adressen Resend-kontoen er registrert på.
4. Sett miljøvariablene fra `.env.example` i Vercel: `ADMIN_EMAILS`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_NAME`,
   `NEXT_PUBLIC_CONTROLLER_NAME` og `NEXT_PUBLIC_CONTACT_EMAIL`. Svar på e-post
   går til `EMAIL_REPLY_TO`, ellers til `NEXT_PUBLIC_CONTACT_EMAIL`, fordi
   avsenderadressen ikke har postkasse. Sett `CRON_SECRET`, så bare Vercel kan
   starte påminnelsesjobben. Sett
   `BETTER_AUTH_URL` for produksjon når tjenesten har fått eget domene.
   `BETTER_AUTH_SECRET` er valgfri: uten den avledes nøkkelen av `DATABASE_URL`.
   Sett `AI_GATEWAY_API_KEY` (lages under AI Gateway i Vercel) for å slå på
   tekstforslag til beskrivelsen. Uten den vises ikke knappen.
   I produksjon stopper tjenesten heller enn å bruke standardnøkkelen hvis
   begge mangler.
5. Deploy. Byggingen oppdaterer databasen automatisk (`scripts/migrate.mjs`).
6. Logg inn med en adresse fra `ADMIN_EMAILS` og inviter den første hytteeieren.

## Kommandoer

| Kommando | Hva den gjør |
|---|---|
| `npm run dev` | Starter utviklingsserveren |
| `npm run build` | Oppdaterer databasen og bygger for produksjon |
| `npm run typecheck` | Sjekker typene |
| `npm run lint` | Sjekker kodestil |
| `npm test` | Går gjennom deling, invitasjoner og låneflyten mot en **lokal** database, og sjekker tilkoblingene til databasen. Tømmer databasen. |
| `npm run test:nettleser` | Samme flyt i en nettleser på mobilstørrelse, delvis bare med tastatur. Se toppen av `scripts/test-browser.mjs`. Tømmer databasen. |
| `npm run overgang:rapport` | Viser hvilke tilganger som faller bort ved overgangen til eksplisitt deling. Leser bare. |
| `npm run db:generate` | Lager en ny migrering etter endring i `src/lib/db/schema.ts` |
| `npm run db:migrate` | Oppdaterer databasen |

## Slik henger koden sammen

```
src/lib/db/schema.ts      Datamodellen. Én fil, alle tabeller.
src/lib/services/         Alle regler og tilgangssjekker. Start her.
  invitations.ts            hvem slipper inn, deling, invitasjoner, invitasjonssiden, godkjenning av andre adresser, hyttekretsen
  cabins.ts                 hytter, hvem som ser hva, ledige perioder
  bookings.ts               forespørsel, ja/nei, betalt, avlysning
  reminders.ts              påminnelse til eieren før feriene når hytta står ledig
  photos.ts                 bilder: hvem får legge til, fjerne og se dem
  descriptions.ts           tekstforslag til beskrivelsen: hvem får be om det, hva som sendes ut, taket per døgn
  addresses.ts              adressesøk mot Kartverket, bare for hytteeiere
src/lib/position.ts       Leser koordinater og kartlenker, lager veilenker
src/app/adressesok/       Adresseforslagene i hytteskjemaet, bak innlogging
src/lib/photo-processing.ts  Forminsker bildene og fjerner opptaksdata (sharp)
src/lib/photo-limits.ts   Grensene for antall og størrelse på bilder
src/lib/description-assist.ts  Om tekstforslag er slått på, og taket per døgn
src/components/description-field.tsx  Beskrivelsesfeltet med knappen for tekstforslag
src/app/bilder/[id]/      Adressen som viser et bilde, bak innlogging
src/lib/auth.ts           Innlogging med Better Auth (engangskode på e-post)
src/lib/session.ts        requireViewer(): hvem er innlogget
src/lib/emails.ts         Teksten i alle e-poster
src/lib/pledge.ts         Teksten i Hytteløftet
src/lib/pricing.ts        Prisregning
src/app/(app)/            Sidene som krever innlogging
src/app/(app)/krets/      Din hyttekrets: første side etter innlogging
src/app/invitasjon/       Siden invitasjonslenken peker til
src/components/share-form.tsx  Dele en hytte: skjema, forhåndsvisning, bekreftelse
src/components/date-range-picker.tsx  Kalenderen, med status som tekst for hver dato
src/app/(app)/actions.ts  Skjemaene: henter brukeren og kaller tjenestelaget
src/proxy.ts              Sender uinnloggede til innlogging
scripts/test-flow.ts      Testen av reglene, mot databasen
scripts/test-pool.ts      Testen av tilkoblingene til databasen
src/lib/db/pool.ts        Tilkoblingene til databasen, tilpasset Vercel
scripts/test-browser.mjs  Testen i nettleser, på mobilstørrelse og med tastatur
scripts/overgang-rapport.mjs  Leserapport før overgangen til eksplisitt deling
scripts/pilotmaaling.sql  Tallene for piloten: invitert, delt, invitert videre, opphold
```

Regelen for ny funksjonalitet: tilgangssjekken skal ligge i tjenestelaget
(`src/lib/services`), aldri bare i en side. Legg til en sjekk i
`scripts/test-flow.ts` for hver ny regel.

## Viktig å vite

- **Next.js 16 med Cache Components.** Alt som leser innloggingen, må ligge bak
  `<Suspense>`. Se `src/app/(app)/layout.tsx`. Dokumentasjonen for denne versjonen
  ligger i `node_modules/next/dist/docs/`.
- **Vercel setter serveren på pause mellom forespørsler.** Arbeid mot databasen
  som ikke er avsluttet da, blir stående halvferdig, og neste besøk får feil som
  «Authentication timed out». `src/lib/db/pool.ts` holder derfor serveren våken
  til hver tilkobling er levert tilbake og lukket, og prøver en spørring på nytt
  når tilkoblingen sviktet og det er trygt. Bruk alltid `db` fra `src/lib/db`, og
  lag ikke egne tilkoblinger. Vercels `attachDatabasePool` brukes ikke: den leser
  klokka når en tilkobling hentes, og det gir feil i Next når sider hentes på
  forhånd.
- **Bildene ligger i databasen** (tabellen `cabin_photo`), ikke i en egen
  fillagring. Det holder for piloten og gir samme tilgangskontroll som resten av
  hytta. Nettleseren forminsker hvert bilde før opplasting, og serveren lagrer det
  som WebP uten GPS-posisjon og andre opptaksdata. Blir det mange hytter, bør
  bildene flyttes til en fillagring, for eksempel Vercel Blob.
- **Adresseforslagene kommer fra Kartverket** (`ws.geonorge.no/adresser/v1`), som er
  åpent og gratis. Søket går via serveren, så Kartverket ser ikke hvem som søker.
  Svarer ikke tjenesten, kommer det ingen forslag, og eieren skriver adressen selv.
  Tjenesten dekker bare norske adresser. Hytter i utlandet får posisjon fra
  koordinater eller en kartlenke.
- **Tekstforslagene kommer fra Vercel AI Gateway** (`eu.ai-gateway.vercel.sh`), med
  modellen i `AI_DESCRIPTION_MODEL` (standard `anthropic/claude-sonnet-5.5`). Ut går
  bare forsidebildet, forminsket til 1024 punkter, og stedsnavnet. Forespørselen
  ber om at modellen kjører i EU og at leverandøren ikke tar vare på innholdet
  (`inferenceRegion` og `zeroDataRetention`). Kan ikke gatewayen oppfylle det,
  feiler forespørselen, og eieren får beskjed om å skrive selv. Zero data
  retention krever Pro-plan eller kjøpte AI Gateway-kreditter. Hvert forsøk føres
  i tabellen `description_suggestion`, uten selve teksten. Testene bruker en
  etterligning (`AI_DESCRIPTION_URL`) og sender aldri noe til en ekte AI-tjeneste.
  Personvernsiden lages ved bygging og nevner tekstforslag bare når nøkkelen er satt.
- **Forhåndsvisninger deler database med produksjon** hvis de får samme
  `DATABASE_URL`. Bruk en egen database for forhåndsvisninger når piloten er i bruk.
  Bygging av en forhåndsvisning hos Vercel oppdaterer aldri databasen, med mindre
  `MIGRATE_ON_PREVIEW=1` er satt for forhåndsvisninger (se `scripts/migrate.mjs`).
- **E-post som er «sendt», er tatt imot av Resend.** Tjenesten vet ikke om den kom
  fram til innboksen. Eieren får beskjed hvis Resend ikke tok imot e-posten.
  Levering, avvisning og søppelpost ses i Resends logg.
- **Personvernsiden er et utkast.** Den beskriver hva som lagres, men er ikke
  juridisk kvalitetssikret, og ansvarlig virksomhet må fylles inn.
- **Skatt og forsikring er ikke avklart.** Se prosjektets beslutningslogg.
