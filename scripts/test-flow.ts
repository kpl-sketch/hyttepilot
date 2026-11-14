/**
 * Går gjennom hele låneflyten mot en ekte Postgres-database og sjekker
 * reglene: hvem som slipper inn, hvem som ser hva, og at to lån ikke kan
 * overlappe. Kjøres med: npm test
 *
 * Testen TØMMER databasen. Den nekter derfor å kjøre mot noe annet enn en
 * lokal database.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { addDays, todayInOslo } from "../src/lib/dates";
import { db } from "../src/lib/db";
import { profile, user } from "../src/lib/db/schema";
import { type Actor, UserError } from "../src/lib/errors";
import { PLEDGE_VERSION } from "../src/lib/pledge";
import { directionLinks, parsePosition } from "../src/lib/position";
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
  listVisibleCabins,
  updateCabin,
} from "../src/lib/services/cabins";
import {
  claimInvitations,
  inviteFriend,
  inviteOwner,
  isEmailAllowed,
  listFriendInvitations,
  removeFriendInvitation,
} from "../src/lib/services/invitations";
import { isThrottled } from "../src/lib/services/login";
import {
  addCabinPhotos,
  getPhotoForViewer,
  listCabinPhotos,
  makeCoverPhoto,
  removeCabinPhoto,
} from "../src/lib/services/photos";

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
  const isAdmin = (process.env.ADMIN_EMAILS ?? "").split(",").includes(u.email);
  return { id, email: u.email, name: u.name, isAdmin, isOwner: isAdmin || p.isOwner };
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

  await inviteOwner(admin, "Kari@Test.Local");
  await check("invitert hytteeier slipper inn", async () => {
    assert.equal(await isEmailAllowed("kari@test.local"), true);
  });
  await check("samme hytteeier kan ikke inviteres to ganger", () =>
    refused(() => inviteOwner(admin, "kari@test.local"), /allerede invitert/),
  );
  const kari = await register("kari@test.local", "Kari Eier");
  await check("invitert hytteeier blir hytteeier ved registrering", () => {
    assert.equal(kari.isOwner, true);
    assert.equal(kari.isAdmin, false);
  });
  await check("hytteeier kan ikke invitere andre hytteeiere", () =>
    refused(() => inviteOwner(kari, "per@test.local"), /administratorer/),
  );
  await check("ugyldig e-postadresse avvises", () =>
    refused(() => inviteOwner(admin, "ikke-en-adresse")),
  );

  console.log("Hytter og synlighet");
  const karisHytte = await createCabin(kari, cabinData("Karis hytte"));
  const annesHytte = await createCabin(admin, cabinData("Annes hytte"));
  await addAvailability(kari, karisHytte, d(10), d(40));
  await addAvailability(admin, annesHytte, d(10), d(40));

  await inviteFriend(kari, karisHytte, "ola@test.local");
  await inviteFriend(kari, karisHytte, "lise@test.local");
  const ola = await register("ola@test.local", "Ola Venn");
  const lise = await register("lise@test.local", "Lise Venn");

  await check("venn blir ikke hytteeier", () => {
    assert.equal(ola.isOwner, false);
  });
  await check("venn kan ikke legge inn hytte", () =>
    refused(() => createCabin(ola, cabinData("Olas påfunn")), /inviterte hytteeiere/),
  );
  await check("venn ser bare hytta han er invitert til", async () => {
    const seen = await listVisibleCabins(ola);
    assert.deepEqual(
      seen.map((c) => c.cabin.name),
      ["Karis hytte"],
    );
    assert.equal(await getVisibleCabin(ola, annesHytte), null);
  });
  await check("hytteeier ser alle hyttene", async () => {
    assert.equal((await listVisibleCabins(kari)).length, 2);
  });
  await check("Vipps-nummer og adresse følger ikke med til andre", async () => {
    const seen = await getVisibleCabin(ola, karisHytte);
    assert.ok(seen);
    assert.equal("vippsNumber" in seen.cabin, false);
    assert.equal("arrivalInfo" in seen.cabin, false);
    for (const hidden of ["address", "latitude", "longitude"]) {
      assert.equal(hidden in seen.cabin, false, `${hidden} skal ikke følge med`);
    }
    const [listed] = await listVisibleCabins(ola);
    assert.equal(JSON.stringify(listed).includes("Fjellvegen"), false);
  });
  await check("bare eieren kan invitere til hytta", () =>
    refused(() => inviteFriend(ola, karisHytte, "kompis@test.local"), /egne hytter/),
  );
  await check("bare eieren kan endre ledige perioder", () =>
    refused(() => addAvailability(ola, karisHytte, d(50), d(60)), /Fant ikke hytta/),
  );
  await check("venn registrert fra før får tilgang med en gang", async () => {
    await inviteFriend(admin, annesHytte, "lise@test.local");
    assert.equal((await listVisibleCabins(lise)).length, 2);
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
  await check("adressesøket gir forslag med plassering til hytteeiere", async () => {
    const found = await searchAddresses(kari, "Fjellvegen 1");
    assert.deepEqual(found, [
      { label: "Fjellvegen 12, 2636 Øyer", latitude: 61.234568, longitude: 10.456789 },
      { label: "Fjellvegen 12, 8610 Mo i Rana", latitude: 66.3, longitude: 14.1 },
    ]);
    assert.equal(lookup.seen.at(-1), "Fjellvegen 1*", "søket skal treffe mens eieren skriver");
  });
  await check("bare hytteeiere kan søke etter adresser", () =>
    refused(() => searchAddresses(ola, "Fjellvegen 1"), /Bare hytteeiere/),
  );
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
    const seen = (await listVisibleCabins(admin)).find((c) => c.cabin.id === medBilder);
    assert.equal(seen?.cabin.coverPhotoId, bilder[0].id);
    assert.equal((await getVisibleCabin(admin, medBilder))?.cabin.coverPhotoId, bilder[0].id);
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
    await refused(() => addCabinPhotos(ola, karisHytte, [bilde]), /Fant ikke hytta/);
    await refused(() => addCabinPhotos(admin, karisHytte, [bilde]), /Fant ikke hytta/);
    await refused(() => removeCabinPhoto(admin, bilder[0].id), /Fant ikke bildet/);
    await refused(() => makeCoverPhoto(ola, bilder[1].id), /Fant ikke bildet/);
    await refused(() => addCabinPhotos(kari, karisHytte, []), /minst ett bilde/);
    assert.equal(await addCabinPhotos(kari, karisHytte, [bilde]), 1);
    assert.equal(await addCabinPhotos(admin, annesHytte, [bilde]), 1);
  });
  await check("bare de som får se hytta, får se bildene", async () => {
    const [karis] = await listCabinPhotos(karisHytte);
    const [annes] = await listCabinPhotos(annesHytte);
    assert.ok(await getPhotoForViewer(ola, karis.id, "thumb"), "invitert venn");
    assert.equal(await getPhotoForViewer(ola, annes.id, "thumb"), null);
    assert.equal(await getPhotoForViewer(ola, annes.id, "full"), null);
    assert.ok(await getPhotoForViewer(lise, annes.id, "full"), "venn invitert til begge");
    assert.ok(await getPhotoForViewer(kari, annes.id, "full"), "annen hytteeier");
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

  console.log("Forespørsler");
  const request = (start: number, end: number, guests = "2") => ({
    startDate: d(start),
    endDate: d(end),
    guests,
    message: "Vi blir fire voksne.",
  });

  await check("kan ikke låne utenfor ledig periode", () =>
    refused(() => createBooking(ola, karisHytte, request(5, 12)), /ikke ledig/),
  );
  await check("kan ikke låne bakover i tid", () =>
    refused(() => createBooking(ola, karisHytte, request(-3, 12)), /bak i tid/),
  );
  await check("kan ikke være flere enn sengeplassene", () =>
    refused(() => createBooking(ola, karisHytte, request(12, 14, "9")), /sengeplasser/),
  );
  await check("kan ikke be om en hytte man ikke ser", () =>
    refused(() => createBooking(ola, annesHytte, request(12, 14)), /Fant ikke hytta/),
  );
  await check("eier kan ikke be om sin egen hytte", () =>
    refused(() => createBooking(kari, karisHytte, request(12, 14)), /egen hytte/),
  );

  const olasId = await createBooking(ola, karisHytte, request(12, 14));
  await check("prisen er selvkost, påslag og vask", async () => {
    const [mine] = await listOutgoing(ola);
    // 2 netter × 400 = 800, 10 % påslag = 80, vask 500
    assert.equal(mine.booking.totalPrice, 1380);
    assert.equal(mine.booking.status, "pending");
    assert.equal(mine.vippsNumber, null);
    assert.equal(mine.arrivalInfo, null);
    assert.deepEqual([mine.address, mine.latitude, mine.longitude], [null, null, null]);
  });
  await check("samme låner kan ikke sende to forespørsler for samme tid", () =>
    refused(() => createBooking(ola, karisHytte, request(13, 15)), /allerede en forespørsel/),
  );

  const lisesId = await createBooking(lise, karisHytte, request(13, 16));
  await check("eieren ser begge forespørslene, med kontaktinfo", async () => {
    const incoming = await listIncoming(kari);
    assert.equal(incoming.length, 2);
    assert.equal(incoming[0].borrowerPhone, "91234567");
    assert.equal((await listIncoming(ola)).length, 0);
  });
  await check("bare eieren kan svare", () =>
    refused(() => decideBooking(lise, olasId, "approve", ""), /Fant ikke forespørselen/),
  );

  await decideBooking(kari, olasId, "approve", "Velkommen!");
  await check("etter ja vises Vipps-nummer, men ikke adressen", async () => {
    const [mine] = await listOutgoing(ola);
    assert.equal(mine.booking.status, "approved");
    assert.equal(mine.vippsNumber, "91234567");
    assert.equal(mine.arrivalInfo, null);
    assert.deepEqual([mine.address, mine.latitude, mine.longitude], [null, null, null]);
    assert.equal(mine.booking.ownerReply, "Velkommen!");
  });
  await check("eieren kan ikke si ja til to lån som overlapper", () =>
    refused(() => decideBooking(kari, lisesId, "approve", ""), /allerede sagt ja/),
  );
  await check("en forespørsel kan bare besvares én gang", () =>
    refused(() => decideBooking(kari, olasId, "decline", ""), /allerede besvart/),
  );
  await check("nettene er opptatt i kalenderen etter ja", async () => {
    const calendar = await getCalendar(karisHytte);
    assert.deepEqual(calendar.taken, [{ startDate: d(12), endDate: d(14) }]);
    await refused(() => createBooking(lise, karisHytte, request(11, 13)), /ikke ledig/);
  });
  await check("avreisedag kan være neste låners ankomstdag", async () => {
    await decideBooking(kari, lisesId, "decline", "Opptatt, dessverre.");
    const id = await createBooking(lise, karisHytte, request(14, 16));
    await decideBooking(kari, id, "approve", "");
  });

  console.log("Betaling og avlysning");
  await check("venn kan ikke markere betalt", () =>
    refused(() => markPaid(ola, olasId), /Fant ikke forespørselen/),
  );
  await markPaid(kari, olasId);
  await check("etter betaling vises adressen til låneren", async () => {
    const mine = (await listOutgoing(ola)).find((b) => b.booking.id === olasId);
    assert.equal(mine?.booking.status, "paid");
    assert.equal(mine?.arrivalInfo, "Nøkkelboks kode 1234");
    assert.equal(mine?.address, "Fjellvegen 12, 2636 Øyer");
    assert.deepEqual([mine?.latitude, mine?.longitude], [61.2345, 10.4567]);
  });
  await check("kan ikke markere betalt to ganger", () =>
    refused(() => markPaid(kari, olasId), /sagt ja til/),
  );
  await check("låneren kan ikke avlyse et betalt lån selv", () =>
    refused(() => cancelBooking(ola, olasId), /Ta kontakt med eieren/),
  );
  await check("uvedkommende kan ikke avlyse", () =>
    refused(() => cancelBooking(admin, olasId), /Fant ikke forespørselen/),
  );
  await check("eieren kan avlyse, og nettene blir ledige igjen", async () => {
    await cancelBooking(kari, olasId);
    const calendar = await getCalendar(karisHytte);
    assert.deepEqual(calendar.taken, [{ startDate: d(14), endDate: d(16) }]);
  });

  console.log("Fjerne tilgang");
  await check("eieren kan fjerne en venns tilgang", async () => {
    const friends = await listFriendInvitations(kari, karisHytte);
    const olasInvitation = friends.find((f) => f.email === "ola@test.local");
    assert.ok(olasInvitation?.acceptedAt);
    await refused(() => removeFriendInvitation(lise, olasInvitation.id), /Fant ikke/);
    await removeFriendInvitation(kari, olasInvitation.id);
    assert.equal((await listVisibleCabins(ola)).length, 0);
    assert.equal(await getVisibleCabin(ola, karisHytte), null);
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
