# Hyttepilot (arbeidsnavn)

Pilot for en lukket tjeneste der hytteeiere deler hytta med folk de kjenner, til
litt over selvkost. Navnet er et arbeidsnavn og byttes ett sted: `NEXT_PUBLIC_APP_NAME`.

## Hva piloten gjør

- **Lukket innlogging.** Engangskode på e-post. Bare inviterte adresser får kode.
- **Be om invitasjon.** Den som ikke kjenner noen her, kan spørre i skjemaet på
  `/be-om-invitasjon`, som forsiden lenker til: navn, e-post, om de har hytte, og
  hvem de kjenner. Skjemaet gir ingen adgang. Administratorene får varsel på
  e-post og inviterer eller sier nei under Administrasjon. Den som blir invitert,
  får den vanlige invitasjonen uten hytte. Ingen e-post går til adressen før en
  administrator har invitert. Kvitteringen sier at den som ikke har hørt fra oss
  innen 14 dager, ikke får plass nå. Administratorene ser fristen ved hver person
  og får én påminnelse når noen har ventet i tre dager (jobben
  `/jobber/venter-pa-svar`). Et nei slettes etter 30 dager og en ubesvart etter
  90, av jobben `/jobber/rydding` (planlagt i `vercel.json`), som også sletter
  IP-adressene i bremsen etter et døgn. Reglene ligger i
  `src/lib/services/join-requests.ts`.
- **Hytteløftet.** Alle må gi løftet på velkomstsiden før de slipper inn.
- **Hytter.** Eieren legger inn hytte, pris, regler og ledige perioder.
- **Bilder.** Opptil åtte bilder per hytte, valgt når hytta legges inn eller senere.
  Det første er forsidebildet. Bildene vises bare til dem som får se hytta.
- **Tekstforslag til beskrivelsen.** Under beskrivelsesfeltet på siden for hytta
  står knappen «La AI skrive teksten». Eieren skriver stikkord i feltet, og en
  AI-tjeneste skriver et kort, nøkternt utkast ut fra stikkordene, bildene,
  stedet og antall sengeplasser. Siden sier tydelig at stikkord holder: under
  ledeteksten, i det tomme feltet og i ruten med knappen. Utkastet legges i feltet,
  og ingenting lagres før eieren trykker «Lagre endringene». Uten bilde er knappen
  grå. Høyst ti forslag per hytte i døgnet. Slått av uten `AI_GATEWAY_API_KEY`.
- **Profilbilde.** Hvert medlem kan legge inn et bilde av seg selv på `/profil`:
  hentet fra LinkedIn med ett trykk, eller lastet opp. Bildet står ved navnet,
  og bare der navnet vises fra før: i hyttekretsen, på hyttesiden, i
  forespørsler, hos eieren og på invitasjonen. Uten bilde vises forbokstaven.
  Henting fra LinkedIn er slått av uten `LINKEDIN_CLIENT_ID` og
  `LINKEDIN_CLIENT_SECRET`. Se «Profilbilde fra LinkedIn» under.
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
- **Felles innboks med varsel.** Avsenderadressen har egen innboks hos Resend,
  som administratorene leser og svarer fra under Administrasjon → Innboks. Svar
  på e-post fra tjenesten kommer dit når `EMAIL_REPLY_TO` er samme adresse som
  avsenderen. Hver halvtime sjekker en jobb (`/jobber/innboks`, planlagt i
  `vercel.json`) om det ligger ulest e-post administratorene ikke har fått
  varsel om, og sender dem i så fall én e-post med avsender og emne. E-post fra
  administratorene selv gir aldri varsel. Reglene ligger i
  `src/lib/services/inbox-notices.ts`.

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
| Administrator (`ADMIN_EMAILS`) | Slippe en person inn i tjenesten uten å dele en hytte, og svare dem som har bedt om invitasjon. Ser ellers akkurat det samme som alle andre. |

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
   går til `EMAIL_REPLY_TO`, ellers til `NEXT_PUBLIC_CONTACT_EMAIL`. Har
   avsenderadressen egen innboks (Administrasjon → Innboks), settes
   `EMAIL_REPLY_TO` til samme adresse som i `EMAIL_FROM`, så svarene havner
   der og administratorene får varsel. Uten innboks må svarene gå til en
   adresse noen leser. Sett `CRON_SECRET`, så bare Vercel kan starte jobbene
   (påminnelser om ledige hytter og varsel om ny e-post). Sett
   `BETTER_AUTH_URL` for produksjon når tjenesten har fått eget domene.
   `BETTER_AUTH_SECRET` er valgfri: uten den avledes nøkkelen av `DATABASE_URL`.
   Sett `AI_GATEWAY_API_KEY` (lages under AI Gateway i Vercel) for å slå på
   tekstforslag til beskrivelsen. Uten den vises ikke knappen.
   Sett `LINKEDIN_CLIENT_ID` og `LINKEDIN_CLIENT_SECRET` for å slå på henting av
   profilbilde fra LinkedIn. Se «Profilbilde fra LinkedIn» under.
   I produksjon stopper tjenesten heller enn å bruke standardnøkkelen hvis
   begge mangler.
5. Deploy. Byggingen oppdaterer databasen automatisk (`scripts/migrate.mjs`).
6. Logg inn med en adresse fra `ADMIN_EMAILS` og inviter den første hytteeieren.

## Profilbilde fra LinkedIn

LinkedIn lar ingen hente et profilbilde ut fra en profillenke eller et navn. Den
eneste tillatte veien er LinkedIns egen løsning «Sign In with LinkedIn using
OpenID Connect»: medlemmet trykker «Hent bildet fra LinkedIn», godkjenner hos
LinkedIn, og tjenesten får adressen til bildet. Tjenesten bruker dette bare til
å hente bildet. Det er ikke en innlogging.

Slik settes det opp, én gang:

1. Gå til developer.linkedin.com, «My apps» og «Create app». Appen må knyttes
   til en LinkedIn-side (bedriftsside). Den koblingen kan ikke byttes etterpå.
   Fyll inn navn, logo og adressen til personvernsiden (`/personvern`).
2. Under «Products»: be om «Sign In with LinkedIn using OpenID Connect».
3. Under «Auth», «Authorized redirect URLs»: legg inn
   `https://<domenet>/profil/linkedin`, nøyaktig slik `BETTER_AUTH_URL` er satt,
   uten skråstrek til slutt.
4. Kopier «Client ID» og «Primary Client Secret» fra «Auth» til
   `LINKEDIN_CLIENT_ID` og `LINKEDIN_CLIENT_SECRET` i Vercel (Production), og
   bygg på nytt. Personvernsiden lages ved bygging og nevner LinkedIn bare når
   nøklene er satt.

Det tjenesten ber om, er `openid profile`: navn og bilde. Ikke e-post, og ingen
rett til å lese eller publisere noe. Av svaret brukes bare adressen til bildet.
Bildet lastes ned fra LinkedIns bildeadresser (`*.licdn.com`), gjøres om til et
kvadratisk WebP-bilde og lagres i tabellen `profile_photo`. Nøkkelen fra
LinkedIn brukes til det ene oppslaget og lagres ikke. Adressen LinkedIn gir til
bildet, går ut etter en tid, og derfor lagres en kopi og ikke adressen.

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
  inbox.ts                  den felles innboksen hos Resend, bare for administratorer
  inbox-notices.ts          varsel til administratorene når det kommer e-post til innboksen
  photos.ts                 bilder: hvem får legge til, fjerne og se dem
  profile-photos.ts         profilbilde: hvem får se det, opplasting, fjerning, bildet på invitasjonen
  profile.ts                brukerens egne opplysninger: rette mobilnummeret
  linkedin.ts               henter profilbildet fra LinkedIn: hva vi ber om, hva som lagres
  descriptions.ts           tekstforslag til beskrivelsen: hvem får be om det, hva som sendes ut, taket per døgn
  addresses.ts              adressesøk mot Kartverket, bare for hytteeiere
src/lib/position.ts       Leser koordinater og kartlenker, lager veilenker
src/app/adressesok/       Adresseforslagene i hytteskjemaet, bak innlogging
src/lib/photo-processing.ts  Forminsker bildene og fjerner opptaksdata (sharp)
src/lib/photo-limits.ts   Grensene for antall og størrelse på bilder
src/lib/description-assist.ts  Om tekstforslag er slått på, og taket per døgn
src/components/description-field.tsx  Beskrivelsesfeltet med knappen for tekstforslag
src/app/bilder/[id]/      Adressen som viser et bilde, bak innlogging
src/app/profilbilder/[id]/  Adressen som viser et profilbilde, bak innlogging
src/app/(app)/profil/     Profilsiden, og adressen LinkedIn sender brukeren tilbake til
src/lib/linkedin.ts       Om henting fra LinkedIn er slått på
src/lib/avatar.ts         Adressene til profilbilder
src/components/avatar.tsx  Bildet eller forbokstaven ved siden av et navn
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
- **Utseendet settes ett sted.** Farger, skrifter og skygger står i `@theme` i
  `src/app/globals.css`. Siden har en lys papirtone, kortene er et hakk lysere, og
  overskriftene (`h1` og `h2`) står i seriffen Fraunces. Forsidebildet er et ekte
  bilde fra en hytte og ligger i `src/assets/forside/`. Byttes det, lages det i
  to bredder (800 og om lag 1500 punkter, WebP) og importeres i
  `src/components/front-photo.tsx`. Reglene for hva bildet kan vise, står der.
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
- **Profilbildene ligger også i databasen** (tabellen `profile_photo`), ett per
  medlem, som kvadratisk WebP i 400 og 128 punkter. Hvem som får se et bilde,
  avgjøres i `mayViewProfilePhoto`: bare den som alt ser navnet. Lister henter
  aldri selve bildet, bare en versjon (`profilePhotoVersion`) som står i adressen
  til bildet. Testene bruker en etterligning av LinkedIn (`LINKEDIN_TEST_ORIGIN`),
  som aldri virker i produksjon, og sender ingenting til LinkedIn.
- **Adresseforslagene kommer fra Kartverket** (`ws.geonorge.no/adresser/v1`), som er
  åpent og gratis. Søket går via serveren, så Kartverket ser ikke hvem som søker.
  Svarer ikke tjenesten, kommer det ingen forslag, og eieren skriver adressen selv.
  Tjenesten dekker bare norske adresser. Hytter i utlandet får posisjon fra
  koordinater eller en kartlenke.
- **Tekstforslagene kommer fra Vercel AI Gateway** (`eu.ai-gateway.vercel.sh`), med
  modellen i `AI_DESCRIPTION_MODEL` (standard `anthropic/claude-haiku-5.5`, en rimelig modell). Ut går
  ikke mer enn det en låner ser før lånet er betalt: bildene, forminsket til 1024
  punkter, stedsnavnet, en avrundet posisjon for området, antall sengeplasser og
  teksten i beskrivelsesfeltet. Aldri navnet på hytta, adresse, nøyaktig posisjon,
  Vipps-nummer, praktiske opplysninger, pris, regler eller noe om eieren. Forespørselen
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
