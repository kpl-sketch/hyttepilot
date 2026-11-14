<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Om dette prosjektet

Pilot for en lukket tjeneste der hytteeiere låner ut hytta til folk de kjenner. Les `README.md` først.

- Språk: all tekst brukeren ser, er på norsk bokmål. Kommentarer i koden er også på norsk.
- Tjenestens navn er et arbeidsnavn. Skriv det aldri rett inn i koden. Bruk `APP_NAME` fra `src/lib/brand.ts`.
- Kjernesetningen om hva tjenesten er, ligger i `WHAT_IT_IS` i samme fil. Forsiden, invitasjonssiden og invitasjonene på e-post bruker den. Skriv den ikke på nytt med andre ord.
- Forsiden forklarer ideen før reglene, med «låne» og «låne bort». Å låne bort tilbake er frivillig: skriv «kan velge», aldri et løfte om å få låne.
- Forsiden sier først og tydelig at tjenesten bare er for inviterte, og at ingen kan registrere seg selv. Den som ikke er invitert, får ett neste steg: be noen som er med, om en invitasjon. Lov aldri rask vekst eller mange hytter.
- Regler og tilgangssjekker ligger i `src/lib/services/`. Sider og skjemaer kaller tjenestelaget og sjekker ikke tilgang selv.
- En hytte er privat til eieren deler den. Innsyn i en annens hytte følger bare av en rad i `cabin_access`, som bare eieren kan lage. Legg aldri inn en regel som gir innsyn til «alle hytteeiere», administratorer eller venners venner.
- En invitasjon gir tilgang til den som logger inn med adressen den ble sendt til. Nøkkelen i lenken gir ingenting alene. Sider som kan åpnes uten innlogging, viser ikke noe om hytta.
- Å fjerne en deling skal aldri endre en forespørsel eller et opphold.
- Brukeren hentes alltid fra innloggingen med `requireViewer()`, aldri fra skjemafelt.
- Vipps-nummer, adresse, kartposisjon (`address`, `latitude`, `longitude`) og `arrivalInfo` skal ikke sendes til andre enn eieren før reglene i `bookings.ts` tillater det.
- Bildene ligger i tabellen `cabin_photo`. Kolonnene `full` og `thumb` er store: hent dem bare i `getPhotoForViewer`, aldri i lister. Bilder vises gjennom `/bilder/[id]`, som bruker de samme reglene som hytta.
- Etter endring i `src/lib/db/schema.ts`: kjør `npm run db:generate` og legg ved den nye filen i `drizzle/`.
- Før du sier at noe virker: kjør `npm run typecheck`, `npm run lint` og `npm test` (lokal database). Endrer du sider eller skjemaer, kjør også `npm run test:nettleser`.
- Test bare mot lokal database og med adresser som slutter på `@test.local`. Send aldri e-post til ekte mottakere fra en test.
