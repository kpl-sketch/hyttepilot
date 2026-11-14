# Hyttepiloten (arbeidsnavn)

Pilot for en lukket tjeneste der hytteeiere låner ut hytta til folk de kjenner, til
litt over selvkost. Navnet er et arbeidsnavn og byttes ett sted: `NEXT_PUBLIC_APP_NAME`.

## Hva piloten gjør

- **Lukket innlogging.** Engangskode på e-post. Bare inviterte adresser får kode.
- **Hytteløftet.** Alle må gi løftet på velkomstsiden før de slipper inn.
- **Hytter.** Eieren legger inn hytte, pris, regler og ledige perioder.
- **Synlighet.** Hytteeiere ser alle hyttene. Venner uten hytte ser bare hyttene de
  er invitert til.
- **Forespørsler.** Låneren velger datoer i kalenderen. Eieren svarer ja eller nei.
- **Betaling.** Skjer med vanlig Vipps utenfor tjenesten. Eieren markerer «betalt»,
  og da er oppholdet reservert og adressen vises til låneren.
- **Varsler på e-post** til eier og låner i hvert steg.

Ikke med ennå: integrert Vipps, bilder, kart, vurderinger, venners venner, grupper,
vask som tjeneste, engelsk versjon og sletting av hytter.

## Roller

| Rolle | Hvem | Kan |
|---|---|---|
| Administrator | Adressene i `ADMIN_EMAILS` | Invitere hytteeiere. Er selv hytteeier. |
| Hytteeier | Invitert av en administrator | Legge inn hytter, se alle hytter, invitere venner til egne hytter. |
| Venn | Invitert av en hytteeier | Se hyttene de er invitert til og be om å låne. |

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
   `NEXT_PUBLIC_CONTROLLER_NAME` og `NEXT_PUBLIC_CONTACT_EMAIL`. Sett
   `BETTER_AUTH_URL` for produksjon når tjenesten har fått eget domene.
   `BETTER_AUTH_SECRET` er valgfri.
5. Deploy. Byggingen oppdaterer databasen automatisk (`scripts/migrate.mjs`).
6. Logg inn med en adresse fra `ADMIN_EMAILS` og inviter den første hytteeieren.

## Kommandoer

| Kommando | Hva den gjør |
|---|---|
| `npm run dev` | Starter utviklingsserveren |
| `npm run build` | Oppdaterer databasen og bygger for produksjon |
| `npm run typecheck` | Sjekker typene |
| `npm run lint` | Sjekker kodestil |
| `npm test` | Går gjennom hele låneflyten mot en **lokal** database. Tømmer databasen. |
| `npm run db:generate` | Lager en ny migrering etter endring i `src/lib/db/schema.ts` |
| `npm run db:migrate` | Oppdaterer databasen |

## Slik henger koden sammen

```
src/lib/db/schema.ts      Datamodellen. Én fil, alle tabeller.
src/lib/services/         Alle regler og tilgangssjekker. Start her.
  invitations.ts            hvem slipper inn, hvem inviterer hvem
  cabins.ts                 hytter, synlighet, ledige perioder
  bookings.ts               forespørsel, ja/nei, betalt, avlysning
src/lib/auth.ts           Innlogging med Better Auth (engangskode på e-post)
src/lib/session.ts        requireViewer(): hvem er innlogget
src/lib/emails.ts         Teksten i alle e-poster
src/lib/pledge.ts         Teksten i Hytteløftet
src/lib/pricing.ts        Prisregning
src/app/(app)/            Sidene som krever innlogging
src/app/(app)/actions.ts  Skjemaene: henter brukeren og kaller tjenestelaget
src/proxy.ts              Sender uinnloggede til innlogging
scripts/test-flow.ts      Testen av hele flyten
```

Regelen for ny funksjonalitet: tilgangssjekken skal ligge i tjenestelaget
(`src/lib/services`), aldri bare i en side. Legg til en sjekk i
`scripts/test-flow.ts` for hver ny regel.

## Viktig å vite

- **Next.js 16 med Cache Components.** Alt som leser innloggingen, må ligge bak
  `<Suspense>`. Se `src/app/(app)/layout.tsx`. Dokumentasjonen for denne versjonen
  ligger i `node_modules/next/dist/docs/`.
- **Forhåndsvisninger deler database med produksjon** hvis de får samme
  `DATABASE_URL`. Bruk en egen database for forhåndsvisninger når piloten er i bruk.
- **Personvernsiden er et utkast.** Den beskriver hva som lagres, men er ikke
  juridisk kvalitetssikret, og ansvarlig virksomhet må fylles inn.
- **Skatt og forsikring er ikke avklart.** Se prosjektets beslutningslogg.
