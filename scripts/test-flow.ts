/**
 * Går gjennom hele flyten mot en ekte Postgres-database og sjekker reglene:
 * hvem som slipper inn, hvem som ser hva, deling og invitasjoner, og at to lån
 * ikke kan overlappe. Kjøres med: npm test
 *
 * Testbrukerne har faste navn:
 *   Anne Admin   administrator, eier «Annes hytte»
 *   Kari Eier    hytteeier A, eier «Karis hytte»
 *   Per Eier     hytteeier B, eier «Pers hytte», invitert av Kari
 *   Ola Venn     venn C uten hytte, invitert av Per
 *   Lise Venn    venn uten hytte, invitert av Per
 * Alle adresser slutter på @test.local, som ikke finnes. Ingen e-post sendes:
 * den skrives til filen .dev-outbox.jsonl, og testen leser den derfra.
 *
 * «Akseptansetest N» viser til listen i prosjektets leveransedokument.
 *
 * Testen TØMMER databasen. Den nekter derfor å kjøre mot noe annet enn en
 * lokal database.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import {
  addDays,
  formatDateLong,
  freePeriods,
  monthGrid,
  monthOf,
  monthsBetween,
  todayInOslo,
} from "../src/lib/dates";
import { db } from "../src/lib/db";
import { booking, profile, user } from "../src/lib/db/schema";
import { canSuggestDescription, MAX_SUGGESTIONS_PER_DAY } from "../src/lib/description-assist";
import { type Actor, UserError } from "../src/lib/errors";
import { PLEDGE_VERSION } from "../src/lib/pledge";
import { directionLinks, isShortMapLink, parsePosition } from "../src/lib/position";
import { positionInMapPage, resolveShortMapLink } from "../src/lib/services/map-links";
import { searchAddresses, searchLocations } from "../src/lib/services/addresses";
import {
  cancelBooking,
  createBooking,
  decideBooking,
  listIncoming,
  listOutgoing,
  markPaid,
} from "../src/lib/services/bookings";
import {
  addAvailability,
  createCabin,
  getCalendar,
  getOwnCabin,
  getVisibleCabin,
  listOwnCabins,
  listSharedCabins,
  updateCabin,
} from "../src/lib/services/cabins";
import {
  approveAccessRequest,
  claimInvitations,
  declineAccessRequest,
  getAccessRequestState,
  getCircle,
  getInvitationPreview,
  getInvitedEmail,
  getOwnInvitationPreview,
  MAX_ACCESS_REQUESTS,
  registerAccessRequest,
  requestAccessViaInvitation,
  getInvitationForViewer,
  getPublicInvitation,
  inviteAccount,
  inviteManyToCabin,
  inviteToCabin,
  isEmailAllowed,
  listAccountInvitations,
  listCabinSharing,
  MAX_INVITATIONS_PER_ROUND,
  parseEmailList,
  previewInvitations,
  previewShare,
  revokeAccess,
  revokeAccountInvitation,
  revokeInvitation,
  shareWithPerson,
} from "../src/lib/services/invitations";
import { getPilotMetrics, getWeeklyMetrics, WEEKS } from "../src/lib/services/metrics";
import { listMembers, membersToCsv } from "../src/lib/services/members";
import { getCabinStats, parseCabinSort } from "../src/lib/services/cabin-stats";
import { suggestDescription } from "../src/lib/services/descriptions";
import { isThrottled } from "../src/lib/services/login";
import {
  firstIdlePeriod,
  sendIdleReminders,
  setIdleReminders,
} from "../src/lib/services/reminders";
import { easterSunday, holidaysInYear, upcomingHoliday } from "../src/lib/holidays";
import {
  addCabinPhotos,
  getPhotoForViewer,
  listCabinPhotos,
  makeCoverPhoto,
  removeCabinPhoto,
} from "../src/lib/services/photos";

// E-postene leses fra utboksen. De trenger ikke stå i terminalen også.
process.env.EMAIL_QUIET = "1";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Testen kjører bare mot en lokal database. Avbryter.");
  process.exit(1);
}

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Forventer at handlingen stoppes med en melding til brukeren. */
async function refused(fn: () => Promise<unknown>, pattern?: RegExp) {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(error instanceof UserError, `forventet UserError, fikk ${error}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

/** Etterligner innlogging og velkomstsiden for en ny bruker. */
async function register(email: string, name: string): Promise<Actor> {
  const id = randomUUID();
  await db.insert(user).values({ id, email, name, emailVerified: true });
  await db.insert(profile).values({
    userId: id,
    phone: "91234567",
    pledgeAcceptedAt: new Date(),
    pledgeVersion: PLEDGE_VERSION,
  });
  await claimInvitations(id, email);
  return actor(id);
}

/** Leser brukeren slik session.ts gjør det. */
async function actor(id: string): Promise<Actor> {
  const [u] = await db.select().from(user).where(sql`${user.id} = ${id}`);
  const [p] = await db.select().from(profile).where(sql`${profile.userId} = ${id}`);
  assert.ok(p, "brukeren skal ha fullført velkomstsiden");
  const isAdmin = (process.env.ADMIN_EMAILS ?? "").split(",").includes(u.email);
  return { id, email: u.email, name: u.name, isAdmin };
}

type Sent = { to: string; subject: string; text: string };

/** Alle e-postene i den lokale utboksen. Ingen av dem er sendt til noen. */
async function outbox(): Promise<Sent[]> {
  try {
    const lines = (await readFile(".dev-outbox.jsonl", "utf8")).split("\n");
    return lines.filter(Boolean).map((line) => JSON.parse(line) as Sent);
  } catch {
    return [];
  }
}

/** Utfører handlingen og gir tilbake e-postene den førte til. */
async function sentDuring<T>(fn: () => Promise<T>): Promise<{ result: T; mails: Sent[] }> {
  const before = (await outbox()).length;
  const result = await fn();
  return { result, mails: (await outbox()).slice(before) };
}

/** Nøkkelen i invitasjonslenken i en e-post. */
function tokenIn(mail: Sent): string {
  const found = mail.text.match(/\/invitasjon\/([A-Za-z0-9_-]+)/);
  assert.ok(found, "e-posten skal ha en invitasjonslenke");
  return found[1];
}

/** Setter fristen på en invitasjon tilbake i tid, som om 30 dager var gått. */
async function expire(email: string) {
  await db.execute(
    sql`update "invitation" set "expires_at" = now() - interval '1 day' where "email" = ${email} and "accepted_at" is null`,
  );
}

async function accessCount(cabinId: string, userId: string): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from "cabin_access" where "cabin_id" = ${cabinId} and "user_id" = ${userId}`,
  );
  return result.rows[0].n;
}

const cabinData = (name: string) => ({
  name,
  area: "Hafjell",
  description: "Tømmerhytte med badstue.",
  beds: "6",
  costPerNight: "400",
  markupPercent: "10",
  cleaningFee: "500",
  rules: "Ingen fest.",
  minAge: "25",
  vippsNumber: "912 34 567",
  address: "Fjellvegen 12, 2636 Øyer",
  position: "61.2345, 10.4567",
  arrivalInfo: "Nøkkelboks kode 1234",
});

/**
 * Etterligner Kartverkets adressesøk, slik at testen ikke trenger nett.
 * Svarer med to adresser når søket starter på «fjellvegen».
 */
async function fakeAddressSearch() {
  const seen: string[] = [];
  const server = createServer((request, response) => {
    const requested = new URL(request.url ?? "", "http://x");
    const search = requested.searchParams.get("sok") ?? "";
    if (requested.pathname === "/api") {
      // Slik Photon (OpenStreetMap) svarer.
      const q = (requested.searchParams.get("q") ?? "").toLowerCase();
      seen.push(`utland:${q}`);
      const features = q.startsWith("krokviks")
        ? [
            { type: "Feature", geometry: { type: "Point", coordinates: [11.9581234, 57.3521234] }, properties: { street: "Krokviksvägen", housenumber: "17", postcode: "439 54", city: "Åsa", country: "Sweden", countrycode: "SE" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [10.1, 59.1] }, properties: { street: "Krokvikveien", housenumber: "1", postcode: "3200", city: "Sandefjord", countrycode: "NO" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [11.95, 57.35] }, properties: { name: "Åsa", city: "Åsa", countrycode: "SE", country: "Sweden" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [12.127998, 57.343407] }, properties: { name: "Krokviksvägen", osm_key: "highway", type: "street", city: "Åsa", countrycode: "SE" } },
          ]
        : [];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ type: "FeatureCollection", features }));
      return;
    }
    if (requested.pathname === "/navn") {
      // Slik Kartverkets stedsnavnsøk svarer.
      const point = (nord: number, øst: number) => ({ nord, øst, koordsys: 4258 });
      const navn = search.toLowerCase().startsWith("hafjell")
        ? [
            { skrivemåte: "Hafjell alpinsenter", navneobjekttype: "Alpinanlegg", kommuner: [{ kommunenavn: "Øyer" }], representasjonspunkt: point(61.24, 10.45) },
            { skrivemåte: "Hafjell", navneobjekttype: "Fjell", kommuner: [{ kommunenavn: "Øyer" }], representasjonspunkt: point(61.229684, 10.526971) },
            { skrivemåte: "Hafjellvegen", navneobjekttype: "Adressenavn", kommuner: [{ kommunenavn: "Øyer" }], representasjonspunkt: point(61.2, 10.4) },
            { skrivemåte: "Uten punkt", navneobjekttype: "Fjell" },
          ]
        : search.toLowerCase().startsWith("fjellvegen")
          ? [{ skrivemåte: "Fjellvegen", navneobjekttype: "Adressenavn", representasjonspunkt: point(61, 10) }]
          : [];
      if (search.startsWith("nede")) {
        response.writeHead(503).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ metadata: { totaltAntallTreff: navn.length }, navn }));
      return;
    }
    seen.push(search);
    if (search.toLowerCase().startsWith("tisleidalen")) {
      const adresser = [
        { adressetekst: "107/1", objtype: "Matrikkeladresse", gardsnummer: 107, bruksnummer: 1, postnummer: "2923", poststed: "TISLEIDALEN", kommunenavn: "NORD-AURDAL", representasjonspunkt: { lat: 60.79371063, lon: 9.2487827 } },
      ];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ adresser }));
      return;
    }
    if (search.startsWith("nede")) {
      response.writeHead(503).end();
      return;
    }
    if (search.toLowerCase().startsWith("storgata 1")) {
      // Slik Kartverket svarer: treff i andre felt kan komme før adressen selv.
      const point = { lat: 60, lon: 10 };
      const streets = ["Storgata 61", "Storgata 12", "Storgata 1", "Storgata 1B", "Storgata 100"];
      const adresser = [
        ...streets.map((adressetekst) => ({ adressetekst, postnummer: "2000", poststed: "LILLESTRØM", representasjonspunkt: point })),
        ...Array.from({ length: 10 }, (_, i) => ({ adressetekst: `Storgata ${20 + i}`, postnummer: "2000", poststed: "LILLESTRØM", representasjonspunkt: point })),
      ];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ adresser }));
      return;
    }
    // «bare uten stjerne» finnes bare når søket ikke har jokertegn.
    const exactOnly = search === "bare uten stjerne";
    const adresser =
      search.toLowerCase().startsWith("fjellvegen") || exactOnly
        ? [
            {
              adressetekst: "Fjellvegen 12",
              postnummer: "2636",
              poststed: "ØYER",
              kommunenavn: "ØYER",
              representasjonspunkt: { epsg: "EPSG:4258", lat: 61.23456789, lon: 10.45678912 },
            },
            {
              adressetekst: "Fjellvegen 12",
              postnummer: "8610",
              poststed: "MO I RANA",
              representasjonspunkt: { epsg: "EPSG:4258", lat: 66.3, lon: 14.1 },
            },
            { adressetekst: "Uten punkt 1", postnummer: "0001", poststed: "OSLO" },
          ]
        : [];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ metadata: { totaltAntallTreff: adresser.length }, adresser }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fikk ingen port");
  process.env.ADDRESS_SEARCH_URL = `http://127.0.0.1:${address.port}/sok`;
  process.env.PLACE_SEARCH_URL = `http://127.0.0.1:${address.port}/navn`;
  process.env.ABROAD_SEARCH_URL = `http://127.0.0.1:${address.port}/api`;
  return { seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Et ensfarget bilde slik et kamera lagrer det: liggende, med GPS-posisjon. */
async function photo(name: string, background: string): Promise<File> {
  const bytes = await sharp({
    create: { width: 2400, height: 1800, channels: 3, background },
  })
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "61/1 14/1 0/1" } })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

const DRAFT =
  "Tømmerhytte mellom furutrær på Hafjell. Trapp opp til inngangen, og skog på alle sider.";

/**
 * Etterligner AI-tjenesten som skriver tekstforslag, slik at testen verken
 * trenger nett eller nøkkel. `state.answer` styrer hva neste svar blir.
 */
async function fakeTextService() {
  const seen: { authorization: string; body: string }[] = [];
  const state = { answer: "text" as "text" | "quoted" | "none" | "empty" | "down" };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({
        authorization: request.headers.authorization ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
      });
      if (state.answer === "down") {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "nede for vedlikehold" }));
        return;
      }
      const content = {
        text: DRAFT,
        quoted: "«**Hytta** ligger lunt til.»",
        none: "INGEN",
        empty: "",
      }[state.answer];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fikk ingen port");
  const url = `http://127.0.0.1:${address.port}/v1/chat/completions`;
  process.env.AI_DESCRIPTION_URL = url;
  return { seen, state, url, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Utfører handlingen og gir tilbake det den skrev i feilloggen, uten å vise det i terminalen. */
async function loggedDuring(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => void lines.push(parts.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

async function suggestionCount(cabinId: string): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from "description_suggestion" where "cabin_id" = ${cabinId}`,
  );
  return result.rows[0].n;
}

async function main() {
  await db.execute(
    sql`truncate "booking", "availability", "cabin_photo", "cabin_access", "invitation", "cabin", "profile", "login_throttle", "verification", "session", "account", "user" cascade`,
  );

  const today = todayInOslo();
  const d = (n: number) => addDays(today, n);

  console.log("Lukket krets");
  await check("administrator slipper inn uten invitasjon", async () => {
    assert.equal(await isEmailAllowed("Admin@Test.Local"), true);
  });
  await check("ukjent adresse slipper ikke inn", async () => {
    assert.equal(await isEmailAllowed("fremmed@test.local"), false);
  });

  const admin = await register("admin@test.local", "Anne Admin");
  assert.equal(admin.isAdmin, true);
  const annesHytte = await createCabin(admin, cabinData("Annes hytte"));
  await addAvailability(admin, annesHytte, d(10), d(40));

  const kariInvitation = await sentDuring(() => inviteAccount(admin, "Kari@Test.Local", "Bli med!"));
  await check("administrator kan slippe inn en person uten å dele en hytte", async () => {
    assert.equal(kariInvitation.result.emailAccepted, true);
    assert.equal(await isEmailAllowed("kari@test.local"), true);
    assert.equal(kariInvitation.mails.length, 1);
    assert.equal(kariInvitation.mails[0].to, "kari@test.local");
    assert.match(kariInvitation.mails[0].text, /gir ikke tilgang til andres hytter/);
    assert.match(kariInvitation.mails[0].text, /«Bli med!»/);
  });
  await check("samme adresse kan ikke inviteres to ganger", async () => {
    const again = await sentDuring(() =>
      refused(() => inviteAccount(admin, "kari@test.local"), /allerede invitert/),
    );
    assert.equal(again.mails.length, 0, "ingen ny e-post");
  });
  const kari = await register("kari@test.local", "Kari Eier");
  await check("invitasjon fra administrator gir adgang, men ingen hytter", async () => {
    assert.equal(kari.isAdmin, false);
    assert.deepEqual(await listSharedCabins(kari), []);
    assert.equal(await getVisibleCabin(kari, annesHytte), null);
    const seen = await getInvitationForViewer(kari, tokenIn(kariInvitation.mails[0]));
    assert.ok(seen?.mine);
    assert.equal(seen.status, "accepted");
    assert.equal(seen.cabin, null);
  });
  await check("bare administratorer kan invitere uten å dele en hytte", async () => {
    await refused(() => inviteAccount(kari, "noen@test.local"), /administratorer/);
    await refused(() => listAccountInvitations(kari), /administratorer/);
    await refused(() => inviteAccount(admin, "kari@test.local"), /allerede med/);
  });
  await check("ugyldig e-postadresse avvises", () =>
    refused(() => inviteAccount(admin, "ikke-en-adresse"), /gyldig e-postadresse/),
  );
  await check("administrator kan trekke tilbake en invitasjon som ikke er brukt", async () => {
    await inviteAccount(admin, "angret@test.local");
    const [waiting] = (await listAccountInvitations(admin)).filter((i) => i.status === "valid");
    assert.equal(waiting.email, "angret@test.local");
    await refused(() => revokeAccountInvitation(kari, waiting.id), /administratorer/);
    await revokeAccountInvitation(admin, waiting.id);
    assert.equal(await isEmailAllowed("angret@test.local"), false);
  });

  console.log("Privat som utgangspunkt");
  const karisHytte = await createCabin(kari, cabinData("Karis hytte"));
  await addAvailability(kari, karisHytte, d(10), d(40));
  await check("en ny hytte er privat: ingen andre enn administratorene ser den", async () => {
    assert.equal((await getVisibleCabin(admin, karisHytte))?.access, "admin");
    assert.deepEqual(await listSharedCabins(admin), [], "administratorer får ikke hytta i hyttekretsen");
    const [own] = await listOwnCabins(kari);
    assert.equal(own.sharedWith, 0);
    assert.equal(own.pendingInvitations, 0);
    assert.deepEqual(own.free, [{ startDate: d(10), endDate: d(40) }]);
  });
  await check("det å eie en hytte gir ikke innsyn i andres", async () => {
    assert.equal(await getVisibleCabin(kari, annesHytte), null);
    assert.deepEqual(await listSharedCabins(kari), []);
  });
  await check("administrator ser andres hytter slik lånerne gjør, men kan ikke be om lån", async () => {
    const seen = await getVisibleCabin(admin, karisHytte);
    assert.equal(seen?.access, "admin");
    assert.equal(seen?.cabin.name, "Karis hytte");
    for (const secret of ["address", "latitude", "longitude", "vippsNumber", "arrivalInfo"]) {
      assert.ok(!(secret in (seen?.cabin ?? {})), `${secret} skal ikke med`);
      assert.ok(!(secret in (seen ?? {})), `${secret} skal ikke med`);
    }
    await refused(
      () => createBooking(admin, karisHytte, { startDate: d(12), endDate: d(14), guests: "2", message: "" }),
      /ikke vist deg hytta/,
    );
    assert.equal(await listCabinSharing(admin, karisHytte), null);
    assert.equal((await getVisibleCabin(kari, karisHytte))?.access, "owner");
  });

  console.log("Akseptansetest 1: A inviterer B til hytte A");
  const perInvitation = await sentDuring(() =>
    inviteToCabin(kari, karisHytte, " Per@Test.Local ", "Velkommen på hytta, Per!"),
  );
  const persToken = tokenIn(perInvitation.mails[0]);
  await check("invitasjonen sier hvem som inviterer, hvilken hytte og hva mottakeren får", async () => {
    assert.deepEqual(perInvitation.result, {
      status: "invited",
      recipient: "per@test.local",
      emailAccepted: true,
    });
    assert.equal(perInvitation.mails.length, 1);
    const [mail] = perInvitation.mails;
    assert.equal(mail.to, "per@test.local");
    assert.match(mail.subject, /^Kari Eier inviterer deg til /);
    assert.match(mail.text, /vise deg hytta Karis hytte \(Hafjell\)/);
    assert.match(mail.text, /ser du når hyttene til folk du kjenner er ledige, og du kan spørre uten at det blir rart/);
    assert.match(mail.text, /«Velkommen på hytta, Per!»/);
    assert.match(mail.text, /Invitasjonen gjelder bare denne hytta/);
    assert.match(mail.text, /gjelder for per@test\.local til /);
    assert.equal(mail.text.includes("Fjellvegen"), false, "adressen skal ikke stå i e-posten");
  });
  await check("lenken viser bare avsender og maskert adresse uten innlogging", async () => {
    const open = await getPublicInvitation(persToken);
    assert.deepEqual(open, {
      status: "valid",
      kind: "cabin",
      inviterName: "Kari Eier",
      maskedEmail: "p•••@test.local",
    });
    assert.equal(JSON.stringify(open).includes("Karis hytte"), false);
  });
  await check("eieren ser invitasjonen som venter", async () => {
    const sharing = await listCabinSharing(kari, karisHytte);
    assert.deepEqual(sharing?.people, []);
    assert.deepEqual(sharing?.invitations.map((i) => [i.email, i.expired]), [
      ["per@test.local", false],
    ]);
    assert.equal((await listOwnCabins(kari))[0].pendingInvitations, 1);
  });
  const per = await register("per@test.local", "Per Eier");
  await check("B ser riktig avsender og hytte etter innlogging", async () => {
    const shared = await listSharedCabins(per);
    assert.deepEqual(
      shared.map((c) => [c.cabin.name, c.ownerName]),
      [["Karis hytte", "Kari Eier"]],
    );
    assert.deepEqual(shared[0].free, [{ startDate: d(10), endDate: d(40) }]);
    const welcome = await getInvitationForViewer(per, persToken);
    assert.ok(welcome?.mine);
    assert.equal(welcome.status, "accepted");
    assert.equal(welcome.inviterName, "Kari Eier");
    assert.equal(welcome.message, "Velkommen på hytta, Per!");
    assert.deepEqual(welcome.cabin, { id: karisHytte, name: "Karis hytte", area: "Hafjell" });
    assert.equal((await getCircle(per)).invitedBy, "Kari Eier");
  });
  await check("B ser ingen uvedkommende hytter", async () => {
    assert.equal(await getVisibleCabin(per, annesHytte), null);
    assert.equal((await listSharedCabins(per)).length, 1);
  });
  await check("Vipps-nummer og adresse følger ikke med til andre", async () => {
    const seen = await getVisibleCabin(per, karisHytte);
    assert.ok(seen);
    for (const hidden of ["vippsNumber", "arrivalInfo", "address", "latitude", "longitude"]) {
      assert.equal(hidden in seen.cabin, false, `${hidden} skal ikke følge med`);
    }
    const [listed] = await listSharedCabins(per);
    assert.equal(JSON.stringify(listed).includes("Fjellvegen"), false);
  });

  console.log("Akseptansetest 2: B deler frivillig egen hytte med A");
  const persHytte = await createCabin(per, cabinData("Pers hytte"));
  await addAvailability(per, persHytte, d(10), d(40));
  await check("alle medlemmer kan legge inn hytte, og den er privat", async () => {
    assert.equal((await listOwnCabins(per)).length, 1);
    assert.equal(await getVisibleCabin(kari, persHytte), null);
    assert.deepEqual(await listSharedCabins(kari), []);
  });
  await check("B får forslaget om å dele tilbake, men ingenting er delt", async () => {
    const circle = await getCircle(per);
    assert.deepEqual(circle.people, [
      {
        id: kari.id,
        name: "Kari Eier",
        sharesWithMe: [{ id: karisHytte, name: "Karis hytte" }],
        iShareWith: [],
      },
    ]);
  });
  await check("forhåndsvisningen viser mottaker og hytte uten å dele noe", async () => {
    const preview = await sentDuring(() =>
      previewShare(per, persHytte, { personId: kari.id }, "Takk for sist"),
    );
    assert.equal(preview.result.recipient, "Kari Eier");
    assert.equal(preview.result.cabinName, "Pers hytte");
    assert.deepEqual(preview.result.sharedWith, []);
    assert.match(preview.result.mail.subject, /Per Eier viser deg Pers hytte/);
    assert.equal(preview.mails.length, 0, "forhåndsvisning sender ingenting");
    assert.equal(await getVisibleCabin(kari, persHytte), null, "forhåndsvisning deler ingenting");
  });
  const shareBack = await sentDuring(() =>
    shareWithPerson(per, persHytte, kari.id, "Takk for sist"),
  );
  await check("etter Bs valg får A riktig tilgang og beskjed", async () => {
    assert.deepEqual(shareBack.result, {
      status: "shared",
      recipient: "Kari Eier",
      emailAccepted: true,
    });
    assert.deepEqual(
      (await listSharedCabins(kari)).map((c) => [c.cabin.name, c.ownerName]),
      [["Pers hytte", "Per Eier"]],
    );
    assert.equal(shareBack.mails.length, 1);
    assert.equal(shareBack.mails[0].to, "kari@test.local");
    assert.match(shareBack.mails[0].subject, /Per Eier viser deg Pers hytte/);
    assert.match(shareBack.mails[0].text, /«Takk for sist»/);
    const kretsen = await getCircle(kari);
    assert.deepEqual(kretsen.people[0].sharesWithMe, [{ id: persHytte, name: "Pers hytte" }]);
    assert.deepEqual(kretsen.people[0].iShareWith, [{ id: karisHytte, name: "Karis hytte" }]);
  });
  await check("samme deling kan ikke gjøres to ganger", async () => {
    const again = await sentDuring(() =>
      refused(() => shareWithPerson(per, persHytte, kari.id), /ser allerede/),
    );
    assert.equal(again.mails.length, 0);
    assert.equal(await accessCount(persHytte, kari.id), 1);
  });
  await check("man kan bare dele på denne måten med folk i egen krets", async () => {
    await refused(() => shareWithPerson(per, persHytte, admin.id), /kretsen din/);
    await refused(() => shareWithPerson(per, persHytte, per.id), /kretsen din/);
    await refused(() => shareWithPerson(per, persHytte, "finnes-ikke"), /kretsen din/);
  });

  console.log("Akseptansetest 3: B inviterer C til sin hytte");
  const olaInvitation = await sentDuring(() => inviteToCabin(per, persHytte, "ola@test.local"));
  const olasToken = tokenIn(olaInvitation.mails[0]);
  await inviteToCabin(per, persHytte, "lise@test.local");
  const ola = await register("ola@test.local", "Ola Venn");
  const lise = await register("lise@test.local", "Lise Venn");
  await check("C ser hytta til B", async () => {
    assert.deepEqual(
      (await listSharedCabins(ola)).map((c) => c.cabin.name),
      ["Pers hytte"],
    );
  });
  await check("C får ikke tilgang til As hytte gjennom B", async () => {
    assert.equal(await getVisibleCabin(ola, karisHytte), null);
    assert.equal(await getVisibleCabin(ola, annesHytte), null);
    await refused(
      () => createBooking(ola, karisHytte, { startDate: d(12), endDate: d(14), guests: "2", message: "" }),
      /Fant ikke hytta/,
    );
  });
  await check("C ser bare B i kretsen sin, ikke A eller andre B har delt med", async () => {
    assert.deepEqual(
      (await getCircle(ola)).people.map((p) => p.name),
      ["Per Eier"],
    );
    assert.deepEqual(
      (await getCircle(kari)).people.map((p) => p.name),
      ["Per Eier"],
    );
    assert.deepEqual(
      (await getCircle(per)).people.map((p) => p.name).sort(),
      ["Kari Eier", "Lise Venn", "Ola Venn"],
    );
  });
  await check("den som har fått tilgang, kan ikke dele hytta videre", async () => {
    await refused(() => inviteToCabin(ola, persHytte, "kompis@test.local"), /egne hytter/);
    await refused(() => previewShare(ola, persHytte, { email: "kompis@test.local" }, ""), /egne hytter/);
    await refused(() => shareWithPerson(ola, persHytte, per.id), /egne hytter/);
    assert.equal(await isEmailAllowed("kompis@test.local"), false);
    assert.equal(await listCabinSharing(ola, persHytte), null);
  });
  await check("bare eieren kan endre ledige perioder", () =>
    refused(() => addAvailability(ola, persHytte, d(50), d(60)), /Fant ikke hytta/),
  );
  await check("eieren ser hvem hytta er delt med", async () => {
    const sharing = await listCabinSharing(per, persHytte);
    assert.deepEqual(
      sharing?.people.map((p) => [p.name, p.email]),
      [
        // Kari fikk hytta delt som person i kretsen. Adressen hennes vises ikke.
        ["Kari Eier", null],
        ["Lise Venn", "lise@test.local"],
        ["Ola Venn", "ola@test.local"],
      ],
    );
    assert.deepEqual(sharing?.invitations, []);
    assert.equal((await listOwnCabins(per))[0].sharedWith, 3);
  });
  await check("person som er med fra før, får tilgang med en gang", async () => {
    const shared = await sentDuring(() => inviteToCabin(admin, annesHytte, "lise@test.local"));
    assert.equal(shared.result.status, "shared");
    assert.equal(shared.result.recipient, "Lise Venn");
    assert.equal(shared.mails.length, 1);
    assert.match(shared.mails[0].subject, /Anne Admin viser deg Annes hytte/);
    assert.equal((await listSharedCabins(lise)).length, 2);
    await refused(() => inviteToCabin(admin, annesHytte, "lise@test.local"), /ser allerede/);
  });
  await check("eieren kan ikke invitere seg selv", () =>
    refused(() => inviteToCabin(per, persHytte, "PER@test.local"), /din egen hytte/),
  );

  console.log("Akseptansetest 5: videresendt invitasjon og direkte lenker");
  await check("en annen innlogget person får ingenting ut av en videresendt invitasjon", async () => {
    const seen = await getInvitationForViewer(kari, olasToken);
    assert.deepEqual(seen, {
      mine: false,
      status: "accepted",
      inviterName: "Per Eier",
      maskedEmail: "o•••@test.local",
    });
    await claimInvitations(lise.id, lise.email);
    assert.equal(await getVisibleCabin(lise, karisHytte), null);
  });
  await check("en videresendt lenke slipper ikke inn en som ikke er invitert", async () => {
    assert.equal(await isEmailAllowed("fremmed@test.local"), false);
    assert.equal((await getPublicInvitation(olasToken))?.status, "accepted");
  });
  await check("direkte lenke til hytte gir ingenting uten deling", async () => {
    assert.equal(await getVisibleCabin(lise, karisHytte), null);
    assert.equal(await getVisibleCabin(ola, annesHytte), null);
    assert.equal(await getVisibleCabin(ola, "ikke-en-id"), null);
    assert.equal(await getOwnCabin(ola, persHytte), null);
  });

  console.log("Akseptansetest 6: gjentatt åpning, feil konto, utløp og tilbakekalling");
  await check("gjentatt åpning gir verken dobbel tilgang eller ny e-post", async () => {
    const again = await sentDuring(async () => {
      for (let i = 0; i < 3; i++) await claimInvitations(per.id, per.email);
      await getPublicInvitation(persToken);
      await getInvitationForViewer(per, persToken);
    });
    assert.equal(again.mails.length, 0);
    assert.equal(await accessCount(karisHytte, per.id), 1);
    assert.equal((await getInvitationForViewer(per, persToken))?.status, "accepted");
  });
  await check("samme adresse kan ikke inviteres to ganger til samme hytte", async () => {
    await inviteToCabin(kari, karisHytte, "nabo@test.local");
    const again = await sentDuring(() =>
      refused(() => inviteToCabin(kari, karisHytte, "Nabo@test.local"), /allerede invitert/),
    );
    assert.equal(again.mails.length, 0);
    await refused(() => previewShare(kari, karisHytte, { email: "nabo@test.local" }, ""), /allerede invitert/);
  });
  await check("to like innsendinger samtidig gir én invitasjon og én e-post", async () => {
    const both = await sentDuring(() =>
      Promise.allSettled([
        inviteToCabin(kari, karisHytte, "dobbel@test.local"),
        inviteToCabin(kari, karisHytte, "dobbel@test.local"),
      ]),
    );
    assert.equal(both.result.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(both.mails.filter((m) => m.to === "dobbel@test.local").length, 1);
    const sharing = await listCabinSharing(kari, karisHytte);
    assert.equal(sharing?.invitations.filter((i) => i.email === "dobbel@test.local").length, 1);
  });
  await check("utløpt invitasjon slipper ingen inn og gir tydelig status", async () => {
    const sent = await sentDuring(() => inviteToCabin(kari, karisHytte, "sen@test.local"));
    const token = tokenIn(sent.mails[0]);
    await expire("sen@test.local");
    assert.equal((await getPublicInvitation(token))?.status, "expired");
    assert.equal(await isEmailAllowed("sen@test.local"), false);
    const sharing = await listCabinSharing(kari, karisHytte);
    assert.equal(sharing?.invitations.find((i) => i.email === "sen@test.local")?.expired, true);

    // Eieren kan sende en ny. Den gamle lenken virker fortsatt ikke.
    const renewed = await sentDuring(() => inviteToCabin(kari, karisHytte, "sen@test.local"));
    assert.equal(renewed.mails.length, 1);
    assert.equal((await getPublicInvitation(tokenIn(renewed.mails[0])))?.status, "valid");
    assert.equal((await getPublicInvitation(token))?.status, "revoked");
    assert.equal(await isEmailAllowed("sen@test.local"), true);
  });
  await check("tilbaketrukket invitasjon slipper ingen inn og gir tydelig status", async () => {
    const sent = await sentDuring(() => inviteToCabin(kari, karisHytte, "angrer@test.local"));
    const token = tokenIn(sent.mails[0]);
    const sharing = await listCabinSharing(kari, karisHytte);
    const waiting = sharing?.invitations.find((i) => i.email === "angrer@test.local");
    assert.ok(waiting);
    await refused(() => revokeInvitation(per, waiting.id), /Fant ikke invitasjonen/);
    await refused(() => revokeInvitation(kari, "ikke-en-id"), /Fant ikke invitasjonen/);
    await revokeInvitation(kari, waiting.id);
    assert.equal((await getPublicInvitation(token))?.status, "revoked");
    assert.equal(await isEmailAllowed("angrer@test.local"), false);
    // Skulle noen likevel ha rukket å opprette bruker, gir invitasjonen ingenting.
    const sen = await register("angrer@test.local", "Anders Angrer");
    assert.equal(await getVisibleCabin(sen, karisHytte), null);
  });
  await check("adresser hentes ut av inntastet tekst, med navn, komma og linjeskift", () => {
    const parsed = parseEmailList(
      "Ola Nordmann <Ola@Test.local>, kari@test.local;\nola@test.local  mailto:siri@test.local.\nikke@gyldig",
    );
    assert.deepEqual(parsed.emails, ["ola@test.local", "kari@test.local", "siri@test.local"]);
    assert.deepEqual(parsed.invalid, ["ikke@gyldig"]);
    assert.deepEqual(parseEmailList("bare navn her"), { emails: [], invalid: [] });
  });
  await check("forhåndsvisning av flere adresser viser status for hver, uten å lagre eller sende", async () => {
    await register("medlem@test.local", "Mona Medlem");
    const round = await sentDuring(() =>
      previewInvitations(
        kari,
        karisHytte,
        "per@test.local, nabo@test.local, kari@test.local, gruppe1@test.local, medlem@test.local, feil@",
        "Hei alle",
      ),
    );
    assert.equal(round.mails.length, 0);
    const status = Object.fromEntries(round.result.recipients.map((r) => [r.email, r.status]));
    assert.deepEqual(status, {
      "per@test.local": "has-access",
      "nabo@test.local": "waiting",
      "kari@test.local": "self",
      "gruppe1@test.local": "new",
      // Forhåndsvisningen sier ikke at adressen tilhører et medlem.
      "medlem@test.local": "new",
    });
    assert.deepEqual(round.result.invalid, ["feil@"]);
    assert.doesNotMatch(round.result.mail.text, /gruppe1|medlem/);
    const sharing = await listCabinSharing(kari, karisHytte);
    assert.equal(sharing?.invitations.some((i) => i.email === "gruppe1@test.local"), false);
  });
  await check("en runde med ugyldig adresse stoppes før noe lagres eller sendes", async () => {
    const round = await sentDuring(() =>
      refused(
        () => inviteManyToCabin(kari, karisHytte, "gruppe1@test.local, feil@", ""),
        /Rett opp eller fjern denne adressen først: feil@/,
      ),
    );
    assert.equal(round.mails.length, 0);
    const sharing = await listCabinSharing(kari, karisHytte);
    assert.equal(sharing?.invitations.some((i) => i.email === "gruppe1@test.local"), false);
  });
  await check("flere adresser gir hver sin invitasjon og e-post, og resten hoppes over", async () => {
    const round = await sentDuring(() =>
      inviteManyToCabin(
        kari,
        karisHytte,
        "gruppe1@test.local\ngruppe2@test.local\nGruppe3@test.local\nper@test.local\nnabo@test.local\nmedlem@test.local",
        "Hei alle",
      ),
    );
    const byEmail = Object.fromEntries(round.result.map((r) => [r.email, r.status]));
    assert.deepEqual(byEmail, {
      "gruppe1@test.local": "invited",
      "gruppe2@test.local": "invited",
      "gruppe3@test.local": "invited",
      "per@test.local": "skipped",
      "nabo@test.local": "skipped",
      "medlem@test.local": "shared",
    });
    assert.match(round.result.find((r) => r.email === "per@test.local")?.reason ?? "", /ser allerede/);
    assert.match(round.result.find((r) => r.email === "nabo@test.local")?.reason ?? "", /allerede invitert/);

    // Én e-post per mottaker, med egen lenke, og ingen ser de andre adressene.
    assert.deepEqual(
      round.mails.map((m) => m.to).sort(),
      ["gruppe1@test.local", "gruppe2@test.local", "gruppe3@test.local", "medlem@test.local"],
    );
    const tokens = round.mails.filter((m) => m.to.startsWith("gruppe")).map(tokenIn);
    assert.equal(new Set(tokens).size, 3);
    for (const mail of round.mails) {
      const others = round.mails.filter((m) => m.to !== mail.to).map((m) => m.to);
      for (const other of others) assert.ok(!mail.text.includes(other), "e-posten nevner ikke andre mottakere");
      assert.match(mail.text, /Hei alle/);
    }
    const medlem = await db.select().from(user).where(sql`${user.email} = 'medlem@test.local'`);
    assert.equal(await accessCount(karisHytte, medlem[0].id), 1);

    // Hver invitasjon kan trekkes tilbake for seg.
    const sharing = await listCabinSharing(kari, karisHytte);
    const second = sharing?.invitations.find((i) => i.email === "gruppe2@test.local");
    assert.ok(second);
    await revokeInvitation(kari, second.id);
    assert.equal((await getPublicInvitation(tokens[1]))?.status, "revoked");
    assert.equal((await getPublicInvitation(tokens[0]))?.status, "valid");
    assert.equal((await getPublicInvitation(tokens[2]))?.status, "valid");
  });
  await check("en runde har en øvre grense, og bare eieren kan sende den", async () => {
    const many = Array.from(
      { length: MAX_INVITATIONS_PER_ROUND + 1 },
      (_, i) => `mange${i}@test.local`,
    ).join(", ");
    const round = await sentDuring(async () => {
      await refused(() => previewInvitations(kari, karisHytte, many, ""), /høyst 20 om gangen/);
      await refused(() => inviteManyToCabin(kari, karisHytte, many, ""), /høyst 20 om gangen/);
      await refused(() => inviteManyToCabin(per, karisHytte, "venn@test.local", ""), /egne hytter/);
      await refused(() => previewInvitations(per, karisHytte, "venn@test.local", ""), /egne hytter/);
      await refused(() => inviteManyToCabin(kari, karisHytte, "   ", ""), /minst én/);
    });
    assert.equal(round.mails.length, 0);
  });
  await check("ukjent eller ødelagt lenke gir ingenting", async () => {
    assert.equal(await getPublicInvitation("finnes-ikke-denne-noekkelen-her"), null);
    assert.equal(await getPublicInvitation("kort"), null);
    assert.equal(await getPublicInvitation("../../admin"), null);
    assert.equal(await getInvitationForViewer(per, undefined), null);
  });
  await check("brukt invitasjon kan ikke trekkes tilbake som om den ventet", async () => {
    const sharing = await listCabinSharing(per, persHytte);
    assert.deepEqual(sharing?.invitations, []);
  });

  console.log("Adresse og kartposisjon");
  await check("kartposisjon leses fra tall, grader og kartlenker", () => {
    const at = (text: string) => {
      const found = parsePosition(text);
      return found ? [found.latitude, found.longitude] : null;
    };
    assert.deepEqual(at("61.2345, 10.4567"), [61.2345, 10.4567]);
    assert.deepEqual(at(" 61.2345 10.4567 "), [61.2345, 10.4567]);
    assert.deepEqual(at("61,2345 10,4567"), [61.2345, 10.4567]);
    assert.deepEqual(at("-33.8568, 151.2153"), [-33.8568, 151.2153]);
    assert.deepEqual(at("61.23456789, 10.45678912"), [61.234568, 10.456789]);
    assert.deepEqual(at(`61°14'04.2"N 10°27'24.1"E`), [61.2345, 10.456694]);
    assert.deepEqual(at("61°14′04.2″N 10°27′24.1″Ø"), [61.2345, 10.456694]);
    assert.deepEqual(
      at("https://www.google.com/maps/place/Hytta/@61.2,10.4,15z/data=!3m1!4b1!4m6!3m5!8m2!3d61.2345!4d10.4567"),
      [61.2345, 10.4567],
    );
    assert.deepEqual(at("https://www.google.com/maps/@61.2345,10.4567,15z"), [61.2345, 10.4567]);
    assert.deepEqual(at("https://www.google.com/maps?q=61.2345,10.4567"), [61.2345, 10.4567]);
    assert.deepEqual(at("https://maps.apple.com/?ll=61.2345,10.4567&q=Hytta"), [61.2345, 10.4567]);
    assert.deepEqual(
      at("https://www.openstreetmap.org/#map=15/61.2345/10.4567"),
      [61.2345, 10.4567],
    );
    for (const nothing of ["", "Fjellvegen 12", "https://maps.app.goo.gl/abc123", "91.5, 10", "61.2, 181", "61.2345"]) {
      assert.equal(at(nothing), null, `«${nothing}» er ikke en posisjon`);
    }
  });
  await check("adresse og kartposisjon lagres på hytta", async () => {
    const own = await getOwnCabin(kari, karisHytte);
    assert.equal(own?.address, "Fjellvegen 12, 2636 Øyer");
    assert.deepEqual([own?.latitude, own?.longitude], [61.2345, 10.4567]);
  });
  await check("hytte kan lagres uten adresse og kartposisjon", async () => {
    const uten = await createCabin(kari, { ...cabinData("Uten adresse"), address: "", position: "" });
    const own = await getOwnCabin(kari, uten);
    assert.deepEqual([own?.address, own?.latitude, own?.longitude], ["", null, null]);
    await updateCabin(kari, uten, {
      ...cabinData("Uten adresse"),
      address: "",
      position: "https://www.google.com/maps?q=60.5,9.25",
    });
    const moved = await getOwnCabin(kari, uten);
    assert.deepEqual([moved?.latitude, moved?.longitude], [60.5, 9.25]);
    await db.execute(sql`delete from "cabin" where "id" = ${uten}`);
  });
  await check("korte delingslenker fra Google Maps kjennes igjen", () => {
    for (const link of [
      "https://maps.app.goo.gl/GJ56gRgET5qrftZCA?g_st=ic",
      " https://maps.app.goo.gl/abc123 ",
      "https://goo.gl/maps/abc123",
    ]) {
      assert.ok(isShortMapLink(link), `«${link}» er en kort lenke`);
    }
    for (const other of ["https://maps.app.goo.gl/", "https://goo.gl/abc", "https://evil.example/maps/x", "61.2, 10.4", ""]) {
      assert.ok(!isShortMapLink(other), `«${other}» er ikke en kort lenke`);
    }
  });
  await check("kort delingslenke følges til posisjonen hos Google", async () => {
    const visited: string[] = [];
    // Svarene Google kan gi, uten å gå ut på nettet.
    const pages: Record<string, () => Response> = {
      "https://maps.app.goo.gl/sted": () => redirect("https://www.google.com/maps/place/Hytta/@61.2,10.4,15z/data=!3d61.2345!4d10.4567"),
      "https://maps.app.goo.gl/samtykke": () =>
        redirect(`https://consent.google.com/ml?continue=${encodeURIComponent("https://maps.google.com/?q=60.5,9.25")}`),
      "https://maps.app.goo.gl/navn": () => redirect("https://maps.google.com/?q=Fjellvegen+12&ftid=0x1:0x2"),
      "https://maps.google.com/?q=Fjellvegen+12&ftid=0x1:0x2": () =>
        new Response('<meta content="https://maps.google.com/maps/api/staticmap?center=59.9139%2C10.7522&amp;zoom=15">'),
      "https://maps.app.goo.gl/ut": () => redirect("https://evil.example/?q=61.2,10.4"),
      "https://maps.app.goo.gl/borte": () => new Response("Ikke funnet", { status: 404 }),
    };
    function redirect(to: string) {
      return new Response(null, { status: 302, headers: { location: to } });
    }
    const fake = (async (input: URL | RequestInfo) => {
      const url = input.toString();
      visited.push(url);
      const page = pages[url];
      if (!page) throw new Error(`Testen kjenner ikke ${url}`);
      return page();
    }) as typeof fetch;
    const at = async (link: string) => {
      const found = await resolveShortMapLink(link, fake);
      return found && [found.latitude, found.longitude];
    };
    assert.deepEqual(await at("https://maps.app.goo.gl/sted"), [61.2345, 10.4567]);
    assert.deepEqual(await at("http://maps.app.goo.gl/samtykke"), [60.5, 9.25]);
    assert.deepEqual(await at("https://maps.app.goo.gl/navn"), [59.9139, 10.7522]);
    assert.equal(await at("https://maps.app.goo.gl/ut"), null);
    assert.ok(!visited.some((url) => url.includes("evil.example")), "følger aldri lenker ut av Google");
    assert.equal(await at("https://maps.app.goo.gl/borte"), null);
    const before = visited.length;
    assert.equal(await at("https://evil.example/maps/x"), null);
    assert.equal(visited.length, before, "henter ingenting for lenker som ikke er korte Google-lenker");
    assert.equal(positionInMapPage("<html>ingen posisjon her</html>"), null);
  });
  await check("kartposisjon som ikke kan leses, avvises", () =>
    refused(
      () => createCabin(kari, { ...cabinData("Feil posisjon"), position: "oppe i lia" }),
      /Fant ingen kartposisjon/,
    ),
  );
  await check("veilenkene bruker posisjonen, ellers adressen", () => {
    const begge = directionLinks({ address: "Fjellvegen 12", latitude: 61.2345, longitude: 10.4567 });
    assert.equal(begge?.google, "https://www.google.com/maps/dir/?api=1&destination=61.2345%2C10.4567");
    assert.equal(begge?.apple, "https://maps.apple.com/?daddr=61.2345%2C10.4567");
    const bareAdresse = directionLinks({ address: "Fjellvegen 12, 2636 Øyer", latitude: null, longitude: null });
    assert.equal(
      bareAdresse?.google,
      "https://www.google.com/maps/dir/?api=1&destination=Fjellvegen%2012%2C%202636%20%C3%98yer",
    );
    assert.equal(directionLinks({ address: " ", latitude: null, longitude: null }), null);
  });

  const lookup = await fakeAddressSearch();
  await check("adressesøket gir forslag med plassering", async () => {
    const found = await searchAddresses(kari, "Fjellvegen 1");
    assert.deepEqual(found, [
      {
        kind: "adresse",
        label: "Fjellvegen 12, 2636 Øyer",
        detail: "Adresse i Øyer",
        area: "Øyer",
        address: "Fjellvegen 12, 2636 Øyer",
        latitude: 61.234568,
        longitude: 10.456789,
      },
      {
        kind: "adresse",
        label: "Fjellvegen 12, 8610 Mo i Rana",
        detail: "Adresse",
        area: "Mo i Rana",
        address: "Fjellvegen 12, 8610 Mo i Rana",
        latitude: 66.3,
        longitude: 14.1,
      },
    ]);
    assert.equal(lookup.seen.at(-1), "Fjellvegen 1*", "søket skal treffe mens eieren skriver");
  });
  await check("adressen som ligner mest på søket, kommer først", async () => {
    const labels = async (query: string) =>
      (await searchAddresses(kari, query)).map((found) => found.label.split(",")[0]);
    assert.deepEqual(await labels("Storgata 1"), [
      "Storgata 1",
      "Storgata 12",
      "Storgata 1B",
      "Storgata 100",
      "Storgata 61",
      "Storgata 20",
    ]);
    assert.equal((await labels("storgata 1 lillestrøm"))[0], "Storgata 1");
  });
  await check("adressesøket krever innlogging, men ikke egen hytte fra før", async () => {
    await refused(() => searchAddresses(null, "Fjellvegen 1"), /Logg inn/);
    assert.equal((await searchAddresses(ola, "Fjellvegen 1")).length, 2);
  });
  await check("adressesøket tåler korte søk, jokertegn og at tjenesten er nede", async () => {
    const before = lookup.seen.length;
    assert.deepEqual(await searchAddresses(kari, "Fj"), []);
    assert.deepEqual(await searchAddresses(kari, 12345), []);
    assert.equal(lookup.seen.length, before, "korte søk skal ikke sendes videre");
    await searchAddresses(kari, "Fjellvegen* 12?, Øyer");
    assert.equal(lookup.seen.at(-1), "Fjellvegen 12 Øyer*");
    assert.equal((await searchAddresses(kari, "bare uten stjerne")).length, 2);
    assert.deepEqual(await searchAddresses(kari, "nede for vedlikehold"), []);
    assert.deepEqual(await searchAddresses(kari, "finnes ikke"), []);
  });
  await check("stedsnavn kommer først uten tall i søket, og gatenavn hoppes over", async () => {
    const found = await searchLocations(kari, "Hafjell");
    assert.deepEqual(
      found.map((item) => [item.kind, item.label, item.detail, item.area, item.address]),
      [
        ["sted", "Hafjell", "Fjell i Øyer", "Hafjell", ""],
        ["sted", "Hafjell alpinsenter", "Alpinanlegg i Øyer", "Hafjell alpinsenter", ""],
      ],
    );
    assert.deepEqual([found[0].latitude, found[0].longitude], [61.229684, 10.526971]);
  });
  await check("adresser kommer først med tall i søket", async () => {
    const found = await searchLocations(kari, "Fjellvegen 1");
    assert.deepEqual(found.map((item) => item.label), ["Fjellvegen 12, 2636 Øyer", "Fjellvegen 12, 8610 Mo i Rana"]);
  });
  await check("hytte uten gateadresse finnes med gårds- og bruksnummer", async () => {
    const [found] = await searchLocations(kari, "Tisleidalen");
    assert.deepEqual([found.label, found.detail, found.area], [
      "Gnr. 107, bnr. 1, 2923 Tisleidalen",
      "Eiendom i Nord-Aurdal",
      "Tisleidalen",
    ]);
  });
  await check("hytte i Sverige finnes, med området som det andre ser", async () => {
    const found = await searchLocations(kari, "Krokviksvägen 17, 439 54 Åsa, Sweden");
    assert.deepEqual(found[0], {
      kind: "adresse",
      label: "Krokviksvägen 17, 439 54 Åsa, Sverige",
      detail: "Adresse i Sverige",
      area: "Åsa",
      address: "Krokviksvägen 17, 439 54 Åsa, Sverige",
      latitude: 57.352123,
      longitude: 11.958123,
      abroad: true,
    });
    assert.deepEqual(found.map((item) => item.label), ["Krokviksvägen 17, 439 54 Åsa, Sverige", "Åsa, Sverige", "Krokviksvägen, Åsa, Sverige"], "norske treff fra utlandssøket hoppes over");
    const gate = found[2];
    assert.deepEqual([gate.kind, gate.detail, gate.area, gate.address], ["adresse", "Gate i Sverige", "Åsa", "Krokviksvägen, Åsa, Sverige"], "gatenavnet blir aldri området");
  });
  await check("norske treff kommer først, og treff fra resten av verden fyller på", async () => {
    const [found] = await searchLocations(kari, "Krokviksvägen 17");
    assert.equal(found.label, "Krokviksvägen 17, 439 54 Åsa, Sverige", "uten norske treff vises utlandet");
    assert.equal((await searchLocations(kari, "Hafjell"))[0].label, "Hafjell");
  });
  await check("landnavn på norsk og engelsk gjenkjennes for alle land", async () => {
    const first = async (query: string) => (await searchLocations(kari, query))[0]?.label;
    assert.equal(await first("Krokviksvägen Sverige"), "Krokviksvägen 17, 439 54 Åsa, Sverige");
    assert.equal(await first("Krokviksvägen 17 Sweden"), "Krokviksvägen 17, 439 54 Åsa, Sverige");
  });
  await check("søket etter steder krever innlogging og tåler at tjenesten er nede", async () => {
    await refused(() => searchLocations(null, "Hafjell"), /Logg inn/);
    assert.deepEqual(await searchLocations(kari, "nede for vedlikehold"), []);
    assert.deepEqual(await searchLocations(kari, "Ha"), []);
  });
  await lookup.close();

  console.log("Bilder");
  await check("hytte uten bilder har ikke forsidebilde", async () => {
    const [own] = await listOwnCabins(kari);
    assert.equal(own.coverPhotoId, null);
    assert.deepEqual(await listCabinPhotos(karisHytte), []);
  });

  const medBilder = await createCabin(kari, cabinData("Bildehytta"), [
    await photo("stue.jpg", "#a3271c"),
    await photo("utsikt.jpg", "#163027"),
  ]);
  const bilder = await listCabinPhotos(medBilder);
  await check("hytte kan legges inn med bilder, og det første blir forsidebilde", async () => {
    assert.equal(bilder.length, 2);
    const own = (await listOwnCabins(kari)).find((c) => c.id === medBilder);
    assert.equal(own?.coverPhotoId, bilder[0].id);
    await shareWithPerson(kari, medBilder, per.id);
    const seen = (await listSharedCabins(per)).find((c) => c.cabin.id === medBilder);
    assert.equal(seen?.cabin.coverPhotoId, bilder[0].id);
    assert.equal((await getVisibleCabin(per, medBilder))?.cabin.coverPhotoId, bilder[0].id);
  });
  await check("bildene lagres forminsket, som WebP og uten GPS-posisjon", async () => {
    assert.deepEqual([bilder[0].width, bilder[0].height], [1600, 1200]);
    const full = await getPhotoForViewer(kari, bilder[0].id, "full");
    const thumb = await getPhotoForViewer(kari, bilder[0].id, "thumb");
    assert.ok(full && thumb);
    const stored = await sharp(full).metadata();
    assert.equal(stored.format, "webp");
    assert.equal(stored.width, 1600);
    assert.equal(stored.exif, undefined);
    assert.equal((await sharp(thumb).metadata()).width, 640);
    const original = await sharp(
      Buffer.from(await (await photo("x.jpg", "#000")).arrayBuffer()),
    ).metadata();
    assert.ok(original.exif, "testbildet skal ha GPS-data før behandling");
  });
  await check("fil som ikke er et bilde, stopper innleggingen av hytta", async () => {
    const notat = new File(["ikke et bilde"], "notat.jpg", { type: "image/jpeg" });
    await refused(
      () => createCabin(kari, cabinData("Skal ikke lagres"), [notat]),
      /klarte ikke å lese «notat.jpg»/,
    );
    const names = (await listOwnCabins(kari)).map((c) => c.name);
    assert.equal(names.includes("Skal ikke lagres"), false);
  });
  await check("for stort bilde avvises", async () => {
    const noise = await sharp(randomBytes(1200 * 1200 * 3), {
      raw: { width: 1200, height: 1200, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const stor = new File([new Uint8Array(noise)], "stor.jpg", { type: "image/jpeg" });
    await refused(() => addCabinPhotos(kari, medBilder, [stor]), /for stort/);
  });
  await check("bare eieren kan legge til, fjerne og flytte bilder", async () => {
    const bilde = await photo("ny.jpg", "#f4c04e");
    await refused(() => addCabinPhotos(per, karisHytte, [bilde]), /Fant ikke hytta/);
    await refused(() => addCabinPhotos(admin, karisHytte, [bilde]), /Fant ikke hytta/);
    await refused(() => removeCabinPhoto(admin, bilder[0].id), /Fant ikke bildet/);
    await refused(() => makeCoverPhoto(per, bilder[1].id), /Fant ikke bildet/);
    await refused(() => addCabinPhotos(kari, karisHytte, []), /minst ett bilde/);
    assert.equal(await addCabinPhotos(kari, karisHytte, [bilde]), 1);
    assert.equal(await addCabinPhotos(admin, annesHytte, [bilde]), 1);
  });
  await check("bare de eieren har delt med og administratorene får se bildene, også via direkte lenke", async () => {
    const [karis] = await listCabinPhotos(karisHytte);
    const [annes] = await listCabinPhotos(annesHytte);
    assert.ok(await getPhotoForViewer(per, karis.id, "thumb"), "Kari har delt med Per");
    assert.ok(await getPhotoForViewer(lise, annes.id, "full"), "Anne har delt med Lise");
    assert.equal(await getPhotoForViewer(ola, karis.id, "thumb"), null, "venn av Per");
    assert.equal(await getPhotoForViewer(ola, karis.id, "full"), null);
    assert.ok(await getPhotoForViewer(admin, karis.id, "full"), "administrator ser bildene");
    assert.equal(await getPhotoForViewer(kari, annes.id, "full"), null, "annen hytteeier");
    assert.equal(await getPhotoForViewer(kari, "ikke-en-id", "full"), null);
    assert.equal(await getPhotoForViewer(kari, randomUUID(), "full"), null);
  });
  await check("en hytte kan ha høyst åtte bilder", async () => {
    const bilde = await photo("flere.jpg", "#cbd6d0");
    await addCabinPhotos(kari, medBilder, [bilde, bilde, bilde, bilde]);
    await refused(() => addCabinPhotos(kari, medBilder, [bilde, bilde, bilde]), /opptil 8/);
    assert.equal((await listCabinPhotos(medBilder)).length, 6);
    await addCabinPhotos(kari, medBilder, [bilde, bilde]);
    await refused(() => addCabinPhotos(kari, medBilder, [bilde]), /opptil 8/);
    assert.equal((await listCabinPhotos(medBilder)).length, 8);
    const ni = Array.from({ length: 9 }, () => bilde);
    await refused(() => createCabin(kari, cabinData("Ni bilder"), ni), /opptil 8/);
  });
  await check("eieren kan velge forsidebilde og fjerne bilder", async () => {
    const before = await listCabinPhotos(medBilder);
    const last = before[before.length - 1];
    await makeCoverPhoto(kari, last.id);
    const after = await listCabinPhotos(medBilder);
    assert.equal(after[0].id, last.id);
    assert.deepEqual(
      after.slice(1).map((p) => p.id),
      before.slice(0, -1).map((p) => p.id),
    );
    const own = (await listOwnCabins(kari)).find((c) => c.id === medBilder);
    assert.equal(own?.coverPhotoId, last.id);

    await removeCabinPhoto(kari, last.id);
    assert.equal((await listCabinPhotos(medBilder)).length, 7);
    assert.equal(await getPhotoForViewer(kari, last.id, "full"), null);
    assert.equal((await listCabinPhotos(medBilder))[0].id, before[0].id);
  });

  console.log("Tekstforslag fra bilde og sted");
  const ai = await fakeTextService();
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_DESCRIPTION_MODEL;
  await check("uten nøkkel til AI-tjenesten er tekstforslag slått av, og ingenting sendes ut", async () => {
    assert.equal(canSuggestDescription(), false);
    await refused(() => suggestDescription(kari, medBilder), /ikke slått på/);
    assert.equal(ai.seen.length, 0);
    assert.equal(await suggestionCount(medBilder), 0);
  });
  process.env.AI_GATEWAY_API_KEY = "test-nokkel";
  await check("eieren får et forslag ut fra forsidebildet og stedet", async () => {
    assert.equal(canSuggestDescription(), true);
    assert.equal(await suggestDescription(kari, medBilder), DRAFT);
    assert.equal(ai.seen.length, 1);
    assert.equal(ai.seen[0].authorization, "Bearer test-nokkel");
  });
  await check("ut går bare forsidebildet og stedsnavnet, med krav om EU og ingen lagring", async () => {
    const body = JSON.parse(ai.seen[0].body);
    assert.equal(body.model, "anthropic/claude-sonnet-5.5");
    assert.deepEqual(body.providerOptions, {
      gateway: { zeroDataRetention: true, inferenceRegion: { scope: "zone", geoRegion: "eu" } },
    });
    assert.deepEqual(
      body.messages.map((m: { role: string }) => m.role),
      ["system", "user"],
    );
    const [text, image] = body.messages[1].content;
    assert.equal(text.text, "Stedet eieren har oppgitt: «Hafjell»");

    // Bildet er forsidebildet («stue.jpg», rødt), forminsket og som JPG.
    const found = String(image.image_url.url).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    assert.ok(found, "bildet sendes som JPG i selve forespørselen");
    const sent = sharp(Buffer.from(found[1], "base64"));
    const meta = await sent.metadata();
    assert.equal(meta.format, "jpeg");
    assert.deepEqual([meta.width, meta.height], [1024, 768]);
    assert.equal(meta.exif, undefined);
    const [red, green, blue] = (await sent.stats()).channels.map((c) => Math.round(c.mean));
    assert.ok(Math.abs(red - 0xa3) < 12 && Math.abs(green - 0x27) < 12 && Math.abs(blue - 0x1c) < 12);

    // Ingenting annet om hytta eller eieren er med.
    const rest = ai.seen[0].body.replace(found[1], "");
    for (const secret of [
      "Bildehytta",
      "Fjellvegen",
      "2636",
      "61.2345",
      "10.4567",
      "91234567",
      "912 34 567",
      "Nøkkelboks",
      "Tømmerhytte med badstue",
      "Ingen fest",
      "kari@test.local",
      "Kari",
      kari.id,
      medBilder,
    ]) {
      assert.equal(rest.includes(secret), false, `«${secret}» skal ikke sendes til AI-tjenesten`);
    }
  });
  await check("instruksen ber om nøktern tekst: ikke vi-form, ikke følelser, ikke klisjeer", async () => {
    // Valgt av prosjekteier 2026-11-23, etter å ha lest de første forslagene.
    const instructions: string = JSON.parse(ai.seen[0].body).messages[0].content;
    assert.match(instructions, /Nøktern, konkret og vennlig/);
    assert.match(instructions, /Bruk ikke «vi», «vår», «oss», «jeg» eller «min»/);
    assert.match(instructions, /ingenting om følelser, minner, vaner/);
    assert.match(instructions, /Ingen klisjeer og ingen skryteord/);
    assert.match(instructions, /Finn aldri på noe/);
    assert.equal(/varm og personlig|vi-form/.test(instructions), false);
  });
  await check("forslaget lagres ikke på hytta, bare at eieren ba om det", async () => {
    assert.equal((await getOwnCabin(kari, medBilder))?.description, "Tømmerhytte med badstue.");
    assert.equal(await suggestionCount(medBilder), 1);
  });
  await check("bare eieren kan be om forslag, ikke lånere eller administratorer", async () => {
    await refused(() => suggestDescription(per, medBilder), /Fant ikke hytta/);
    await refused(() => suggestDescription(admin, medBilder), /Fant ikke hytta/);
    await refused(() => suggestDescription(ola, medBilder), /Fant ikke hytta/);
    await refused(() => suggestDescription(kari, "ikke-en-id"), /Fant ikke hytta/);
    await refused(() => suggestDescription(kari, randomUUID()), /Fant ikke hytta/);
    assert.equal(ai.seen.length, 1, "ingenting er sendt for andre enn eieren");
    assert.equal(await suggestionCount(medBilder), 1);
  });
  await check("hytte uten bilde får ikke forslag, og ingenting sendes ut", async () => {
    assert.deepEqual(await listCabinPhotos(persHytte), []);
    await refused(() => suggestDescription(per, persHytte), /Legg til et bilde/);
    assert.equal(ai.seen.length, 1);
    assert.equal(await suggestionCount(persHytte), 0);
  });
  await check("svaret ryddes for anførselstegn og utheving", async () => {
    ai.state.answer = "quoted";
    assert.equal(await suggestDescription(kari, medBilder), "Hytta ligger lunt til.");
  });
  await check("viser ikke bildet en hytte, blir eieren bedt om å bytte forsidebilde", async () => {
    ai.state.answer = "none";
    await refused(() => suggestDescription(kari, medBilder), /annet forsidebilde/);
  });
  await check("svikter AI-tjenesten, får eieren beskjed og kan fortsatt lagre hytta", async () => {
    const logged = await loggedDuring(async () => {
      ai.state.answer = "down";
      await refused(() => suggestDescription(kari, medBilder), /skriv teksten selv/);
      ai.state.answer = "empty";
      await refused(() => suggestDescription(kari, medBilder), /skriv teksten selv/);
      // Ingen svarer på denne porten.
      process.env.AI_DESCRIPTION_URL = "http://127.0.0.1:9/v1/chat/completions";
      await refused(() => suggestDescription(kari, medBilder), /skriv teksten selv/);
    });
    process.env.AI_DESCRIPTION_URL = ai.url;
    assert.equal(logged.length, 3, "hver feil står i loggen");
    assert.match(logged[0], /svarte 503/);
    for (const line of logged) {
      assert.equal(/base64|test-nokkel|Hafjell/.test(line), false, "loggen har verken bilde, nøkkel eller sted");
    }
    await updateCabin(kari, medBilder, { ...cabinData("Bildehytta"), description: "Skrevet selv." });
    assert.equal((await getOwnCabin(kari, medBilder))?.description, "Skrevet selv.");
  });
  await check("en hytte får høyst ti forslag i døgnet, og taket gjelder per hytte", async () => {
    ai.state.answer = "text";
    assert.equal(MAX_SUGGESTIONS_PER_DAY, 10);
    for (let n = await suggestionCount(medBilder); n < MAX_SUGGESTIONS_PER_DAY; n++) {
      await suggestDescription(kari, medBilder);
    }
    const sentBefore = ai.seen.length;
    await refused(() => suggestDescription(kari, medBilder), /mange forslag/);
    assert.equal(ai.seen.length, sentBefore, "forsøket over taket sendes ikke til AI-tjenesten");
    assert.equal(await suggestionCount(medBilder), MAX_SUGGESTIONS_PER_DAY);
    // En annen hytte hos samme eier er ikke berørt.
    assert.equal(await suggestDescription(kari, karisHytte), DRAFT);
    // Døgnet etter kan eieren be om forslag igjen.
    await db.execute(
      sql`update "description_suggestion" set "created_at" = now() - interval '25 hours' where "cabin_id" = ${medBilder}`,
    );
    assert.equal(await suggestDescription(kari, medBilder), DRAFT);
  });
  await ai.close();

  console.log("Forespørsler (akseptansetest 4, 8 og 10)");
  const request = (start: number, end: number, guests = "2") => ({
    startDate: d(start),
    endDate: d(end),
    guests,
    message: "Vi blir fire voksne.",
  });

  await check("kan ikke låne utenfor ledig periode", () =>
    refused(() => createBooking(ola, persHytte, request(5, 12)), /ikke ledig/),
  );
  await check("kan ikke låne bakover i tid", () =>
    refused(() => createBooking(ola, persHytte, request(-3, 12)), /bak i tid/),
  );
  await check("kan ikke være flere enn sengeplassene", () =>
    refused(() => createBooking(ola, persHytte, request(12, 14, "9")), /sengeplasser/),
  );
  await check("eier kan ikke be om sin egen hytte", () =>
    refused(() => createBooking(per, persHytte, request(12, 14)), /egen hytte/),
  );

  const olasRequest = await sentDuring(() => createBooking(ola, persHytte, request(12, 14)));
  const olasId = olasRequest.result;
  await check("C har ingen hytte og kan likevel sende en vanlig forespørsel", async () => {
    assert.deepEqual(await listOwnCabins(ola), []);
    const [mine] = await listOutgoing(ola);
    assert.equal(mine.booking.status, "pending");
    assert.equal(mine.cabinName, "Pers hytte");
  });
  await check("prisen er selvkost, påslag og vask", async () => {
    const [mine] = await listOutgoing(ola);
    // 2 netter × 400 = 800, 10 % påslag = 80, vask 500
    assert.equal(mine.booking.totalPrice, 1380);
    assert.equal(mine.vippsNumber, null);
    assert.equal(mine.arrivalInfo, null);
    assert.deepEqual([mine.address, mine.latitude, mine.longitude], [null, null, null]);
  });
  await check("samme låner kan ikke sende to forespørsler for samme tid", () =>
    refused(() => createBooking(ola, persHytte, request(13, 15)), /allerede en forespørsel/),
  );

  const lisesId = await createBooking(lise, persHytte, request(13, 16));
  await check("eieren ser begge forespørslene, med kontaktinfo", async () => {
    const incoming = await listIncoming(per);
    assert.equal(incoming.length, 2);
    assert.equal(incoming[0].borrowerPhone, "91234567");
    assert.equal((await listIncoming(ola)).length, 0);
    assert.equal((await listIncoming(admin)).length, 0, "administrator ser ikke andres forespørsler");
  });
  await check("en forespørsel sperrer ikke kalenderen før eieren har sagt ja", async () => {
    assert.deepEqual((await getCalendar(persHytte)).taken, []);
  });
  await check("bare eieren kan svare", async () => {
    await refused(() => decideBooking(lise, olasId, "approve", ""), /Fant ikke forespørselen/);
    await refused(() => decideBooking(admin, olasId, "approve", ""), /Fant ikke forespørselen/);
  });

  const approval = await sentDuring(() => decideBooking(per, olasId, "approve", "Velkommen!"));
  await check("etter ja vises Vipps-nummer, men ikke adressen", async () => {
    const [mine] = await listOutgoing(ola);
    assert.equal(mine.booking.status, "approved");
    assert.equal(mine.vippsNumber, "91234567");
    assert.equal(mine.arrivalInfo, null);
    assert.deepEqual([mine.address, mine.latitude, mine.longitude], [null, null, null]);
    assert.equal(mine.booking.ownerReply, "Velkommen!");
    assert.equal(approval.mails[0].text.includes("Fjellvegen"), false);
    assert.equal(approval.mails[0].text.includes("Nøkkelboks"), false);
  });
  await check("eieren kan ikke si ja til to lån som overlapper", () =>
    refused(() => decideBooking(per, lisesId, "approve", ""), /allerede sagt ja/),
  );
  await check("en forespørsel kan bare besvares én gang", () =>
    refused(() => decideBooking(per, olasId, "decline", ""), /allerede besvart/),
  );
  await check("nettene er opptatt i kalenderen etter ja", async () => {
    const calendar = await getCalendar(persHytte);
    assert.deepEqual(calendar.taken, [{ startDate: d(12), endDate: d(14) }]);
    await refused(() => createBooking(lise, persHytte, request(11, 13)), /ikke ledig/);
    const [shared] = (await listSharedCabins(lise)).filter((c) => c.cabin.id === persHytte);
    assert.deepEqual(shared.free, [
      { startDate: d(10), endDate: d(12) },
      { startDate: d(14), endDate: d(40) },
    ]);
  });
  const decline = await sentDuring(() => decideBooking(per, lisesId, "decline", "Opptatt, dessverre."));
  let lisesStay = "";
  await check("avreisedag kan være neste låners ankomstdag", async () => {
    lisesStay = await createBooking(lise, persHytte, request(14, 16));
    await decideBooking(per, lisesStay, "approve", "");
  });

  console.log("Betaling og avlysning (akseptansetest 8 og 10)");
  await check("venn kan ikke markere betalt", () =>
    refused(() => markPaid(ola, olasId), /Fant ikke forespørselen/),
  );
  const payment = await sentDuring(() => markPaid(per, olasId));
  await check("etter betaling vises adressen til låneren", async () => {
    const mine = (await listOutgoing(ola)).find((b) => b.booking.id === olasId);
    assert.equal(mine?.booking.status, "paid");
    assert.equal(mine?.arrivalInfo, "Nøkkelboks kode 1234");
    assert.equal(mine?.address, "Fjellvegen 12, 2636 Øyer");
    assert.deepEqual([mine?.latitude, mine?.longitude], [61.2345, 10.4567]);
  });
  await check("adresse og ankomstinfo vises bare til den som har betalt", async () => {
    const lises = await listOutgoing(lise);
    assert.equal(lises.some((b) => b.booking.id === olasId), false, "andre ser ikke oppholdet");
    const approved = lises.find((b) => b.booking.id === lisesStay);
    assert.equal(approved?.booking.status, "approved");
    assert.deepEqual([approved?.address, approved?.arrivalInfo], [null, null]);
    assert.equal(JSON.stringify(await listSharedCabins(lise)).includes("Fjellvegen"), false);
    assert.equal(JSON.stringify(await getVisibleCabin(lise, persHytte)).includes("Nøkkelboks"), false);
    assert.equal(payment.mails[0].text.includes("Fjellvegen"), false, "adressen står ikke i e-posten");
  });
  await check("kan ikke markere betalt to ganger", () =>
    refused(() => markPaid(per, olasId), /sagt ja til/),
  );
  await check("låneren kan ikke avlyse et betalt lån selv", () =>
    refused(() => cancelBooking(ola, olasId), /Ta kontakt med eieren/),
  );
  await check("uvedkommende kan ikke avlyse", () =>
    refused(() => cancelBooking(admin, olasId), /Fant ikke forespørselen/),
  );

  console.log("Akseptansetest 7: tilbaketrukket deling");
  await check("eieren ser hva som blir stående før delingen fjernes", async () => {
    const sharing = await listCabinSharing(per, persHytte);
    const olas = sharing?.people.find((p) => p.userId === ola.id);
    assert.deepEqual([olas?.pendingRequests, olas?.confirmedStays], [0, 1]);
  });
  await check("bare eieren kan trekke tilbake en deling", async () => {
    await refused(() => revokeAccess(lise, persHytte, ola.id), /Fant ikke personen/);
    await refused(() => revokeAccess(admin, persHytte, ola.id), /Fant ikke personen/);
    await refused(() => revokeAccess(per, persHytte, admin.id), /Fant ikke personen/);
  });
  const revocation = await sentDuring(() => revokeAccess(per, persHytte, ola.id));
  await check("etter tilbaketrekking ser ikke personen hytta og kan ikke sende nye forespørsler", async () => {
    assert.deepEqual(revocation.result, { name: "Ola Venn", cabinId: persHytte });
    assert.equal(await getVisibleCabin(ola, persHytte), null);
    assert.deepEqual(await listSharedCabins(ola), []);
    assert.deepEqual((await getCircle(ola)).people, []);
    await refused(() => createBooking(ola, persHytte, request(20, 22)), /Fant ikke hytta/);
  });
  await check("oppholdet som var bekreftet, står urørt", async () => {
    const mine = (await listOutgoing(ola)).find((b) => b.booking.id === olasId);
    assert.equal(mine?.booking.status, "paid");
    assert.equal(mine?.address, "Fjellvegen 12, 2636 Øyer");
    assert.equal(mine?.arrivalInfo, "Nøkkelboks kode 1234");
    const incoming = (await listIncoming(per)).find((b) => b.booking.id === olasId);
    assert.equal(incoming?.booking.status, "paid");
    const taken = (await getCalendar(persHytte)).taken;
    assert.equal(taken.some((t) => t.startDate === d(12) && t.endDate === d(14)), true);
    assert.equal(revocation.mails.length, 0, "ingen e-post, og ingenting er avlyst");
  });
  const cancellation = await sentDuring(() => cancelBooking(per, olasId));
  await check("eieren avlyser med en egen handling, og nettene blir ledige igjen", async () => {
    const calendar = await getCalendar(persHytte);
    assert.deepEqual(calendar.taken, [{ startDate: d(14), endDate: d(16) }]);
    const mine = (await listOutgoing(ola)).find((b) => b.booking.id === olasId);
    assert.equal(mine?.booking.status, "cancelled");
    assert.deepEqual([mine?.address, mine?.arrivalInfo, mine?.vippsNumber], [null, null, null]);
  });
  await check("eieren kan dele med samme person på nytt", async () => {
    const again = await inviteToCabin(per, persHytte, "ola@test.local");
    assert.equal(again.status, "shared");
    assert.ok(await getVisibleCabin(ola, persHytte));
    assert.equal(await accessCount(persHytte, ola.id), 1);
  });

  console.log("Akseptansetest 9: to bekreftelser samtidig");
  await inviteToCabin(admin, annesHytte, "ola@test.local");
  await check("to overlappende forespørsler kan ikke bekreftes samtidig", async () => {
    const rounds = 6;
    for (let round = 0; round < rounds; round++) {
      const start = 12 + round * 4;
      const first = await createBooking(ola, annesHytte, request(start, start + 3));
      const second = await createBooking(lise, annesHytte, request(start + 1, start + 4));
      const answers = await Promise.allSettled([
        decideBooking(admin, first, "approve", ""),
        decideBooking(admin, second, "approve", ""),
      ]);
      assert.equal(
        answers.filter((a) => a.status === "fulfilled").length,
        1,
        `runde ${round + 1}: nøyaktig ett ja skal gå gjennom`,
      );
      const stopped = answers.find((a) => a.status === "rejected");
      assert.ok(stopped?.status === "rejected" && stopped.reason instanceof UserError);
      assert.match(stopped.reason.message, /allerede sagt ja/);
    }
    const confirmed = await db.execute<{ start_date: string; end_date: string }>(
      sql`select "start_date", "end_date" from "booking" where "cabin_id" = ${annesHytte} and "status" in ('approved', 'paid') order by "start_date"`,
    );
    assert.equal(confirmed.rows.length, rounds);
    for (let i = 1; i < confirmed.rows.length; i++) {
      assert.ok(
        confirmed.rows[i - 1].end_date <= confirmed.rows[i].start_date,
        "ingen bekreftede opphold overlapper",
      );
    }
  });

  console.log("Akseptansetest 11: varsler");
  const only = (mails: Sent[], to: string, subject: RegExp) => {
    assert.equal(mails.length, 1, `forventet én e-post, fikk ${mails.length}`);
    assert.equal(mails[0].to, to);
    assert.match(mails[0].subject, subject);
  };
  await check("hvert steg gir én e-post, til riktig mottaker", () => {
    only(olasRequest.mails, "per@test.local", /^Ola Venn vil låne Pers hytte$/);
    only(approval.mails, "ola@test.local", /^Ja! Du får låne Pers hytte$/);
    only(decline.mails, "lise@test.local", /^Pers hytte passer ikke denne gangen$/);
    only(payment.mails, "ola@test.local", /^Pers hytte er reservert$/);
    only(cancellation.mails, "ola@test.local", /^Lånet av Pers hytte er avlyst$/);
    only(olaInvitation.mails, "ola@test.local", /^Per Eier inviterer deg til /);
  });
  await check("ingen e-post går til andre enn testbrukerne", async () => {
    const all = await outbox();
    assert.ok(all.length > 0);
    assert.deepEqual(
      all.filter((mail) => !mail.to.endsWith("@test.local")),
      [],
    );
  });
  await check("tjenesten skiller mellom lagret invitasjon og e-post som leverandøren tok imot", async () => {
    // Uten e-postoppsett i produksjon tar ingen leverandør imot e-posten.
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    const silenced = console.error;
    env.NODE_ENV = "production";
    console.error = () => {};
    try {
      const sent = await sentDuring(() => inviteToCabin(kari, karisHytte, "uten-epost@test.local"));
      assert.equal(sent.result.status, "invited");
      assert.equal(sent.result.emailAccepted, false, "eieren får vite at e-posten ikke gikk");
      assert.equal(sent.mails.length, 0);
    } finally {
      env.NODE_ENV = before;
      console.error = silenced;
    }
    assert.equal(await isEmailAllowed("uten-epost@test.local"), true, "invitasjonen er lagret");
  });

  console.log("Kalender (akseptansetest 13)");
  await check("ledige perioder slås sammen, og opptatte netter trekkes fra", () => {
    const free = freePeriods(
      [
        { startDate: "2027-01-01", endDate: "2027-01-10" },
        { startDate: "2027-01-10", endDate: "2027-01-20" },
        { startDate: "2027-03-01", endDate: "2027-03-05" },
        { startDate: "2026-12-01", endDate: "2026-12-03" },
      ],
      [
        { startDate: "2027-01-05", endDate: "2027-01-07" },
        { startDate: "2027-03-01", endDate: "2027-03-05" },
      ],
      "2026-12-02",
    );
    assert.deepEqual(free, [
      { startDate: "2026-12-02", endDate: "2026-12-03" },
      { startDate: "2027-01-01", endDate: "2027-01-05" },
      { startDate: "2027-01-07", endDate: "2027-01-20" },
    ]);
    assert.deepEqual(freePeriods([], [], "2026-12-02"), []);
  });
  await check("kalenderen når siste registrerte dato, også etter tolv måneder", async () => {
    await addAvailability(kari, karisHytte, d(380), d(430));
    const calendar = await getCalendar(karisHytte);
    const lastDay = calendar.available.reduce((max, p) => (p.endDate > max ? p.endDate : max), today);
    assert.equal(lastDay, d(430));
    const months = monthsBetween(today, lastDay);
    assert.ok(months.length >= 14, `forventet minst 14 måneder, fikk ${months.length}`);
    assert.equal(months[0], monthOf(today));
    assert.equal(months[months.length - 1], monthOf(d(430)));
    assert.equal(new Set(months).size, months.length);
    const free = freePeriods(calendar.available, calendar.taken, calendar.today);
    assert.deepEqual(free[free.length - 1], { startDate: d(380), endDate: d(430) });
  });
  await check("hver dato har ukedag og dato til skjermleseren, og uka starter på mandag", () => {
    assert.equal(formatDateLong("2027-02-19"), "fredag 19. februar 2027");
    assert.deepEqual(monthGrid("2027-02").slice(0, 2), ["2027-02-01", "2027-02-02"]);
    assert.equal(monthGrid("2027-02").length, 28);
    // 1. november 2026 er en søndag: seks tomme ruter først.
    assert.deepEqual(monthGrid("2026-11").slice(0, 7), [null, null, null, null, null, null, "2026-11-01"]);
    assert.deepEqual(monthsBetween("2026-11-14", "2027-02-01"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  console.log("Tall for administratorene");
  await check("bare administratorer får tallene", async () => {
    await refused(() => getPilotMetrics(kari), /administratorer/);
    await refused(() => getWeeklyMetrics(ola), /administratorer/);
  });
  await check("tallene inneholder bare antall, aldri navn eller adresser", async () => {
    const m = await getPilotMetrics(admin);
    for (const [key, value] of Object.entries(m)) {
      assert.ok(value === null || typeof value === "number", `${key} er ikke et tall`);
    }
    const weeks = await getWeeklyMetrics(admin);
    assert.equal(weeks.length, WEEKS);
    for (const week of weeks) {
      assert.match(week.week, /^\d{4}-\d{2}-\d{2}$/);
      for (const key of ["newMembers", "invitesSent", "requests"] as const) assert.equal(typeof week[key], "number");
    }
  });
  await check("medlemmer, K-faktor og generasjoner stemmer med en uavhengig opptelling", async () => {
    const m = await getPilotMetrics(admin);
    const users = (await db.execute(sql`select u.id, u.email, p.user_id is not null as has_profile
      from "user" u left join profile p on p.user_id = u.id`)).rows as { id: string; email: string; has_profile: boolean }[];
    const admins = new Set(users.filter((u) => u.email === "admin@test.local").map((u) => u.id));
    const members = users.filter((u) => u.has_profile && !admins.has(u.id));
    const invites = (await db.execute(sql`select email, invited_by, accepted_at from invitation
      where accepted_at is not null order by accepted_at`)).rows as { email: string; invited_by: string }[];
    const firstInviter = new Map<string, string>();
    for (const u of members) {
      const first = invites.find((i) => i.email.toLowerCase() === u.email.toLowerCase());
      if (first) firstInviter.set(u.id, first.invited_by);
    }
    const memberIds = new Set(members.map((u) => u.id));
    const brought = [...firstInviter.values()].filter((by) => memberIds.has(by)).length;
    assert.equal(m.admins, 1);
    assert.equal(m.members, members.length);
    assert.equal(m.broughtIn, brought);
    assert.ok(Math.abs(m.k - brought / members.length) < 1e-9);
    assert.ok(Math.abs(m.i * m.c - m.k) < 1e-9, "K skal være i × c");

    const gen = (id: string, depth = 0): number => {
      const by = firstInviter.get(id);
      if (!by || depth > 20) return 0;
      if (admins.has(by)) return 1;
      const g = gen(by, depth + 1);
      return g === 0 ? 0 : g + 1;
    };
    const gens = members.map((u) => gen(u.id));
    assert.equal(m.gen1, gens.filter((g) => g === 1).length);
    assert.equal(m.gen2, gens.filter((g) => g === 2).length);
    assert.equal(m.gen3plus, gens.filter((g) => g >= 3).length);
    assert.ok(m.maxGen >= 3, "Kari, Per og Ola gir minst tre generasjoner");
  });
  await check("et nytt medlem som ikke inviterer noen, senker K-faktoren", async () => {
    const before = await getPilotMetrics(admin);
    await inviteAccount(admin, "stille@test.local", "");
    await register("stille@test.local", "Stille Medlem");
    const after = await getPilotMetrics(admin);
    assert.equal(after.members, before.members + 1);
    assert.equal(after.broughtIn, before.broughtIn);
    assert.equal(after.gen1, before.gen1 + 1);
    assert.ok(after.k < before.k);
    assert.equal(after.membersLast7, before.membersLast7 + 1);
  });
  await check("lån telles riktig", async () => {
    const m = await getPilotMetrics(admin);
    const [row] = (await db.execute(sql`select
      count(*) filter (where status = 'paid') as paid,
      coalesce(sum(end_date - start_date) filter (where status = 'paid'), 0) as nights,
      count(*) as total from booking`)).rows as Record<string, unknown>[];
    assert.equal(m.requests, Number(row.total));
    assert.equal(m.staysPaid, Number(row.paid));
    assert.equal(m.nightsPaid, Number(row.nights));
    assert.ok(m.requestsApproved >= m.staysPaid);
  });

  console.log("Mest populære hytter for administratorene");
  await check("bare administratorer får hyttelisten", async () => {
    await refused(() => getCabinStats(kari), /administratorer/);
  });
  await check("listen har navn, sted og eier, men aldri adresse, Vipps eller hvem som lånte", async () => {
    const cabins = await getCabinStats(admin);
    assert.ok(cabins.some((c) => c.name === "Karis hytte" && c.owner === "Kari Eier"));
    const allowed = ["approved", "area", "askers", "createdAt", "id", "invitesSent", "name", "nightsPaid", "open",
      "owner", "requests", "requestsLast30", "staysPaid", "valuePaid", "viewers"];
    for (const c of cabins) assert.deepEqual(Object.keys(c).sort(), allowed);
  });
  await check("tallene per hytte summerer seg til totalene", async () => {
    const [m, cabins] = await Promise.all([getPilotMetrics(admin), getCabinStats(admin)]);
    const sum = (f: (c: (typeof cabins)[number]) => number) => cabins.reduce((a, c) => a + f(c), 0);
    assert.equal(cabins.length, m.cabins);
    assert.equal(sum((c) => c.requests), m.requests);
    assert.equal(sum((c) => c.staysPaid), m.staysPaid);
    assert.equal(sum((c) => c.nightsPaid), m.nightsPaid);
    assert.equal(sum((c) => c.valuePaid), m.valuePaid);
    assert.equal(sum((c) => c.approved), m.requestsApproved);
    assert.equal(cabins.filter((c) => c.viewers > 0).length, m.cabinsShared);
    assert.equal(cabins.filter((c) => c.open).length, m.cabinsOpen);
  });
  await check("den mest populære hytta kommer først, etter valgt tall", async () => {
    for (const [sort, key] of [["foresporsler", "requests"], ["netter", "nightsPaid"], ["ser", "viewers"]] as const) {
      const cabins = await getCabinStats(admin, sort);
      for (let n = 1; n < cabins.length; n++) assert.ok(cabins[n - 1][key] >= cabins[n][key], `${sort} er ikke sortert`);
    }
    assert.ok((await getCabinStats(admin))[0].requests > 0);
    assert.equal(parseCabinSort("netter"), "netter");
    assert.equal(parseCabinSort("tull"), "foresporsler");
    assert.equal(parseCabinSort(["ser"]), "foresporsler");
  });

  console.log("Invitasjon med ett klikk: hytta vises før innlogging");
  const ettKlikk = await sentDuring(() => inviteToCabin(kari, karisHytte, "ettklikk@test.local"));
  const ettToken = tokenIn(ettKlikk.mails[0]);
  await check("lenken viser bilder, området og grovt kart, men ikke navn, pris eller adresse", async () => {
    const preview = await getInvitationPreview(ettToken);
    assert.ok(preview?.cabin, "hytta skal vises uten innlogging");
    assert.equal(preview.status, "valid");
    assert.equal(preview.inviterName, "Kari Eier");
    assert.equal(preview.cabin.area, "Hafjell");
    assert.deepEqual(preview.cabin.photos, await listCabinPhotos(karisHytte));
    assert.ok(preview.cabin.photos.length > 0);
    assert.ok(preview.cabin.areaPosition);
    assert.notDeepEqual(preview.cabin.areaPosition, { latitude: 61.2345, longitude: 10.4567 });
    const json = JSON.stringify(preview);
    for (const secret of ["Karis hytte", "Fjellvegen", "61.2345", "10.4567", "91234567", "Nøkkelboks", "ettklikk@"]) {
      assert.equal(json.includes(secret), false, `${secret} skal ikke vises uten innlogging`);
    }
    assert.match(ettKlikk.mails[0].text, /Se hytta:\n.*\/invitasjon\//);
  });
  await check("lenken viser bare bilder av hytta den gjelder", async () => {
    const [karis] = await listCabinPhotos(karisHytte);
    const [annes] = await listCabinPhotos(annesHytte);
    assert.ok(await getPhotoForViewer({ invitationToken: ettToken }, karis.id, "full"));
    assert.ok(await getPhotoForViewer({ invitationToken: ettToken }, karis.id, "thumb"));
    assert.equal(await getPhotoForViewer({ invitationToken: ettToken }, annes.id, "full"), null);
    assert.equal(await getPhotoForViewer({ invitationToken: "x".repeat(32) }, karis.id, "full"), null);
    assert.equal(await getPhotoForViewer({ invitationToken: "ikke gyldig" }, karis.id, "full"), null);
  });
  await check("eieren ser invitasjonssiden med nøyaktig det den inviterte ser", async () => {
    const own = await getOwnInvitationPreview(kari, karisHytte);
    const invited = await getInvitationPreview(ettToken);
    assert.ok(own && invited?.cabin);
    assert.equal(own.inviterName, invited.inviterName);
    assert.deepEqual(own.cabin, invited.cabin);
    const json = JSON.stringify(own);
    for (const secret of ["Karis hytte", "Fjellvegen", "61.2345", "10.4567", "91234567", "Nøkkelboks"]) {
      assert.equal(json.includes(secret), false, `${secret} skal ikke være med i forhåndsvisningen`);
    }
  });
  await check("bare eieren får forhåndsvisningen av invitasjonssiden", async () => {
    assert.equal(await getOwnInvitationPreview(admin, karisHytte), null);
    assert.equal(await getOwnInvitationPreview(per, karisHytte), null);
    assert.equal(await getOwnInvitationPreview(kari, "ikke en id"), null);
  });
  await check("lenken kan åpnes flere ganger, også etter at den er tatt i bruk", async () => {
    for (let i = 0; i < 3; i++) assert.ok((await getInvitationPreview(ettToken))?.cabin);
    const ett = await register("ettklikk@test.local", "Eva Ettklikk");
    assert.ok(await getVisibleCabin(ett, karisHytte));
    const after = await getInvitationPreview(ettToken);
    assert.equal(after?.status, "accepted");
    assert.ok(after?.cabin, "lenken viser fortsatt hytta innenfor fristen");
  });
  await check("innloggingen fylles ut med adressen invitasjonen ble sendt til", async () => {
    assert.equal(await getInvitedEmail(ettToken), "ettklikk@test.local");
    assert.equal(await getInvitedEmail("ikke gyldig"), null);
    assert.equal(await getInvitedEmail("y".repeat(32)), null);
  });

  console.log("Innlogging fra invitasjonen med en annen adresse");
  const delt = await sentDuring(() => inviteToCabin(kari, karisHytte, "mottaker@test.local"));
  const deltToken = tokenIn(delt.mails[0]);
  await check("en videresendt e-post slipper ingen inn med lenken alene", async () => {
    assert.equal(await isEmailAllowed("partner@test.local"), false);
    // Den inviterte adressen selv lager ingen forespørsel.
    await registerAccessRequest(deltToken, "Mottaker@test.local");
    const rows = await db.execute(sql`select count(*)::int as n from "invitation_request"`);
    assert.equal((rows.rows[0] as { n: number }).n, 0);
  });
  await check("en annen adresse slipper inn, men ser ingenting før eieren godkjenner", async () => {
    await registerAccessRequest(deltToken, " Partner@Test.Local ");
    assert.equal(await isEmailAllowed("partner@test.local"), true);
    const { result: partner, mails } = await sentDuring(() =>
      register("partner@test.local", "Pia Partner"),
    );
    assert.equal(await getVisibleCabin(partner, karisHytte), null);
    assert.deepEqual(await listSharedCabins(partner), []);
    const [karis] = await listCabinPhotos(karisHytte);
    assert.equal(await getPhotoForViewer(partner, karis.id, "full"), null);
    assert.deepEqual(await getAccessRequestState(partner, deltToken), { state: "pending" });
    // Eieren får beskjed med begge adressene, og ingen andre får e-post.
    assert.deepEqual(mails.map((m) => m.to), ["kari@test.local"]);
    assert.match(mails[0].subject, /Pia Partner vil se Karis hytte/);
    assert.match(mails[0].text, /partner@test\.local/);
    assert.match(mails[0].text, /mottaker@test\.local/);
    const sharing = await listCabinSharing(kari, karisHytte);
    assert.deepEqual(
      sharing?.requests.map((r) => [r.name, r.email, r.invitedEmail]),
      [["Pia Partner", "partner@test.local", "mottaker@test.local"]],
    );
  });
  await check("bare eieren kan godkjenne, og da ser personen hytta", async () => {
    const partner = await actor(
      ((await db.execute(sql`select id from "user" where email = 'partner@test.local'`)).rows[0] as { id: string }).id,
    );
    const [request] = (await listCabinSharing(kari, karisHytte))?.requests ?? [];
    await refused(() => approveAccessRequest(per, request.id), /Fant ikke forespørselen/);
    await refused(() => approveAccessRequest(admin, request.id), /Fant ikke forespørselen/);
    await refused(() => approveAccessRequest(kari, "ikke-en-id"), /Fant ikke forespørselen/);
    assert.equal(await getVisibleCabin(partner, karisHytte), null);
    const { mails } = await sentDuring(() => approveAccessRequest(kari, request.id));
    assert.ok(await getVisibleCabin(partner, karisHytte));
    assert.deepEqual(mails.map((m) => m.to), ["partner@test.local"]);
    assert.deepEqual(await getAccessRequestState(partner, deltToken), {
      state: "has-access",
      cabinId: karisHytte,
    });
    assert.deepEqual((await listCabinSharing(kari, karisHytte))?.requests, []);
    await refused(() => approveAccessRequest(kari, request.id), /allerede besvart/);
    // Den inviterte kan fortsatt bruke invitasjonen sin.
    assert.equal(await isEmailAllowed("mottaker@test.local"), true);
  });
  await check("eieren kan si nei, og da ser personen fortsatt ingenting", async () => {
    await registerAccessRequest(deltToken, "fremmed@test.local");
    const fremmed = await register("fremmed@test.local", "Frank Fremmed");
    const [request] = (await listCabinSharing(kari, karisHytte))?.requests ?? [];
    assert.equal(request?.email, "fremmed@test.local");
    await declineAccessRequest(kari, request.id);
    assert.equal(await getVisibleCabin(fremmed, karisHytte), null);
    assert.deepEqual(await getAccessRequestState(fremmed, deltToken), { state: "declined" });
    await requestAccessViaInvitation(fremmed, deltToken);
    assert.deepEqual((await listCabinSharing(kari, karisHytte))?.requests, []);
  });
  await check("et innlogget medlem kan be eieren om å se hytta fra lenken", async () => {
    const medlem = await register("mona@test.local", "Mona Lenke");
    assert.deepEqual(await getAccessRequestState(medlem, deltToken), { state: "none" });
    const { mails } = await sentDuring(() => requestAccessViaInvitation(medlem, deltToken));
    assert.deepEqual(mails.map((m) => m.to), ["kari@test.local"]);
    assert.deepEqual(await getAccessRequestState(medlem, deltToken), { state: "pending" });
    assert.equal(await getVisibleCabin(medlem, karisHytte), null);
    const again = await sentDuring(() => requestAccessViaInvitation(medlem, deltToken));
    assert.equal(again.mails.length, 0, "ingen ny e-post ved gjentatt trykk");
  });
  await check("en spredt lenke slipper inn høyst noen få andre adresser", async () => {
    const spredt = await sentDuring(() => inviteToCabin(kari, karisHytte, "spredt@test.local"));
    const token = tokenIn(spredt.mails[0]);
    for (let i = 0; i < MAX_ACCESS_REQUESTS + 2; i++) {
      await registerAccessRequest(token, `spredt${i}@test.local`);
    }
    assert.equal(await isEmailAllowed(`spredt${MAX_ACCESS_REQUESTS - 1}@test.local`), true);
    assert.equal(await isEmailAllowed(`spredt${MAX_ACCESS_REQUESTS}@test.local`), false);
    const sen = await register("sen-medlem@test.local", "Sigurd Sen");
    assert.deepEqual(await getAccessRequestState(sen, token), { state: "full" });
    await refused(() => requestAccessViaInvitation(sen, token), /For mange/);
  });
  await check("tilbaketrukket invitasjon viser ingen hytte, og forespørslene faller bort", async () => {
    const sharing = await listCabinSharing(kari, karisHytte);
    const waiting = sharing?.invitations.find((i) => i.email === "mottaker@test.local");
    assert.ok(waiting);
    assert.equal(sharing?.requests.length, 1, "Mona venter");
    await revokeInvitation(kari, waiting.id);
    const preview = await getInvitationPreview(deltToken);
    assert.equal(preview?.status, "revoked");
    assert.equal(preview?.cabin, null);
    const [karis] = await listCabinPhotos(karisHytte);
    assert.equal(await getPhotoForViewer({ invitationToken: deltToken }, karis.id, "full"), null);
    assert.deepEqual((await listCabinSharing(kari, karisHytte))?.requests, []);
    assert.equal(await getInvitedEmail(deltToken), null);
    await registerAccessRequest(deltToken, "for-sent@test.local");
    assert.equal(await isEmailAllowed("for-sent@test.local"), false);
  });
  await check("utløpt invitasjon viser ingen hytte", async () => {
    const sent = await sentDuring(() => inviteToCabin(kari, karisHytte, "gammel@test.local"));
    const token = tokenIn(sent.mails[0]);
    await expire("gammel@test.local");
    const preview = await getInvitationPreview(token);
    assert.equal(preview?.status, "expired");
    assert.equal(preview?.cabin, null);
  });

  console.log("Medlemsliste for administratorene");
  await check("bare administratorer får medlemslisten", async () => {
    await refused(() => listMembers(kari), /administratorer/);
  });
  await check("listen har alle som har registrert seg, med navn, e-post og hvem som inviterte", async () => {
    const members = await listMembers(admin);
    const [row] = (await db.execute(sql`select count(*) as n from profile`)).rows as { n: string }[];
    assert.equal(members.length, Number(row.n));
    const perRow = members.find((m) => m.email === "per@test.local");
    assert.equal(perRow?.name, "Per Eier");
    assert.equal(perRow?.invitedBy, "Kari Eier");
    assert.equal(members.find((m) => m.email === "admin@test.local")?.isAdmin, true);
    assert.equal(members.find((m) => m.email === "kari@test.local")?.invitedBy, "Anne Admin");
    for (const m of members) assert.deepEqual(Object.keys(m).sort(), ["email", "invitedBy", "isAdmin", "joinedAt", "lastLoginAt", "name"]);
  });
  await check("CSV-filen leses riktig i Excel og kan ikke lure inn formler", () => {
    const csv = membersToCsv([
      { name: 'Ærlig "Øystein"', email: "a@test.local", joinedAt: new Date("2026-11-14T23:30:00Z"), lastLoginAt: null, invitedBy: null, isAdmin: false },
      { name: "=HYPERLINK(1)", email: "b@test.local", joinedAt: new Date("2026-11-14T10:00:00Z"), lastLoginAt: new Date("2026-11-18T20:40:00Z"), invitedBy: "Kari", isAdmin: true },
    ]);
    assert.ok(csv.startsWith("\uFEFF\"Navn\";\"E-post\""));
    assert.match(csv, /"Ærlig ""Øystein""";"a@test.local";"2026-11-15";"";"";"Nei"/);
    assert.match(csv, /"'=HYPERLINK\(1\)";"b@test.local";"2026-11-14";"2026-11-18 21:40";"Kari";"Ja"/);
  });

  console.log("Påminnelse før feriene");
  {
    const eva = await register("eva@test.local", "Eva Eier");
    const nabo = await register("nabo@test.local", "Nils Nabo");
    const evaCabin = await createCabin(eva, cabinData("Evas hytte"));
    const today = todayInOslo();
    const year = Number(today.slice(0, 4));
    // Den første ferien som begynner om minst en måned.
    const holiday = [...holidaysInYear(year), ...holidaysInYear(year + 1)].find(
      (h) => h.startDate >= addDays(today, 30),
    )!;
    const at = (date: string) => new Date(`${date}T10:00:00Z`);
    const inWindow = at(addDays(holiday.startDate, -20));
    const tooEarly = at(addDays(holiday.startDate, -40));
    const tooLate = at(addDays(holiday.startDate, -3));
    await addAvailability(eva, evaCabin, addDays(holiday.startDate, 1), addDays(holiday.startDate, 4));
    const createdAt = (date: Date) =>
      db.execute(sql`update "cabin" set "created_at" = ${date} where "id" = ${evaCabin}`);
    const clearSent = () =>
      db.execute(sql`update "cabin" set "idle_reminder_sent_at" = null where "id" = ${evaCabin}`);
    const mailsToEva = (mails: Sent[]) => mails.filter((m) => m.to === "eva@test.local");

    await check("feriene i Norge har riktige datoer", () => {
      assert.equal(easterSunday(2027), "2027-03-28");
      assert.equal(easterSunday(2028), "2028-04-16");
      const h2027 = holidaysInYear(2027);
      assert.deepEqual(
        h2027.map((h) => h.name),
        ["vinterferien", "påsken", "sommerferien", "høstferien", "julen"],
      );
      // Uke 8 i 2027 begynner mandag 22. februar.
      assert.deepEqual(h2027[0], { name: "vinterferien", startDate: "2027-02-20", endDate: "2027-03-01" });
      assert.deepEqual(h2027[1], { name: "påsken", startDate: "2027-03-20", endDate: "2027-03-30" });
      // Uke 40 i 2027 begynner mandag 4. oktober.
      assert.deepEqual(h2027[3], { name: "høstferien", startDate: "2027-10-02", endDate: "2027-10-11" });
      assert.equal(upcomingHoliday("2027-01-30", 28, 7)?.name, "vinterferien");
      assert.equal(upcomingHoliday("2027-02-25", 28, 7)?.name, "påsken");
      assert.equal(upcomingHoliday("2027-01-10", 28, 7), null);
      assert.equal(upcomingHoliday("2027-12-01", 28, 7)?.name, "julen");
    });

    await check("første ledige periode på minst to netter i ferien finnes", () => {
      const within = { startDate: "2027-02-20", endDate: "2027-03-01" };
      const open = [
        { startDate: "2027-02-10", endDate: "2027-02-21" },
        { startDate: "2027-02-24", endDate: "2027-03-05" },
      ];
      assert.deepEqual(firstIdlePeriod(open, [], "2027-01-30", within), {
        startDate: "2027-02-24",
        endDate: "2027-03-01",
      });
      assert.equal(firstIdlePeriod([open[0]], [], "2027-01-30", within), null);
    });

    await check("en ny hytte får ingen påminnelse den første uka", async () => {
      await createdAt(new Date(inWindow.getTime() - 2 * 24 * 60 * 60 * 1000));
      const { mails } = await sentDuring(() => sendIdleReminders(inWindow));
      assert.equal(mailsToEva(mails).length, 0);
      await createdAt(new Date());
    });

    await check("ingen påminnelse når ingen ferie nærmer seg", async () => {
      const early = await sentDuring(() => sendIdleReminders(tooEarly));
      const late = await sentDuring(() => sendIdleReminders(tooLate));
      assert.equal(mailsToEva(early.mails).length + mailsToEva(late.mails).length, 0);
    });

    await check("ledig hytte i ferien gir eieren én påminnelse med lenke til invitasjonen", async () => {
      const { mails } = await sentDuring(() => sendIdleReminders(inWindow));
      const [mail] = mailsToEva(mails);
      assert.ok(mail, "eieren skal få påminnelse");
      assert.equal(mails.filter((m) => m.text.includes("Evas hytte")).length, 1);
      assert.equal(mail.subject, `Evas hytte er ledig i ${holiday.name}`);
      assert.ok(mail.text.includes(`/mine-hytter/${evaCabin}/inviter`));
      assert.doesNotMatch(mail.text, /dele/i);
    });

    await check("samme hytte får ikke ny påminnelse før samme ferie", async () => {
      const { mails } = await sentDuring(() => sendIdleReminders(inWindow));
      assert.equal(mailsToEva(mails).length, 0);
      const nextDay = new Date(inWindow.getTime() + 24 * 60 * 60 * 1000);
      const later = await sentDuring(() => sendIdleReminders(nextDay));
      assert.equal(mailsToEva(later.mails).length, 0);
    });

    await check("to kjøringer samtidig sender påminnelsen bare én gang", async () => {
      await clearSent();
      const { mails } = await sentDuring(() =>
        Promise.all([
          sendIdleReminders(inWindow),
          sendIdleReminders(inWindow),
          sendIdleReminders(inWindow),
        ]),
      );
      assert.equal(mailsToEva(mails).length, 1);
    });

    await check("en forespørsel i ferien betyr at hytta ikke står ledig", async () => {
      await clearSent();
      const [request] = await db
        .insert(booking)
        .values({
          cabinId: evaCabin,
          borrowerId: nabo.id,
          startDate: addDays(holiday.startDate, 1),
          endDate: addDays(holiday.startDate, 2),
          guests: 2,
          totalPrice: 1000,
        })
        .returning({ id: booking.id });
      const { mails } = await sentDuring(() => sendIdleReminders(inWindow));
      assert.equal(mailsToEva(mails).length, 0);
      await db.execute(sql`delete from "booking" where "id" = ${request.id}`);
    });

    await check("eieren kan slå av påminnelsene, og bare eieren", async () => {
      await refused(() => setIdleReminders(nabo, evaCabin, false), /Fant ikke hytta/);
      await refused(() => setIdleReminders(eva, "ikke-en-id", false), /Fant ikke hytta/);
      await setIdleReminders(eva, evaCabin, false);
      const { mails } = await sentDuring(() => sendIdleReminders(inWindow));
      assert.equal(mailsToEva(mails).length, 0);
      assert.equal((await getOwnCabin(eva, evaCabin))?.remindWhenIdle, false);
      await setIdleReminders(eva, evaCabin, true);
    });

    await check("hytte uten åpne datoer i ferien får ingen påminnelse", async () => {
      const empty = await createCabin(eva, cabinData("Evas andre hytte"));
      await addAvailability(eva, empty, addDays(today, 2), addDays(today, 6));
      const { mails } = await sentDuring(() => sendIdleReminders(inWindow));
      assert.equal(mails.filter((m) => m.text.includes("Evas andre hytte")).length, 0);
    });
  }

  console.log("Brems på innlogging");
  await check("sjette kodeforespørsel på et kvarter stoppes", async () => {
    for (let i = 0; i < 5; i++) assert.equal(await isThrottled("e:test", 5), false);
    assert.equal(await isThrottled("e:test", 5), true);
  });

  console.log(`\n${passed} sjekker bestått.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nTESTEN FEILET\n", error);
    process.exit(1);
  });
