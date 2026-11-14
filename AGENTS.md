<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Om dette prosjektet

Pilot for en lukket tjeneste der hytteeiere låner ut hytta til folk de kjenner. Les `README.md` først.

- Språk: all tekst brukeren ser, er på norsk bokmål. Kommentarer i koden er også på norsk.
- Tjenestens navn er et arbeidsnavn. Skriv det aldri rett inn i koden. Bruk `APP_NAME` fra `src/lib/brand.ts`.
- Regler og tilgangssjekker ligger i `src/lib/services/`. Sider og skjemaer kaller tjenestelaget og sjekker ikke tilgang selv.
- Brukeren hentes alltid fra innloggingen med `requireViewer()`, aldri fra skjemafelt.
- Vipps-nummer, adresse, kartposisjon (`address`, `latitude`, `longitude`) og `arrivalInfo` skal ikke sendes til andre enn eieren før reglene i `bookings.ts` tillater det.
- Bildene ligger i tabellen `cabin_photo`. Kolonnene `full` og `thumb` er store: hent dem bare i `getPhotoForViewer`, aldri i lister. Bilder vises gjennom `/bilder/[id]`, som bruker de samme reglene som hytta.
- Etter endring i `src/lib/db/schema.ts`: kjør `npm run db:generate` og legg ved den nye filen i `drizzle/`.
- Før du sier at noe virker: kjør `npm run typecheck`, `npm run lint` og `npm test` (lokal database).
