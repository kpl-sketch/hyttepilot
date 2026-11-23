<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Om dette prosjektet

Pilot for en lukket tjeneste der hytteeiere låner ut hytta til folk de kjenner. Les `README.md` først.

- Språk: all tekst brukeren ser, er på norsk bokmål. Kommentarer i koden er også på norsk.
- Tjenestens navn er et arbeidsnavn. Skriv det aldri rett inn i koden. Bruk `APP_NAME` fra `src/lib/brand.ts`.
- Overskriften ligger i `TAGLINE` og kjernesetningen om hva tjenesten er, i `WHAT_IT_IS`, begge i samme fil. Kjernesetningen står etter «Her» eller «I <navn>». Forsiden, invitasjonssiden og invitasjonene på e-post bruker den. Skriv den ikke på nytt med andre ord.
- Forsiden forklarer ideen før reglene, med «låne» og «låne bort». Inne i tjenesten «viser» eieren hytta til noen, og de «ser» den og kan låne den. Ordet «dele» brukes ikke i tekst brukeren ser. Å låne bort tilbake er frivillig: skriv «kan velge», aldri et løfte om å få låne.
- Forsiden sier først og tydelig at tjenesten bare er for inviterte, og at ingen kan registrere seg selv. Den som ikke er invitert, får ett neste steg: be noen som har hytte her, om en invitasjon. Bare eiere og administratorer kan invitere, så teksten skal ikke love mer. Lov aldri rask vekst eller mange hytter.
- Regler og tilgangssjekker ligger i `src/lib/services/`. Sider og skjemaer kaller tjenestelaget og sjekker ikke tilgang selv.
- En hytte er privat til eieren deler den. Innsyn i en annens hytte følger av en rad i `cabin_access`, som bare eieren kan lage. Eneste unntak: administratorer ser alle hytter slik lånerne ser dem (`access: "admin"` i `getVisibleCabin`, valgt av prosjekteier 2026-11-18), men kan ikke spørre om lån uten en rad i `cabin_access`. Legg aldri inn en regel som gir innsyn til «alle hytteeiere» eller venners venner.
- `/admin/hytter` viser navn, sted, eier og antall for alle hytter, med lenke til hyttesiden. Utvid aldri den listen med adresse, meldinger eller hvem som har sett, spurt eller lånt. Reglene ligger i `src/lib/services/cabin-stats.ts`.
- En invitasjon gir tilgang til den som logger inn med adressen den ble sendt til. Nøkkelen i lenken gir ingen tilgang alene.
- Unntaket fra «ingenting om hytta uten innlogging» er invitasjonssiden (`/invitasjon/[nøkkel]`): så lenge invitasjonen gjelder, viser den bildene, området på kart (grovt punkt) og ideen. Aldri navn, pris, datoer, adresse eller nøyaktig posisjon. Regelen ligger i `getInvitationPreview` og `getPhotoForViewer`. Alle andre sider uten innlogging viser ingenting om hytta.
- Logger noen inn fra en invitasjon med en annen adresse enn den inviterte, lages en rad i `invitation_request`. Personen ser ingenting før eieren godkjenner. Godkjenning er den eneste andre veien til en rad i `cabin_access`, og bare eieren kan gjøre det.
- Å fjerne en deling skal aldri endre en forespørsel eller et opphold.
- Brukeren hentes alltid fra innloggingen med `requireViewer()`, aldri fra skjemafelt.
- Vipps-nummer, adresse, kartposisjon (`address`, `latitude`, `longitude`) og `arrivalInfo` skal ikke sendes til andre enn eieren før reglene i `bookings.ts` tillater det.
- Bildene ligger i tabellen `cabin_photo`. Kolonnene `full` og `thumb` er store: hent dem bare i `getPhotoForViewer`, aldri i lister. Bilder vises gjennom `/bilder/[id]`, som bruker de samme reglene som hytta.
- Tekstforslag til beskrivelsen (`src/lib/services/descriptions.ts`): bare eieren kan be om det. Ut til AI-tjenesten går bare forsidebildet og stedsnavnet (`area`), aldri hyttas navn, adresse, kartposisjon, Vipps-nummer, `arrivalInfo`, pris eller noe om eieren. Forespørselen krever behandling i EU og ingen lagring hos leverandøren. Forslaget lagres ikke: det legges i feltet, og eieren lagrer selv. Uten `AI_GATEWAY_API_KEY` vises ikke knappen. Teksten skal bare beskrive det som synes på bildet, og aldri finne på fasiliteter. Tonen er nøktern og konkret: ikke vi-form, ikke følelser eller minner på eierens vegne, og ingen klisjeer (valgt av prosjekteier 2026-11-23). Det personlige legger eieren til selv.
- Databasen nås bare gjennom `db` fra `src/lib/db`. Lag ikke egne tilkoblinger, og bruk ikke `attachDatabasePool` fra Vercel: `src/lib/db/pool.ts` forklarer hvorfor.
- Etter endring i `src/lib/db/schema.ts`: kjør `npm run db:generate` og legg ved den nye filen i `drizzle/`.
- Før du sier at noe virker: kjør `npm run typecheck`, `npm run lint` og `npm test` (lokal database). Endrer du sider eller skjemaer, kjør også `npm run test:nettleser`.
- Test bare mot lokal database og med adresser som slutter på `@test.local`. Send aldri e-post til ekte mottakere fra en test.
