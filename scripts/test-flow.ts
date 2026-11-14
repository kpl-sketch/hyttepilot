/**
 * Går gjennom hele låneflyten mot en ekte Postgres-database og sjekker
 * reglene: hvem som slipper inn, hvem som ser hva, og at to lån ikke kan
 * overlappe. Kjøres med: npm test
 *
 * Testen TØMMER databasen. Den nekter derfor å kjøre mot noe annet enn en
 * lokal database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { addDays, todayInOslo } from "../src/lib/dates";
import { db } from "../src/lib/db";
import { profile, user } from "../src/lib/db/schema";
import { type Actor, UserError } from "../src/lib/errors";
import { PLEDGE_VERSION } from "../src/lib/pledge";
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
  getVisibleCabin,
  listVisibleCabins,
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
  arrivalInfo: "Nøkkelboks kode 1234",
});

async function main() {
  await db.execute(
    sql`truncate "booking", "availability", "cabin_access", "invitation", "cabin", "profile", "login_throttle", "verification", "session", "account", "user" cascade`,
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
