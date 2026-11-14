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
import { profile, user } from "../src/lib/db/schema";
import { type Actor, UserError } from "../src/lib/errors";
import { PLEDGE_VERSION } from "../src/lib/pledge";
import { directionLinks, isShortMapLink, parsePosition } from "../src/lib/position";
import { positionInMapPage, resolveShortMapLink } from "../src/lib/services/map-links";
import { searchAddresses } from "../src/lib/services/addresses";
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
  claimInvitations,
  getCircle,
  getInvitationForViewer,
  getPublicInvitation,
  inviteAccount,
  inviteToCabin,
  isEmailAllowed,
  listAccountInvitations,
  listCabinSharing,
  previewShare,
  revokeAccess,
  revokeAccountInvitation,
  revokeInvitation,
  shareWithPerson,
} from "../src/lib/services/invitations";
import { isThrottled } from "../src/lib/services/login";
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
    const search = new URL(request.url ?? "", "http://x").searchParams.get("sok") ?? "";
    seen.push(search);
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
  await check("en ny hytte er privat: ingen andre ser den", async () => {
    assert.equal(await getVisibleCabin(admin, karisHytte), null);
    assert.deepEqual(await listSharedCabins(admin), []);
    const [own] = await listOwnCabins(kari);
    assert.equal(own.sharedWith, 0);
    assert.equal(own.pendingInvitations, 0);
    assert.deepEqual(own.free, [{ startDate: d(10), endDate: d(40) }]);
  });
  await check("det å eie en hytte gir ikke innsyn i andres", async () => {
    assert.equal(await getVisibleCabin(kari, annesHytte), null);
    assert.deepEqual(await listSharedCabins(kari), []);
  });
  await check("administrator ser ikke andres hytter og kan ikke be om dem", async () => {
    assert.equal(await getVisibleCabin(admin, karisHytte), null);
    await refused(
      () => createBooking(admin, karisHytte, { startDate: d(12), endDate: d(14), guests: "2", message: "" }),
      /Fant ikke hytta/,
    );
    assert.equal(await listCabinSharing(admin, karisHytte), null);
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
    assert.match(mail.text, /låner folk som kjenner hverandre, bort hyttene sine til hverandre/);
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
      { label: "Fjellvegen 12, 2636 Øyer", latitude: 61.234568, longitude: 10.456789 },
      { label: "Fjellvegen 12, 8610 Mo i Rana", latitude: 66.3, longitude: 14.1 },
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
  await check("bare de eieren har delt med, får se bildene, også via direkte lenke", async () => {
    const [karis] = await listCabinPhotos(karisHytte);
    const [annes] = await listCabinPhotos(annesHytte);
    assert.ok(await getPhotoForViewer(per, karis.id, "thumb"), "Kari har delt med Per");
    assert.ok(await getPhotoForViewer(lise, annes.id, "full"), "Anne har delt med Lise");
    assert.equal(await getPhotoForViewer(ola, karis.id, "thumb"), null, "venn av Per");
    assert.equal(await getPhotoForViewer(ola, karis.id, "full"), null);
    assert.equal(await getPhotoForViewer(admin, karis.id, "full"), null, "administrator");
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
