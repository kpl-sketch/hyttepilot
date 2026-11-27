/**
 * Går gjennom invitasjon, første innlogging, deling og booking i en ekte
 * nettleser på mobilstørrelse. Deler av flyten gjøres bare med tastatur, og
 * kalenderen sjekkes for dato og ledighet slik en skjermleser får det.
 *
 * Slik kjøres den:
 *   1. AI_GATEWAY_API_KEY=test LINKEDIN_CLIENT_ID=test-id LINKEDIN_CLIENT_SECRET=test-hemmelighet \
 *      npx next build
 *      (personvernsiden lages ved bygging og nevner bare tekstforslag og LinkedIn når nøklene er satt)
 *   2. EMAIL_DEV_OUTBOX=1 ADDRESS_SEARCH_URL=http://127.0.0.1:9/sok \
 *      AI_GATEWAY_API_KEY=test AI_DESCRIPTION_URL=http://127.0.0.1:4011/v1/chat/completions \
 *      LINKEDIN_CLIENT_ID=test-id LINKEDIN_CLIENT_SECRET=test-hemmelighet \
 *      LINKEDIN_TEST_ORIGIN=http://127.0.0.1:4012 \
 *      npx next start
 *   3. npm run test:nettleser
 *
 * Testen TØMMER databasen og nekter å kjøre mot annet enn en lokal database.
 * Den trenger Chrome eller Chromium (sett CHROME_PATH hvis den ikke finnes
 * av seg selv). Ingen e-post sendes: innloggingskoder og invitasjoner leses
 * fra .dev-outbox.jsonl. Alle adresser slutter på @test.local. Tekstforslagene
 * kommer fra en etterligning av AI-tjenesten som testen selv starter på port
 * 4011 (TEST_AI_PORT). Ingenting sendes til en ekte AI-tjeneste. Profilbildet
 * hentes fra en etterligning av LinkedIn på port 4012 (TEST_LINKEDIN_PORT).
 * Ingenting sendes til LinkedIn.
 *
 * Skjermbildene havner i mappen SCREENSHOT_DIR (standard: skjermbilder/).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import pg from "pg";
import { chromium } from "playwright-core";
import sharp from "sharp";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "skjermbilder";
const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Testen kjører bare mot en lokal database. Avbryter.");
  process.exit(1);
}

const chrome =
  process.env.CHROME_PATH ??
  [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((path) => existsSync(path));
if (!chrome) {
  console.error("Fant ikke Chrome. Sett CHROME_PATH.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 2 });
let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/* ------------------------------ Tekstforslag ------------------------------- */

const AI_PORT = Number(process.env.TEST_AI_PORT ?? 4011);
const DRAFT =
  "Rød bu helt nede ved sjøen i Kragerø. Seks sengeplasser. Peis og badstue. Sandstrand foran bua, og utsikt mot holmene.";

/**
 * Etterligner AI-tjenesten som skriver tekstforslag. Serveren som testes, må
 * være startet med AI_DESCRIPTION_URL som peker hit, se toppen av filen.
 */
async function fakeTextService() {
  const seen = [];
  const state = { answer: "text" };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      seen.push(Buffer.concat(chunks).toString("utf8"));
      if (state.answer === "down") {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "nede for vedlikehold" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: DRAFT } }] }),
      );
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(AI_PORT, "127.0.0.1", resolve);
  });
  return { seen, state, close: () => new Promise((resolve) => server.close(resolve)) };
}

/* ------------------------------- LinkedIn --------------------------------- */

const LINKEDIN_PORT = Number(process.env.TEST_LINKEDIN_PORT ?? 4012);

/**
 * Etterligner LinkedIn. Serveren som testes, må være startet med
 * LINKEDIN_TEST_ORIGIN som peker hit, se toppen av filen. Siden der brukeren
 * godkjenner, sender nettleseren rett tilbake, som om brukeren trykket
 * «Tillat». Med `state.answer = "cancel"` er det som om brukeren trykket «Avbryt».
 */
async function fakeLinkedIn() {
  const seen = [];
  const state = { answer: "allow" };
  const picture = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
      <rect width="800" height="800" fill="#d9e6ee"/>
      <circle cx="400" cy="310" r="150" fill="#e8b48c"/>
      <path d="M130 800 C150 560 650 560 670 800 Z" fill="#173f57"/>
    </svg>`),
  )
    .jpeg()
    .toBuffer();
  const server = createServer((request, response) => {
    const address = new URL(request.url, `http://127.0.0.1:${LINKEDIN_PORT}`);
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({
        path: address.pathname,
        query: Object.fromEntries(address.searchParams),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const json = (body) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (address.pathname === "/oauth/v2/authorization") {
        const back = new URL(address.searchParams.get("redirect_uri"));
        back.searchParams.set("state", address.searchParams.get("state"));
        if (state.answer === "cancel") back.searchParams.set("error", "user_cancelled_authorize");
        else back.searchParams.set("code", "kode-fra-linkedin");
        response.writeHead(302, { location: back.toString() });
        return response.end();
      }
      if (address.pathname === "/oauth/v2/accessToken") {
        return json({ access_token: "nokkel-fra-linkedin", expires_in: 3600 });
      }
      if (address.pathname === "/v2/userinfo") {
        return json({
          sub: "abc123",
          name: "Per Privat",
          picture: `http://127.0.0.1:${LINKEDIN_PORT}/bilde.jpg`,
        });
      }
      if (address.pathname === "/bilde.jpg") {
        response.writeHead(200, { "content-type": "image/jpeg" });
        return response.end(picture);
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(LINKEDIN_PORT, "127.0.0.1", resolve);
  });
  return { seen, state, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Venter til påstanden er sann, høyst ti sekunder. */
async function eventually(fn, message) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

/* --------------------------------- Datoer ---------------------------------- */

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
function d(days) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
/** «fredag 19. februar 2027», slik kalenderen leser opp datoen. */
function long(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${day}. ${MONTHS[m - 1]} ${y}`;
}
const monthTitle = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/* -------------------------------- Utboksen --------------------------------- */

async function outbox() {
  try {
    const lines = (await readFile(".dev-outbox.jsonl", "utf8")).split("\n");
    return lines.filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
const outboxStart = (await outbox()).length;
const newMails = async () => (await outbox()).slice(outboxStart);

/** Venter på den nyeste e-posten til adressen som passer mønsteret. */
async function mailTo(to, pattern, after = 0) {
  for (let i = 0; i < 100; i++) {
    const found = (await newMails())
      .slice(after)
      .filter((mail) => mail.to === to && pattern.test(`${mail.subject}\n${mail.text}`));
    if (found.length > 0) return found[found.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Fant ingen e-post til ${to} som passer ${pattern}`);
}
async function invitationLink(to) {
  const mail = await mailTo(to, /\/invitasjon\//);
  return mail.text.match(/https?:\/\/\S+\/invitasjon\/[A-Za-z0-9_-]+/)[0];
}

/* -------------------------------- Nettleser -------------------------------- */

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--lang=nb-NO"], // datofeltene vises da som hos norske brukere
});
await mkdir(SHOTS, { recursive: true });

/** Et nytt, uinnlogget vindu på størrelse med en mobil. */
async function phone() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
  });
  context.setDefaultTimeout(15_000);
  return context.newPage();
}

/**
 * Tar skjermbilde og sjekker samtidig at siden ikke er bredere enn
 * mobilskjermen. Med `part` tas bare den delen av siden, slik at bildet
 * viser det steget handler om.
 */
async function shot(page, name, part) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 1, `${name}: siden er ${overflow} punkter bredere enn mobilskjermen`);
  const path = `${SHOTS}/${name}.png`;
  if (part) await part.screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
}

/** Navnet tastaturfokus står på akkurat nå, omtrent slik en skjermleser sier det. */
const focusName = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "";
    const label = el.labels?.[0]?.innerText ?? "";
    return [el.getAttribute("aria-label"), label, el.innerText, el.getAttribute("name")]
      .filter(Boolean)
      .join(" | ");
  });

/** Trykker Tab til fokus står på noe som passer. Bare tastatur. */
async function tabTo(page, pattern) {
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press("Tab");
    if (pattern.test(await focusName(page))) return;
  }
  throw new Error(`Kom ikke til «${pattern}» med Tab`);
}

/**
 * Åpner en adresse brukeren ikke har tilgang til, og sjekker at verken siden
 * eller det serveren sendte, inneholder noe om hytta. Siden strømmes, så
 * statuskoden er 200 selv om innholdet er «Fant ikke siden».
 */
async function nothingAt(page, address, secret) {
  const response = await page.goto(address);
  await page.getByRole("heading", { name: "Fant ikke siden" }).waitFor();
  assert.equal(secret.test(await response.text()), false, "svaret fra serveren røper ingenting");
  assert.equal(secret.test(await page.getByRole("main").innerText()), false);
}

async function enterCode(page, email, mailsBefore, { keyboard = false } = {}) {
  const code = page.getByLabel("Kode fra e-posten");
  await code.waitFor();
  const mail = await mailTo(email, /innloggingskoden din/, mailsBefore);
  const digits = mail.subject.match(/\d{6}/)[0];
  if (keyboard) {
    await page.keyboard.type(digits); // feltet har fokus av seg selv
    await page.keyboard.press("Enter");
  } else {
    await code.fill(digits);
    await page.getByRole("button", { name: "Logg inn" }).click();
  }
}

/** Skriver adressen på innloggingssiden og logger inn med koden fra utboksen. */
async function logIn(page, email) {
  const before = (await newMails()).length;
  await page.getByLabel("E-postadresse").fill(email);
  await page.getByRole("button", { name: "Send meg en kode" }).click();
  await enterCode(page, email, before);
}

async function onboard(page, name, mobile = "91234567") {
  await page.getByRole("heading", { name: "Velkommen" }).waitFor();
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Mobilnummer").fill(mobile);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Gi løftet og bli med" }).click();
}

async function addCabin(page, { name, area, cost, cleaning }) {
  if (name === "Sjøbua") {
    // Uten forslag gjettes området fra adressen, aldri fra gatenavnet.
    await page.goto(`${BASE}/mine-hytter/ny`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Hvor ligger hytta?").pressSequentially("Krokviksvägen 17, 439 54 Åsa, Sverige");
    await page.getByText("Andre ser bare «Åsa».").waitFor();
    await page.getByLabel("Hvor ligger hytta?").fill("Fjellvegen 12");
    await page.getByLabel("Området andre ser").waitFor();
  }
  await page.goto(`${BASE}/mine-hytter/ny`);
  // Det korte skjemaet: navn, sted, sengeplasser, pris og bilder.
  const field = (key) => page.locator(`form [name="${key}"]`);
  await field("name").fill(name);
  // Uten adressesøk i testen blir teksten i «Hvor ligger hytta?» området.
  await page.getByLabel("Hvor ligger hytta?").fill(area);
  await page.getByText(`Andre ser bare «${area}».`).waitFor();
  await field("costPerNight").fill(String(cost));
  if (name === "Fjellro") await shot(page, "04a-legg-inn-hytte");
  await page.getByRole("button", { name: "Legg inn hytta" }).click();
  // Rett etter at hytta er lagt inn, spør tjenesten hvem som skal få låne den.
  await page.getByRole("heading", { name: "Hvem skal få låne hytta?" }).waitFor();
  assert.match(page.url(), /\/mine-hytter\/[0-9a-f-]+\/inviter\?ny=1$/);
  await page.getByLabel("E-postadressene til dem som skal få se hytta").waitFor();
  if (name === "Fjellro") await shot(page, "04b-hvem-skal-faa-laane");
  await page.getByRole("link", { name: "Gå videre til hytta" }).click();
  await page.getByText("Hytta er lagret. Bare du ser den til du velger noen.").waitFor();
  // Next holder forrige side skjult i siden etter en lenke. Last på nytt, så
  // skjemaet fra invitasjonssiden ikke står der to ganger.
  await page.reload();
  await page.getByText("Hytta er lagret. Bare du ser den til du velger noen.").waitFor();
  const id = page.url().match(/mine-hytter\/([0-9a-f-]+)/)[1];

  // Resten fylles ut i det fulle skjemaet på siden for hytta.
  const details = page.locator("form", {
    has: page.getByRole("button", { name: "Lagre endringene" }),
  });
  const detail = (key) => details.locator(`[name="${key}"]`);
  await detail("description").fill("Tømmerhytte med peis og badstue. Fem minutter til skiløypa.");
  await detail("cleaningFee").fill(String(cleaning));
  await detail("rules").fill("Ingen fest. Hund er velkommen.");
  // En adresse skrevet for hånd blir ikke det alle ser: området står fortsatt.
  await details.getByLabel("Hvor ligger hytta?").fill("Fjellvegen 12, 2636 Øyer");
  await details.getByText(`Andre ser bare «${area}».`).waitFor();

  await detail("arrivalInfo").fill("Nøkkelboks ved døra, kode 1234.");
  await details.getByRole("button", { name: "Lagre endringene" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "legg inn adresse og hvor nøkkelen ligger" }).waitFor({ state: "detached" });
  return id;
}

/**
 * Skriver ankomst og avreise i datofeltene. Feltene styres av kalenderen, så
 * testen venter til siden er ferdig lastet før den skriver.
 */
async function typeDates(page, from, to) {
  await page.waitForLoadState("networkidle");
  const arrival = page.getByLabel("Ankomst", { exact: true });
  const departure = page.getByLabel("Avreise", { exact: true });
  await arrival.fill(from);
  await departure.fill(to);
  assert.equal(await arrival.inputValue(), from);
  assert.equal(await departure.inputValue(), to);
}

async function openDates(page, from, to) {
  await page.getByLabel("Ledig fra").fill(from);
  await page.getByLabel("Siste avreisedag").fill(to);
  await page.getByRole("button", { name: "Legg til periode" }).click();
  await page.getByText("Perioden er lagt til.").waitFor();
}

async function main() {
  await pool.query(
    `truncate "booking", "availability", "cabin_photo", "cabin_access", "invitation", "cabin", "profile_photo", "profile", "login_throttle", "verification", "session", "account", "user", "join_request" cascade`,
  );

  console.log("Administrator og første hytteeier");
  const anne = await phone();
  await anne.goto(`${BASE}/`);
  await check("forsiden sier hva tjenesten er, uten å love for mye", async () => {
    await anne
      .getByRole("heading", { name: "Hyttene i vennekretsen din, samlet ett sted" })
      .waitFor();
    // Tjenesten er lukket. Det står først på siden og ved innloggingen.
    assert.match(
      (await anne.getByRole("main").innerText()).trimStart(),
      /^Bare for inviterte/i,
      "at tjenesten er lukket, skal stå først",
    );
    await anne.getByRole("heading", { name: "Slik låner du bort hytta di" }).waitFor();
    assert.equal(await anne.getByRole("main").getByRole("listitem").count(), 3);
    await anne.getByText("Du setter prisen.", { exact: false }).waitFor();
    await anne.getByRole("heading", { name: "Har du ikke hytte?" }).waitFor();
    // Å låne bort tilbake er et valg, ikke et løfte.
    await anne.getByText("Det er et tilbud, ikke en plikt.").waitFor();
    await anne.getByRole("heading", { name: "Bare folk du kjenner" }).waitFor();
    await anne
      .getByRole("heading", { name: "Du må bli invitert av noen som allerede er med" })
      .waitFor();
    await anne.getByText("Du kan ikke registrere deg selv.").waitFor();
    // Den som ikke er invitert, får vite hva som er neste steg.
    await anne.getByText(/^Kjenner du noen som har hytte i .+\? Be dem invitere deg\.$/).waitFor();
    // Den som ikke kjenner noen her, kan spørre: øverst på siden og i rammen nederst.
    await anne.getByText("Kjenner du ingen her ennå? Da kan du spørre oss.").waitFor();
    const ask = anne.getByRole("link", { name: "Be om invitasjon" });
    assert.equal(await ask.count(), 2);
    for (const link of await ask.all()) {
      assert.equal(await link.getAttribute("href"), "/be-om-invitasjon");
    }
    assert.equal(
      /selvkost|forespørsel|Hytteløftet/.test(await anne.getByRole("main").innerText()),
      false,
      "forsiden skal ikke bruke fagord som ikke er forklart",
    );
    await shot(anne, "01-forside");
  });

  console.log("Be om invitasjon");
  const nina = await phone();
  const askedAt = (await newMails()).length;
  await check("den som ikke er invitert, kommer fra forsiden til skjemaet med ett trykk", async () => {
    await nina.goto(`${BASE}/`);
    await nina.getByRole("link", { name: "Be om invitasjon" }).first().click();
    await nina.waitForURL(/\/be-om-invitasjon$/);
    await nina.getByRole("heading", { level: 1, name: "Be om invitasjon" }).waitFor();
    const text = (await nina.getByRole("main").innerText()).trimStart();
    assert.match(text, /^Bare for inviterte/i, "at tjenesten er lukket, skal stå først");
    // Siden lover ikke plass, og sier hva man ser uten hytte.
    assert.match(text, /Vi lover ikke plass til alle\./);
    assert.match(text, /Uten hytte ser du hytter først når en eier viser deg sin\./);
    // «Forespørsel» betyr noe annet inne i tjenesten. Skjemaet bruker ikke ordet.
    assert.equal(/forespørsel/i.test(text), false);
    await shot(nina, "01b-be-om-invitasjon");
  });
  await check("skjemaet kan fylles ut og sendes bare med tastatur", async () => {
    await tabTo(nina, /^Navn/);
    await nina.keyboard.type("Nina Ny");
    await nina.keyboard.press("Tab");
    assert.match(await focusName(nina), /^E-postadresse/);
    await nina.keyboard.type("Nina@Test.Local");
    await nina.keyboard.press("Tab");
    // Ja og nei er ett valg. Mellomrom velger det som har fokus.
    assert.equal(await nina.getByRole("group", { name: "Har du hytte?" }).getByRole("radio").count(), 2);
    assert.match(await focusName(nina), /Ja/);
    await nina.keyboard.press("Space");
    assert.equal(await nina.getByRole("radio", { name: "Ja" }).isChecked(), true);
    await nina.keyboard.press("Tab");
    assert.match(await focusName(nina), /^Hvem kjenner du her\?/);
    await nina.keyboard.type("Kjenner Kari Eier fra jobb.");
    await nina.keyboard.press("Tab");
    assert.match(await focusName(nina), /Be om invitasjon/);
    await nina.keyboard.press("Enter");
    await nina.getByRole("heading", { name: "Takk. Nå vet vi at du vil være med." }).waitFor();
    // Fokus flyttes til kvitteringen, så den blir lest opp og Tab går videre derfra.
    await eventually(
      async () => /^Takk\. Nå vet vi at du vil være med\./.test(await focusName(nina)),
      "fokus skal stå på overskriften i kvitteringen",
    );
    const receipt = await nina.locator("#kvittering").innerText();
    assert.match(receipt, /kommer den på e-post til Nina@Test\.Local\./);
    // Uten e-post ved nei må kvitteringen si når stillhet betyr nei.
    assert.match(receipt, /Har du ikke hørt fra oss innen 14 dager, har vi ikke plass nå\./);
    assert.equal(await nina.getByRole("button", { name: "Be om invitasjon" }).count(), 0);
    await shot(nina, "01c-takk");
  });
  await check("administratoren får varsel, og den som spurte, får ingen e-post", async () => {
    const notice = await mailTo("admin@test.local", /ber om invitasjon/, askedAt);
    assert.equal(notice.subject, "Nina Ny ber om invitasjon");
    assert.match(notice.text, /Har hytte: ja/);
    assert.match(notice.text, /«Kjenner Kari Eier fra jobb\.»/);
    const mails = (await newMails()).slice(askedAt);
    assert.deepEqual(mails.filter((mail) => mail.to === "nina@test.local"), []);
  });
  await check("uten svar på om man har hytte sendes ingenting, og en feil tar ikke fokus fra knappen", async () => {
    const lars = await phone();
    await lars.goto(`${BASE}/be-om-invitasjon`);
    await lars.getByLabel("Navn").fill("Lars Nei");
    await lars.getByLabel("E-postadresse").fill("lars@test.local");
    await lars.getByRole("button", { name: "Be om invitasjon" }).click();
    // Nettleseren stopper skjemaet og peker på det som mangler.
    assert.equal(
      await lars.getByRole("radio", { name: "Ja" }).evaluate((el) => el.validity.valueMissing),
      true,
    );
    assert.equal(await lars.locator("#kvittering").count(), 0);
    // En feil fra serveren står ved knappen, leses opp, og fokus blir der.
    await lars.getByLabel("Navn").fill("Se https://eksempel.test");
    await lars.getByRole("radio", { name: "Nei" }).check();
    await lars.getByRole("button", { name: "Be om invitasjon" }).focus();
    await lars.keyboard.press("Enter");
    const alert = lars.getByRole("main").getByRole("alert");
    await alert.waitFor();
    assert.equal(await alert.innerText(), "Skriv bare navnet ditt.");
    assert.match(await focusName(lars), /Be om invitasjon/);
    assert.equal(await lars.getByLabel("E-postadresse").inputValue(), "lars@test.local");
    await lars.getByLabel("Navn").fill("Lars Nei");
    await lars.getByRole("button", { name: "Be om invitasjon" }).click();
    await lars.getByRole("heading", { name: "Takk. Nå vet vi at du vil være med." }).waitFor();
    await lars.context().close();
  });
  await check("personvernsiden sier hvorfor vi bruker opplysningene, hvor de behandles, og hvor man klager", async () => {
    const reader = await phone();
    await reader.goto(`${BASE}/personvern`);
    for (const name of ["Hvorfor vi kan bruke opplysningene", "Leverandører", "Klage"]) {
      await reader.getByRole("heading", { name }).waitFor();
    }
    const text = await reader.getByRole("main").innerText();
    assert.match(text, /Ber du om invitasjon, bruker vi det du skriver, bare til å svare deg\./);
    assert.match(text, /Har du ikke hørt fra oss innen 14 dager, har vi ikke plass nå/);
    assert.match(text, /Opplysninger kan derfor bli behandlet utenfor\s+EØS\./);
    assert.equal(
      await reader.getByRole("link", { name: "datatilsynet.no" }).getAttribute("href"),
      "https://www.datatilsynet.no",
    );
    await shot(reader, "01d-personvern");
    await reader.context().close();
  });
  await check("samme adresse en gang til gir samme kvittering og ikke noe nytt varsel", async () => {
    await mailTo("admin@test.local", /Lars Nei ber om invitasjon/, askedAt);
    const before = (await newMails()).length;
    await nina.goto(`${BASE}/be-om-invitasjon`);
    await nina.getByLabel("Navn").fill("Nina Ny");
    await nina.getByLabel("E-postadresse").fill("nina@test.local");
    await nina.getByRole("radio", { name: "Ja" }).check();
    await nina.getByRole("button", { name: "Be om invitasjon" }).click();
    await nina.getByRole("heading", { name: "Takk. Nå vet vi at du vil være med." }).waitFor();
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal((await newMails()).length, before);
    const rows = await pool.query(`select count(*)::int as n from "join_request"`);
    assert.equal(rows.rows[0].n, 2);
  });

  await check("målgruppesidene /v1 til /v10 åpnes uten innlogging og følger forsidens regler", async () => {
    for (let i = 1; i <= 10; i++) {
      const response = await anne.goto(`${BASE}/v${i}`);
      assert.equal(response.status(), 200, `/v${i} skal åpnes uten innlogging`);
      const text = (await anne.getByRole("main").innerText()).trimStart();
      assert.match(text, /^Bare for inviterte/i, `/v${i}: at tjenesten er lukket, skal stå først`);
      assert.match(text, /ser du når hyttene til folk du kjenner er ledige, og du kan spørre uten at det blir rart/);
      assert.equal(/\bdel(e|er|t)\b|selvkost|forespørsel|Hytteløftet/i.test(text), false, `/v${i} bruker et ord forsiden ikke bruker`);
      await anne.getByRole("link", { name: "Logg inn" }).waitFor();
      await shot(anne, `01-v${i}`);
    }
  });
  await check("man kan bla mellom versjonene med piler, tall og tastatur", async () => {
    await anne.goto(`${BASE}/v10`);
    const nav = anne.getByRole("navigation", { name: "Bla mellom versjonene" });
    // Pilene står øverst, før selve siden, og følger med når man blar nedover.
    const top = await nav.boundingBox();
    const main = await anne.getByRole("main").boundingBox();
    assert.ok(top.y + top.height <= main.y, "navigasjonen skal stå over innholdet");
    assert.ok(top.y < 120, `navigasjonen skal stå øverst på siden, sto på ${top.y}`);
    await anne.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await anne.waitForFunction(() => window.scrollY > 300);
    const stuck = await nav.boundingBox();
    assert.ok(Math.abs(stuck.y) < 1, `navigasjonen skal følge med øverst, sto på ${stuck.y}`);
    await shot(anne, "01-v10-bladd-ned");
    await anne.evaluate(() => window.scrollTo(0, 0));
    await nav.getByRole("link", { name: /Neste versjon/ }).click();
    await anne.waitForURL(/\/v1$/);
    // Utviklingsmerket til Next ligger over venstre pil i dev, så den trykkes med tastaturet.
    await nav.getByRole("link", { name: /Forrige versjon/ }).press("Enter");
    await anne.waitForURL(/\/v10$/);
    // Piltastene virker først når linjen for den nye siden er på plass. Testen
    // venter på det, slik et menneske ville gjort, før den trykker.
    const ready = async (n) => {
      await nav.getByRole("link", { name: new RegExp(`Versjon ${n} av 10`) }).waitFor();
      await anne.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))),
      );
    };
    await ready(10);
    await anne.keyboard.press("ArrowRight");
    await anne.waitForURL(/\/v1$/);
    await ready(1);
    await anne.keyboard.press("ArrowLeft");
    await anne.waitForURL(/\/v10$/);
    await nav.getByRole("link", { name: /Versjon 10 av 10/ }).click();
    await anne.waitForURL(/\/v$/);
    assert.equal(await anne.getByRole("main").getByRole("listitem").count(), 10);
    await shot(anne, "01-v-oversikt");
  });
  await anne.goto(`${BASE}/logg-inn`);
  await logIn(anne, "admin@test.local");
  await onboard(anne, "Anne Admin");
  await check("tom hyttekrets forklarer hva som mangler og hva man kan gjøre", async () => {
    await anne.getByRole("heading", { name: "Din hyttekrets" }).waitFor();
    await anne.getByText("Ingen har vist deg en hytte ennå.").waitFor();
    await anne.getByRole("heading", { name: "Har du en hytte du vil låne bort til noen du kjenner?" }).waitFor();
    await shot(anne, "02-tom-hyttekrets");
  });
  await anne.goto(`${BASE}/admin`);
  await anne.getByLabel("E-postadresse").fill("kari@test.local");
  await anne.getByLabel("Personlig hilsen").fill("Fint om du vil være med fra start.");
  await anne.getByRole("button", { name: "Send invitasjonen" }).click();
  await anne.getByText("Invitasjonen er sendt.").waitFor();
  await check("administrasjon sier rett ut hva administratorer ser av andres hytter", async () => {
    await anne.getByText("Som administrator ser du alle hytter under Hytter").waitFor();
    await shot(anne, "03-administrasjon");
  });
  await check("administratoren ser hvem som har bedt om invitasjon, og hva de skrev", async () => {
    const section = anne.locator("#ber-om-invitasjon");
    await section.getByRole("heading", { name: "Ber om invitasjon" }).waitFor();
    const people = section.getByRole("listitem");
    assert.equal(await people.count(), 2);
    const first = await people.nth(0).innerText();
    assert.match(first, /Nina Ny/);
    assert.match(first, /Har hytte/);
    assert.match(first, /nina@test\.local/);
    assert.match(first, /«Kjenner Kari Eier fra jobb\.»/);
    // Fristen fra kvitteringen står ved hver person.
    assert.match(first, /Svar innen \d{1,2}\. \p{L}+ \d{4}\./u);
    const second = await people.nth(1).innerText();
    assert.match(second, /Lars Nei/);
    assert.match(second, /Har ikke hytte/);
    await anne
      .locator("#ber-om-invitasjon")
      .getByText(/ikke har hørt fra oss innen 14 dager,\s+ikke får plass nå/)
      .waitFor();
    await shot(anne, "03b-ber-om-invitasjon", section);
  });
  await check("ett trykk inviterer, og e-posten sier at personen selv ba om det", async () => {
    const before = (await newMails()).length;
    await anne.getByRole("button", { name: "Inviter Nina Ny" }).click();
    await anne
      .locator("#ber-om-invitasjon")
      .getByText("Invitasjonen er sendt. Den gjelder i 30 dager.")
      .waitFor();
    const mail = await mailTo("nina@test.local", /\/invitasjon\//, before);
    assert.match(mail.subject, /^Anne Admin inviterer deg til /);
    assert.match(mail.text, /^Du ba om en invitasjon til .+\. Her er den, fra Anne Admin\./);
    assert.equal(await anne.locator("#ber-om-invitasjon").getByRole("listitem").count(), 1);
    await nina.goto(mail.text.match(/https?:\/\/\S+\/invitasjon\/[A-Za-z0-9_-]+/)[0]);
    await nina.getByRole("heading", { name: /Anne Admin inviterer deg til/ }).waitFor();
    await nina.context().close();
  });
  await check("nei krever bekreftelse, gir ingen e-post, og listen er tom etterpå", async () => {
    const before = (await newMails()).length;
    let question = "";
    anne.once("dialog", async (dialog) => {
      question = dialog.message();
      await dialog.accept();
    });
    await anne.getByRole("button", { name: "Si nei Lars Nei" }).click();
    await anne.getByText("Du har sagt nei. Personen får ingen e-post.").waitFor();
    assert.equal(question, "Si nei til Lars Nei? Personen får ingen e-post.");
    await anne.locator("#ber-om-invitasjon").getByText("Ingen venter på svar.").waitFor();
    assert.equal((await newMails()).length, before);
    // De som har fått svar, står igjen med hvem som svarte.
    await anne.getByText("De siste som har fått svar").click();
    await anne.getByText(/lars@test\.local\. Nei .+ av Anne Admin\./).waitFor();
    await anne.getByText(/nina@test\.local\. Invitert .+ av Anne Admin\. Har ikke logget inn ennå\./).waitFor();
    await shot(anne, "03c-har-fatt-svar", anne.locator("#ber-om-invitasjon"));
  });

  const kari = await phone();
  await kari.goto(await invitationLink("kari@test.local"));
  await kari.getByRole("heading", { name: /Anne Admin inviterer deg til/ }).waitFor();
  await kari.getByRole("link", { name: "Logg inn" }).click();
  {
    // Adressen invitasjonen ble sendt til, er fylt ut på forhånd.
    const before = (await newMails()).length;
    await kari.getByRole("button", { name: "Send kode til k•••@test.local" }).click();
    await enterCode(kari, "kari@test.local", before);
  }
  await onboard(kari, "Kari Eier");
  await check("invitasjon uten hytte gir adgang, og sier at ingen hytter er delt ennå", async () => {
    await kari.getByRole("heading", { name: "Velkommen. Anne Admin har invitert deg." }).waitFor();
    await kari.getByText("Invitasjonen gir deg adgang, men ingen hytter ennå.").waitFor();
  });

  console.log("Dele egen hytte");
  const fjellro = await addCabin(kari, { name: "Fjellro", area: "Hafjell", cost: 252, cleaning: 500 });
  await check("ny hytte er privat, og siden sier hva som gjenstår", async () => {
    await kari.getByRole("heading", { name: "Tre steg, så kan hytta lånes" }).waitFor();
    await kari.getByText("Bare du ser hytta.").waitFor();
    await kari.getByText("Ingen datoer er åpne ennå.").waitFor();
    await shot(kari, "04-ny-hytte-er-privat", kari.locator("section", { hasText: "Tre steg" }).first());
  });
  await openDates(kari, d(10), d(40));
  await openDates(kari, d(380), d(430));

  await kari.getByLabel("E-postadressene til dem som skal få se hytta").fill("per@test.local");
  await kari.getByLabel("Personlig hilsen").fill("Velkommen på hytta, Per!");
  await kari.getByRole("button", { name: "Se over før du sender" }).click();
  await check("eieren ser mottaker, hytte, tilgang og e-posten før noe sendes", async () => {
    const heading = kari.getByRole("heading", { name: "Se over før du sender" });
    await heading.waitFor();
    await kari.getByText("per@test.local (ny)").waitFor();
    await kari.getByText("Fjellro, Hafjell").first().waitFor();
    await kari.getByText("vise hytta di til andre").waitFor();
    await kari.getByText("«Velkommen på hytta, Per!»").waitFor();
    assert.equal(
      (await newMails()).filter((mail) => mail.to === "per@test.local").length,
      0,
      "ingenting er sendt før eieren bekrefter",
    );
    assert.match(await focusName(kari), /Se over før du sender/, "fokus flyttes til forhåndsvisningen");
    await shot(kari, "05-se-over-for-du-sender", kari.locator("form", { has: heading }));
  });
  await kari.getByRole("button", { name: "Send invitasjonen" }).click();
  await kari.getByText("Invitasjonen er sendt til per@test.local.").waitFor();
  await check("invitasjonen vises som ventende hos eieren", async () => {
    await kari.getByRole("heading", { name: "Invitert, har ikke logget inn ennå" }).waitFor();
    await kari.getByText("Én invitasjon venter.").waitFor();
  });

  console.log("Invitasjon med ett klikk, og første innlogging bare med tastatur");
  // Fjellro får et bilde og en kartposisjon, slik at invitasjonssiden har noe å vise.
  const picture = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#2f5d50" },
  })
    .webp()
    .toBuffer();
  await pool.query(
    `insert into "cabin_photo" ("cabin_id", "position", "width", "height", "full", "thumb")
     values ($1, 0, 1200, 800, $2, $2)`,
    [fjellro, picture],
  );
  await pool.query(
    `update "cabin" set "latitude" = 61.2345, "longitude" = 10.4567 where "id" = $1`,
    [fjellro],
  );
  const perLink = await invitationLink("per@test.local");
  const per = await phone();
  await per.goto(perLink);
  await check("ett klikk viser hytta: bilder, området på kart og ideen, uten innlogging", async () => {
    await per.getByRole("heading", { name: "Kari låner deg hytta si" }).waitFor();
    await per.getByText("Har du hytte, kan du velge å låne bort din også.").waitFor();
    await per.getByRole("heading", { name: "Hytta ligger i Hafjell" }).waitFor();
    await per.getByRole("img", { name: /Kart over området rundt Hafjell/ }).waitFor();
    const photo = per.getByRole("img", { name: /Hytta i Hafjell, bilde 1 av 1/ });
    await photo.waitFor();
    assert.ok(
      await photo.evaluate((img) => img.complete && img.naturalWidth > 0),
      "bildet skal lastes uten innlogging",
    );
    const text = await per.getByRole("main").innerText();
    assert.match(text, /ser du når hyttene til folk du kjenner er ledige, og du kan spørre uten at det blir rart/);
    for (const secret of [/Fjellro/, /Fjellvegen/, /Nøkkelboks/, /per@test\.local/, /61\.2345/, /252/]) {
      assert.equal(secret.test(text), false, `${secret} skal ikke vises før innlogging`);
    }
    const html = await (await per.request.get(perLink)).text();
    assert.equal(/Fjellro|Fjellvegen|61\.2345|10\.4567|Nøkkelboks/.test(html), false, "svaret fra serveren røper ingenting");
    await shot(per, "06-invitasjon-for-innlogging");
  });
  await check("lenken kan åpnes flere ganger", async () => {
    await per.goto(perLink);
    await per.getByRole("heading", { name: "Kari låner deg hytta si" }).waitFor();
  });
  await check("invitasjon, innlogging og løfte kan gjøres med tastatur", async () => {
    await tabTo(per, /Bli med og se ledige datoer/);
    await per.keyboard.press("Enter");
    // Adressen er fylt ut på forhånd: bare koden gjenstår.
    await per.getByText(/inviterte p•••@test\.local/).waitFor();
    assert.equal(
      (await per.getByRole("main").innerText()).includes("per@test.local"),
      false,
      "hele adressen skal ikke vises",
    );
    await shot(per, "06a-innlogging-fylt-ut");
    const before = (await newMails()).length;
    await tabTo(per, /Send kode til p•••@test\.local/);
    await per.keyboard.press("Enter");
    await enterCode(per, "per@test.local", before, { keyboard: true });

    await per.getByRole("heading", { name: "Velkommen" }).waitFor();
    await per.getByText("har invitert deg").waitFor();
    await tabTo(per, /Navn/);
    await per.keyboard.press("ControlOrMeta+a");
    await per.keyboard.type("Per Eier");
    await tabTo(per, /Mobilnummer/);
    await per.keyboard.type("91234567");
    await tabTo(per, /Jeg lover å holde Hytteløftet/);
    await per.keyboard.press("Space");
    await shot(per, "06b-velkommen");
    await tabTo(per, /Gi løftet og bli med/);
    await per.keyboard.press("Enter");
  });
  await check("låneren lander rett på hytta, med hvem som inviterte og hilsenen", async () => {
    await per.waitForURL(new RegExp(`/hytter/${fjellro}\\?invitasjon=`));
    await per.getByRole("heading", { name: "Kari Eier viser deg Fjellro" }).waitFor();
    await per.getByText("Velkommen på hytta, Per!").waitFor();
    await per.getByRole("heading", { name: "Når vil du låne hytta?" }).waitFor();
    await shot(per, "07-forste-side-etter-innlogging");
  });
  await check("hyttekretsen viser hvem som inviterte, og akkurat den hytta", async () => {
    await per.goto(`${BASE}/krets`);
    await per.getByText("Du ble invitert av Kari Eier.").waitFor();
    assert.equal(await per.getByRole("link", { name: /Fjellro/ }).count(), 1);
    await per.getByText("Ledig for forespørsel:").waitFor();
  });

  await check("gjentatt åpning av invitasjonen gir verken ny e-post eller dobbel tilgang", async () => {
    const before = (await newMails()).length;
    for (let i = 0; i < 3; i++) {
      await per.goto(perLink);
      await per.getByRole("heading", { name: "Kari Eier viser deg Fjellro" }).waitFor();
    }
    assert.equal((await newMails()).length, before);
    const access = await pool.query(
      `select count(*)::int as n from "cabin_access" where "cabin_id" = $1`,
      [fjellro],
    );
    assert.equal(access.rows[0].n, 1);
  });

  console.log("Kalender og forespørsel, bare med tastatur");
  await per.goto(perLink);
  await per.getByRole("heading", { name: "Kari Eier viser deg Fjellro" }).waitFor();
  await tabTo(per, /Se ledige datoer/);
  await per.keyboard.press("Enter");
  await per.getByRole("heading", { name: "Når vil du låne hytta?" }).waitFor();
  await check("kalenderen sier dato og ledighet for hver dag", async () => {
    await per.getByRole("button", { name: `${long(d(12))}, ledig` }).waitFor();
    await per.getByRole("button", { name: `${long(d(9))}, ikke ledig` }).waitFor();
    const unlabeled = await per
      .locator("table button")
      .evaluateAll(
        (buttons) =>
          buttons.filter(
            (b) => !/, (ledig|ikke ledig|kan velges som avreisedag)/.test(b.getAttribute("aria-label") ?? ""),
          ).length,
      );
    assert.equal(unlabeled, 0, "alle datoer skal ha status som tekst");
    assert.equal(await per.locator("table caption").count(), 2);
    assert.equal(await per.locator('table th[scope="col"][abbr="mandag"]').count(), 2);
  });
  await check("ledige perioder står også som tekst over kalenderen", async () => {
    const periods = per.locator("h3", { hasText: "Ledige perioder" }).locator("xpath=following-sibling::ul[1]/li");
    assert.equal(await periods.count(), 2);
  });
  await check("ankomst og avreise kan velges i kalenderen med tastatur", async () => {
    await tabTo(per, new RegExp(`${long(d(12))}, ledig`));
    await per.keyboard.press("Enter");
    await per.getByText("Velg avreisedag.").waitFor();
    await tabTo(per, new RegExp(`${long(d(16))}, `));
    await per.keyboard.press("Enter");
    await per.getByText("4 netter").waitFor();
    // Fire netter à 252 kroner pluss 500 kroner for vask.
    await per.getByText("1 508 kr").waitFor();
    assert.equal(await per.getByLabel("Ankomst", { exact: true }).inputValue(), d(12));
    assert.equal(await per.getByLabel("Avreise", { exact: true }).inputValue(), d(16));
    await per.getByRole("button", { name: `${long(d(12))}, ledig, valgt som ankomstdag` }).waitFor();
    await per.getByRole("button", { name: new RegExp(`${long(d(16))}.*valgt som avreisedag`) }).waitFor();
    await shot(per, "08-kalender-med-valg", per.locator("section", { hasText: "Når vil du låne hytta?" }));
  });
  await check("forespørselen kan sendes med tastatur", async () => {
    await tabTo(per, /Hvor mange blir dere/);
    await per.keyboard.press("ControlOrMeta+a");
    await per.keyboard.type("4");
    await tabTo(per, /Melding til Kari/);
    await per.keyboard.type("Vi er fire voksne som vil gå på ski.");
    await tabTo(per, /Send forespørsel/);
    await per.keyboard.press("Enter");
    await per.getByText("Forespørselen er sendt.").waitFor();
    await per.getByText("Venter på svar").waitFor();
  });
  await check("låneren ser området i kart, men ikke hytta sin nøyaktige posisjon", async () => {
    await pool.query(`update "cabin" set latitude = 61.2345, longitude = 10.4567 where id = $1`, [fjellro]);
    try {
      await per.goto(`${BASE}/hytter/${fjellro}`);
      const where = per.locator("section", { hasText: "Hvor ligger hytta?" });
      await where.getByText("Hafjell", { exact: true }).waitFor();
      await where.getByRole("link", { name: "Se området i Google Maps" }).waitFor();
      await where.locator(".leaflet-container").waitFor();
      await where.getByText("Kartet viser området, ikke selve hytta.").waitFor();
      const html = await per.content();
      assert.equal(/61\.2345|10\.4567|61,2345|10,4567/.test(html), false, "nøyaktig posisjon lekker til låneren");
      await shot(per, "08b-omradet-i-kart", where);
    } finally {
      await pool.query(`update "cabin" set latitude = null, longitude = null where id = $1`, [fjellro]);
    }
  });
  await check("kalenderen kan blas helt til siste registrerte dato, forbi tolv måneder", async () => {
    await per.goto(`${BASE}/hytter/${fjellro}`);
    await per.getByText(`Kalenderen går til`).waitFor();
    const later = per.getByRole("button", { name: "Senere" });
    let clicks = 0;
    while (await later.isEnabled()) {
      await later.click();
      clicks += 1;
      assert.ok(clicks < 40, "kalenderen tar aldri slutt");
    }
    assert.ok(clicks >= 6, `forventet å bla forbi tolv måneder, bladde ${clicks} ganger`);
    await per.locator("table caption", { hasText: monthTitle(d(430)) }).waitFor();
    await per.getByRole("button", { name: `${long(d(429))}, ledig` }).waitFor();
    await shot(per, "09-kalender-siste-maned", per.locator("section", { hasText: "Når vil du låne hytta?" }));
  });
  await check("datoene kan også skrives inn, og opptatt periode gir tydelig beskjed", async () => {
    await typeDates(per, d(385), d(388));
    await per.getByText("3 netter").waitFor();
    await typeDates(per, d(41), d(45));
    await per.getByText("Hytta er ikke ledig hele perioden").waitFor();
  });

  console.log("Dele tilbake og invitere videre");
  const sjobua = await addCabin(per, { name: "Sjøbua", area: "Kragerø", cost: 300, cleaning: 0 });
  await openDates(per, d(20), d(60));
  await per.goto(`${BASE}/krets`);
  await check("B får forslaget om å dele tilbake, men ingenting er delt ennå", async () => {
    await per.getByText("Du viser ikke Kari noen hytte.").waitFor();
    await kari.goto(`${BASE}/krets`);
    await kari.getByText("Ingen har vist deg en hytte ennå.").waitFor();
  });
  await per.getByText("Vil du vise Kari hytta di?").click();
  await per.getByRole("button", { name: "Se over før du bekrefter" }).click();
  await per.getByRole("heading", { name: "Se over før du bekrefter" }).waitFor();
  await check("deling tilbake krever at B ser over og bekrefter", async () => {
    await per.getByText("Kari Eier (ny)").waitFor();
    await kari.reload();
    await kari.getByText("Ingen har vist deg en hytte ennå.").waitFor();
    await shot(per, "10-dele-tilbake", per.locator("li", { hasText: "Vil du vise Kari hytta di?" }));
  });
  await per.getByRole("button", { name: "Vis Kari Eier hytta" }).click();
  await per.getByText("Kari Eier ser nå hytta og har fått beskjed på e-post.").waitFor();
  await check("etter Bs valg ser A hytta til B", async () => {
    await kari.reload();
    await kari.getByRole("link", { name: /Sjøbua/ }).waitFor();
    await kari.getByText("Hytta til Per Eier.").waitFor();
    await kari.getByText("Du viser Per Fjellro.").waitFor();
    await shot(kari, "11-din-hyttekrets");
  });

  await check("B inviterer C til sin hytte, bare med tastatur", async () => {
    await per.reload();
    await per.getByRole("heading", { name: "Hvem ville du selv lånt bort hytta til?" }).waitFor();
    await tabTo(per, /E-postadressene til dem som skal få se hytta/);
    await per.keyboard.type("ola@test.local");
    await tabTo(per, /Personlig hilsen/);
    await per.keyboard.type("Bli med til Kragerø!");
    await tabTo(per, /^Se over før du sender/);
    await per.keyboard.press("Enter");
    await per.getByRole("heading", { name: "Se over før du sender" }).waitFor();
    await per.getByText("Disse ser hytta etterpå").waitFor();
    await tabTo(per, /^Send invitasjonen/);
    await per.keyboard.press("Enter");
    await per.getByText("Invitasjonen er sendt til ola@test.local.").waitFor();
  });

  const ola = await phone();
  await ola.goto(await invitationLink("ola@test.local"));
  await ola.getByRole("link", { name: "Bli med og se ledige datoer" }).click();
  {
    const before = (await newMails()).length;
    await ola.getByRole("button", { name: "Send kode til o•••@test.local" }).click();
    await enterCode(ola, "ola@test.local", before);
  }
  await onboard(ola, "Ola Venn");
  await ola.getByRole("heading", { name: "Per Eier viser deg Sjøbua" }).waitFor();
  await check("C ser bare hytta til B, ikke hytta til A", async () => {
    const text = await ola.getByRole("main").innerText();
    assert.equal(text.includes("Fjellro"), false);
    assert.equal(text.includes("Kari"), false);
    await nothingAt(ola, `${BASE}/hytter/${fjellro}`, /Fjellro|Hafjell|Tømmerhytte|Kari/);
  });
  await check("en annen innlogget person får ingenting ut av en videresendt invitasjon", async () => {
    await ola.goto(perLink);
    await ola.getByRole("heading", { name: "Vil du se hytta til Kari?" }).waitFor();
    await ola.getByRole("button", { name: "Be Kari om å se hytta" }).waitFor();
    const text = await ola.getByRole("main").innerText();
    assert.equal(/Fjellro|Hafjell/.test(text), false);
    await shot(ola, "12-feil-konto");
    await ola.goto(`${BASE}/krets`);
    assert.equal((await ola.getByRole("main").innerText()).includes("Fjellro"), false);
  });
  await check("C har ingen hytte og kan likevel sende en forespørsel", async () => {
    await ola.goto(`${BASE}/hytter/${sjobua}`);
    await typeDates(ola, d(22), d(24));
    await ola.getByText("600 kr").first().waitFor();
    await ola.getByRole("button", { name: "Send forespørsel" }).click();
    await ola.getByText("Forespørselen er sendt.").waitFor();
  });

  console.log("Godkjenne, betalt og slutte å dele");
  await kari.goto(`${BASE}/foresporsler`);
  await kari.getByRole("heading", { name: "Per Eier vil låne Fjellro" }).waitFor();
  await kari.getByRole("button", { name: "Si ja" }).click();
  await kari.getByRole("button", { name: "Marker som betalt" }).click();
  await kari.getByText("Betalt og reservert").waitFor();
  await check("adressen vises til låneren først når oppholdet er betalt", async () => {
    await per.goto(`${BASE}/foresporsler`);
    await per.getByText("Fjellvegen 12, 2636 Øyer").waitFor();
    await per.getByText("Nøkkelboks ved døra, kode 1234.").waitFor();
    await ola.goto(`${BASE}/foresporsler`);
    assert.equal((await ola.getByRole("main").innerText()).includes("Fjellvegen"), false);
  });
  await check("eierens kalender sier ledig, reservert og ikke åpnet som tekst", async () => {
    await kari.goto(`${BASE}/hytter/${fjellro}`);
    const cell = (iso) => kari.locator("td", { hasText: long(iso) });
    assert.match(await cell(d(12)).innerText(), /reservert/);
    assert.match(await cell(d(16)).innerText(), /ledig/);
    assert.match(await cell(d(9)).innerText(), /ikke åpnet/);
    await shot(kari, "13-eierens-kalender", kari.locator("section", { hasText: "Slik ser kalenderen ut" }));
  });
  await check("eieren ser hytta slik de inviterte ser den, før og etter innlogging", async () => {
    await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
    await kari.getByRole("link", { name: "Se hytta slik de du inviterer, ser den" }).click();
    await kari.waitForURL(new RegExp(`/mine-hytter/${fjellro}/forhandsvisning$`));
    await kari.getByRole("heading", { name: "Kari låner deg hytta si" }).waitFor();
    const before = await kari.getByRole("main").innerText();
    for (const secret of ["Fjellro", "Fjellvegen", "Nøkkelboks"]) {
      assert.equal(before.includes(secret), false, `${secret} vises ikke før innlogging`);
    }
    assert.equal(await kari.getByRole("link", { name: "Bli med og se ledige datoer" }).count(), 0);
    await shot(kari, "13b-forhandsvisning-invitasjon");

    await kari.getByRole("link", { name: "2. Når de har logget inn" }).click();
    await kari.waitForURL(new RegExp(`/hytter/${fjellro}\\?som=laaner$`));
    await kari.getByRole("heading", { name: "Fjellro", exact: true }).waitFor();
    await kari.getByRole("heading", { name: "Når vil du låne hytta?" }).waitFor();
    const after = await kari.getByRole("main").innerText();
    assert.match(after, /Hytta til Kari Eier\./);
    assert.equal(after.includes("Fjellvegen"), false, "adressen vises ikke før lånet er betalt");
    assert.equal(after.includes("Dette er din hytte"), false);
    assert.equal(await kari.getByRole("button", { name: "Send forespørsel" }).count(), 0);
    await shot(kari, "13c-forhandsvisning-innlogget");
  });

  await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
  let question = "";
  kari.once("dialog", async (dialog) => {
    question = dialog.message();
    await dialog.accept();
  });
  const stop = kari.getByRole("button", { name: "Ta bort Per Eier" });
  await stop.waitFor();
  await shot(kari, "14-styre-deling", kari.locator("section", { hasText: "Vis hytta til noen du kjenner" }).last());
  await stop.click();
  await kari.getByText("Personen ser ikke lenger hytta").waitFor();
  await kari.getByText("Forespørsler og opphold er ikke endret.").waitFor();
  await check("eieren får vite hva som blir stående før delingen fjernes", () => {
    assert.match(question, /Skal Per Eier slutte å se Fjellro\?/);
    assert.match(question, /kan ikke sende nye forespørsler/);
    assert.match(question, /ett opphold du har sagt ja til\. Det står som før/);
  });
  await check("etter tilbaketrekking ser ikke B hytta, men oppholdet står", async () => {
    await nothingAt(per, `${BASE}/hytter/${fjellro}`, /Fjellro|Hafjell|Tømmerhytte/);
    await per.goto(`${BASE}/krets`);
    await per.getByText("Ingen har vist deg en hytte ennå.").waitFor();
    await per.goto(`${BASE}/foresporsler`);
    await per.getByText("Betalt og reservert").waitFor();
    await per.getByText("Fjellvegen 12, 2636 Øyer").waitFor();
    await kari.goto(`${BASE}/foresporsler`);
    await kari.getByText("Betalt og reservert").waitFor();
  });

  console.log("Utløpt, tilbaketrukket og ukjent invitasjon");
  await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
  for (const email of ["angrer@test.local", "sen@test.local"]) {
    await kari.getByLabel("E-postadressene til dem som skal få se hytta").fill(email);
    await kari.getByRole("button", { name: "Se over før du sender" }).click();
    await kari.getByRole("button", { name: "Send invitasjonen" }).click();
    await kari.getByText(`Invitasjonen er sendt til ${email}.`).waitFor();
    await kari.getByRole("button", { name: "Inviter flere" }).click();
  }
  await check("eieren inviterer flere på en gang og ser status for hver adresse", async () => {
    await kari
      .getByLabel("E-postadressene til dem som skal få se hytta")
      .fill("Siri Venn <siri@test.local>, tor@test.local\nkari@test.local\nsen@test.local");
    await kari.getByLabel("Personlig hilsen").fill("Hei alle sammen! Fjellro står ledig i vinter.");
    await kari.getByRole("button", { name: "Se over før du sender" }).click();
    const heading = kari.getByRole("heading", { name: "Se over før du sender" });
    await heading.waitFor();
    await kari.getByText("4 adresser").waitFor();
    await kari.getByText("Din egen adresse. Hoppes over.").waitFor();
    await kari.getByText("Er invitert fra før og har ikke logget inn ennå. Hoppes over.").waitFor();
    await kari.getByText(/Hver mottaker får sin egen e-post med sin egen lenke/).waitFor();
    assert.equal(
      (await newMails()).filter((mail) => ["siri@test.local", "tor@test.local"].includes(mail.to)).length,
      0,
      "ingenting er sendt før eieren bekrefter",
    );
    assert.match(await focusName(kari), /Se over før du sender/, "fokus flyttes til forhåndsvisningen");
    await shot(kari, "14a-inviter-flere-se-over", kari.locator("form", { has: heading }));
    await kari.getByRole("button", { name: "Send 2 invitasjoner" }).click();
    const receipt = kari.getByRole("status").filter({ hasText: "2 er invitert, 2 hoppet over." });
    await receipt.waitFor();
    const mails = (await newMails()).filter((mail) => ["siri@test.local", "tor@test.local"].includes(mail.to));
    assert.equal(mails.length, 2, "én e-post til hver ny mottaker");
    assert.notEqual(await invitationLink("siri@test.local"), await invitationLink("tor@test.local"));
    await shot(kari, "14b-inviter-flere-kvittering", receipt);
    await kari.getByRole("button", { name: "Inviter flere" }).click();
  });
  kari.once("dialog", (dialog) => dialog.accept());
  await kari.getByRole("button", { name: "Trekk tilbake invitasjonen til angrer@test.local" }).click();
  await kari.getByText("Invitasjonen er trukket tilbake. Lenken i e-posten virker ikke lenger.").waitFor();
  await pool.query(
    `update "invitation" set "expires_at" = now() - interval '1 day' where "email" = 'sen@test.local'`,
  );
  const guest = await phone();
  await check("tilbaketrukket invitasjon gir forståelig beskjed", async () => {
    await guest.goto(await invitationLink("angrer@test.local"));
    await guest.getByRole("heading", { name: "Invitasjonen gjelder ikke lenger" }).waitFor();
    await shot(guest, "15-invitasjon-trukket-tilbake");
  });
  await check("utløpt invitasjon gir forståelig beskjed", async () => {
    await guest.goto(await invitationLink("sen@test.local"));
    await guest.getByRole("heading", { name: "Invitasjonen er utløpt" }).waitFor();
    await guest.getByText("Invitasjoner gjelder i 30 dager.").waitFor();
  });
  await check("ukjent lenke gir forståelig beskjed", async () => {
    await guest.goto(`${BASE}/invitasjon/denne-noekkelen-finnes-ikke-her`);
    await guest.getByRole("heading", { name: "Vi finner ikke invitasjonen" }).waitFor();
  });
  await check("uinnlogget får ikke åpne hytter eller bilder direkte", async () => {
    await guest.goto(`${BASE}/hytter/${fjellro}`);
    await guest.getByRole("heading", { name: "Logg inn" }).waitFor();
    const image = await guest.request.get(`${BASE}/bilder/00000000-0000-4000-8000-000000000000`, {
      maxRedirects: 0,
    });
    assert.notEqual(image.status(), 200);
  });

  console.log("Videresendt invitasjon: annen adresse må godkjennes av eieren");
  await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
  await kari.getByLabel("E-postadressene til dem som skal få se hytta").fill("mottaker@test.local");
  await kari.getByRole("button", { name: "Se over før du sender" }).click();
  await kari.getByRole("button", { name: "Send invitasjonen" }).click();
  await kari.getByText("Invitasjonen er sendt til mottaker@test.local.").waitFor();
  const partner = await phone();
  const forwarded = await invitationLink("mottaker@test.local");
  await partner.goto(forwarded);
  await partner.getByRole("link", { name: "Bli med og se ledige datoer" }).click();
  await check("den videresendte lenken sier at eieren må godkjenne en annen adresse", async () => {
    await partner.getByRole("button", { name: "Bruk en annen adresse" }).click();
    await partner.getByText(/må Kari Eier godkjenne deg før du ser hytta/).waitFor();
    await shot(partner, "16a-annen-adresse");
  });
  {
    const before = (await newMails()).length;
    await partner.getByLabel("E-postadresse").fill("partner@test.local");
    await partner.getByRole("button", { name: "Send meg en kode" }).click();
    await enterCode(partner, "partner@test.local", before);
  }
  await check("utenlandsk nummer uten landskode får beskjed om landskoden", async () => {
    await partner.getByRole("heading", { name: "Velkommen" }).waitFor();
    await partner.waitForLoadState("networkidle");
    // Den som ikke har gitt løftet ennå, er ikke med, og får ingen meny.
    assert.equal(await partner.getByRole("navigation", { name: "Hovedmeny" }).count(), 0);
    await partner.getByLabel("Navn").fill("Pia Partner");
    await partner.getByLabel("Mobilnummer").fill("070-123 45 67");
    await partner.getByRole("checkbox").check();
    await partner.getByRole("button", { name: "Gi løftet og bli med" }).click();
    await partner
      .getByRole("alert")
      .getByText("Skriv mobilnummeret ditt. Utenlandske nummer skrives med landskode, for eksempel +46.")
      .waitFor();
    await shot(partner, "16a2-utenlandsk-nummer");
  });
  const ownerMailsBefore = (await newMails()).length;
  await onboard(partner, "Pia Partner", "+46 70 123 45 67");
  await check("med en annen adresse ser personen ingenting før eieren godkjenner", async () => {
    await partner.getByRole("heading", { name: "Venter på svar fra Kari" }).waitFor();
    // Nummeret med landskode slapp gjennom og er lagret uten mellomrom.
    const stored = await pool.query(
      `select p."phone" from "profile" p join "user" u on u."id" = p."user_id" where u."email" = 'partner@test.local'`,
    );
    assert.equal(stored.rows[0].phone, "+46701234567");
    await shot(partner, "16b-venter-pa-godkjenning");
    await nothingAt(partner, `${BASE}/hytter/${fjellro}`, /Fjellro|Tømmerhytte|Fjellvegen/);
    await partner.goto(`${BASE}/krets`);
    assert.equal((await partner.getByRole("main").innerText()).includes("Fjellro"), false);
    await mailTo("kari@test.local", /Pia Partner vil se Fjellro/, ownerMailsBefore);
  });
  await check("eieren godkjenner, og personen ser hytta", async () => {
    await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
    await kari.getByRole("heading", { name: "Venter på at du godkjenner" }).waitFor();
    await kari.getByText("Invitasjonen ble sendt til mottaker@test.local.").waitFor();
    await kari.getByText("Én person venter på at du godkjenner.", { exact: false }).waitFor();
    await shot(kari, "16c-godkjenn", kari.getByRole("region", { name: "Venter på at du godkjenner" }));
    await kari.getByRole("button", { name: "Godkjenn Pia Partner" }).click();
    await kari.getByText("Personen ser nå hytta og har fått beskjed på e-post.").waitFor();
    await partner.goto(forwarded);
    await partner.waitForURL(new RegExp(`/hytter/${fjellro}$`));
    await partner.getByRole("heading", { name: "Fjellro" }).first().waitFor();
  });

  console.log("Tekstforslag fra bilde og sted");
  const ai = await fakeTextService();
  const ORIGINAL = "Tømmerhytte med peis og badstue. Fem minutter til skiløypa.";
  const storedDescription = async () =>
    (await pool.query(`select "description" from "cabin" where "id" = $1`, [sjobua])).rows[0]
      .description;
  await per.goto(`${BASE}/mine-hytter/${sjobua}`);
  const form = per.locator("form", {
    has: per.getByRole("button", { name: "Lagre endringene" }),
  });
  const description = form.locator('[name="description"]');
  const suggest = form.getByRole("button", { name: "La AI skrive teksten" });
  const save = async (expected) => {
    await form.getByRole("button", { name: "Lagre endringene" }).click();
    await eventually(
      async () => (await storedDescription()) === expected,
      `beskrivelsen ble ikke lagret som «${expected}»`,
    );
  };
  await description.waitFor();
  assert.equal(
    await suggest.count(),
    1,
    "Knappen for tekstforslag vises ikke. Start serveren med AI_GATEWAY_API_KEY og AI_DESCRIPTION_URL, se toppen av filen.",
  );

  await check("uten bilde er knappen grå, og siden sier hva som mangler", async () => {
    assert.equal(await suggest.isDisabled(), true);
    await form.getByText("Legg til et bilde under «Bilder» først.", { exact: false }).waitFor();
  });

  await check("siden sier tre steder at stikkord holder, og at AI skriver teksten", async () => {
    // Under ledeteksten, i det tomme feltet og i ruten med knappen.
    await form.getByText("Skriv stikkord. AI kan gjøre dem om til en ferdig tekst.").waitFor();
    assert.match(await description.getAttribute("placeholder"), /^For eksempel: brygge, badstue/);
    await form.getByText("Fra stikkord til ferdig tekst").waitFor();
    assert.equal(await form.locator("ol > li").count(), 2);
    await form.getByText("Stikkord holder, for eksempel «brygge, badstue, 15 min til butikken».", { exact: false }).waitFor();
    await form.getByText("AI setter stikkordene sammen med bildene, stedet og sengeplassene", { exact: false }).waitFor();
    // Stegene leses opp sammen med feltet.
    const helpId = await description.getAttribute("aria-describedby");
    assert.ok(helpId);
    assert.equal(await form.locator(`[id="${helpId}"] > li`).count(), 2);
  });

  // Et bilde av en rød bu ved sjøen, lastet opp slik eieren gjør det.
  const scene = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
      <rect width="1600" height="1200" fill="#bfe0ee"/>
      <path d="M0 760 L380 610 L820 760 Z" fill="#7d9a8c"/>
      <rect y="760" width="1600" height="440" fill="#2d6f8e"/>
      <path d="M0 1200 L0 930 Q500 860 1600 960 L1600 1200 Z" fill="#c9b79c"/>
      <rect x="640" y="560" width="420" height="360" fill="#a3271c"/>
      <path d="M600 560 L850 400 L1100 560 Z" fill="#3b3b3b"/>
      <rect x="710" y="650" width="100" height="110" fill="#f4e9c8"/>
      <rect x="890" y="700" width="90" height="220" fill="#f7f3ea"/>
    </svg>`),
  )
    .png()
    .toBuffer();
  await per
    .locator('input[type="file"][accept]')
    .setInputFiles({ name: "sjobua.png", mimeType: "image/png", buffer: scene });
  await per.getByText("1 bilde valgt.").waitFor();
  await per.getByRole("button", { name: "Last opp bildene" }).click();
  await per.getByText("Bildet er lagt til.").waitFor();

  await check("med tekst i feltet spør siden først, og nei endrer ingenting", async () => {
    await eventually(async () => suggest.isEnabled(), "knappen ble ikke klar etter at bildet kom på plass");
    await form
      .getByText("Bildene, stedet, sengeplassene og det du har skrevet i feltet, sendes til en AI-tjeneste", { exact: false })
      .waitFor();
    let question = "";
    per.once("dialog", (dialog) => {
      question = dialog.message();
      dialog.dismiss();
    });
    await suggest.click();
    assert.match(question, /AI skriver en ny tekst ut fra det som står i feltet, og erstatter det/);
    assert.equal(await description.inputValue(), ORIGINAL);
    assert.equal(ai.seen.length, 0, "ingenting sendes når eieren sier nei");
  });

  await check("ja legger forslaget i feltet, bare med tastatur, og ingenting er lagret ennå", async () => {
    per.once("dialog", (dialog) => dialog.accept());
    await description.focus();
    await per.keyboard.press("Tab");
    assert.match(await focusName(per), /La AI skrive teksten/);
    await per.keyboard.press("Enter");
    await form.getByRole("status").getByText("Forslaget står i feltet.", { exact: false }).waitFor();
    assert.equal(await description.inputValue(), DRAFT);
    assert.equal(
      await per.evaluate(() => document.activeElement?.getAttribute("name")),
      "description",
      "fokus står i feltet, så eieren kan rette med en gang",
    );
    assert.equal(await storedDescription(), ORIGINAL);
    await shot(per, "17a-tekstforslag", form.locator("fieldset").first());
  });

  await check("AI-tjenesten fikk bildet, stedet, sengeplassene og teksten i feltet, og ikke noe annet", async () => {
    assert.equal(ai.seen.length, 1);
    const body = JSON.parse(ai.seen[0]);
    const [facts, ...images] = body.messages[1].content;
    assert.match(facts.text, /^Opplysninger om hytta:\n- Sted: «Kragerø»\n/);
    assert.match(facts.text, /\n- Sengeplasser: 6\n/);
    // Det eieren hadde skrevet i feltet, er grunnlag for forslaget.
    assert.ok(facts.text.includes(`---\n${ORIGINAL}\n---`));
    assert.equal(images.length, 1);
    assert.match(images[0].image_url.url, /^data:image\/jpeg;base64,/);
    // Navn, adresse, nøkkel, regler, telefon og eier sendes ikke.
    body.messages[1].content = [facts];
    const rest = JSON.stringify(body);
    assert.equal(/Sjøbua|Fjellvegen|Nøkkelboks|Hund er velkommen|91234567|per@test\.local|Per Eier/.test(rest), false);
  });

  await check("forslaget lagres først når eieren trykker lagre", async () => {
    await save(DRAFT);
    await form.getByText("Forslaget står i feltet.", { exact: false }).waitFor({ state: "detached" });
  });

  await check("svikter AI-tjenesten, står teksten urørt, og eieren kan fortsatt lagre", async () => {
    ai.state.answer = "down";
    await description.fill("Skrevet selv, uten hjelp.");
    per.once("dialog", (dialog) => dialog.accept());
    await suggest.click();
    await form
      .getByRole("alert")
      .getByText("Vi fikk ikke laget et forslag akkurat nå.", { exact: false })
      .waitFor();
    assert.equal(await description.inputValue(), "Skrevet selv, uten hjelp.");
    await shot(per, "17b-tekstforslag-feil", form.locator("fieldset").first());
    await save("Skrevet selv, uten hjelp.");
    ai.state.answer = "text";
  });

  await check("stikkord i feltet blir til en ferdig tekst", async () => {
    const before = ai.seen.length;
    await description.fill("brygge, badstue, 15 min til butikken");
    per.once("dialog", (dialog) => dialog.accept());
    await suggest.click();
    await form.getByRole("status").getByText("Forslaget står i feltet.", { exact: false }).waitFor();
    const [facts] = JSON.parse(ai.seen[before]).messages[1].content;
    assert.ok(facts.text.includes("---\nbrygge, badstue, 15 min til butikken\n---"), "stikkordene er grunnlag");
    assert.equal(await description.inputValue(), DRAFT);
    assert.equal(await storedDescription(), "Skrevet selv, uten hjelp.", "ingenting er lagret ennå");
  });

  await check("tom beskrivelse gir et hint øverst, og forslaget kommer uten spørsmål", async () => {
    await description.fill("");
    await save("");
    await per.reload();
    await per.getByText("Hytta har ingen beskrivelse ennå.").waitFor();
    let asked = false;
    const onDialog = (dialog) => {
      asked = true;
      dialog.accept();
    };
    per.on("dialog", onDialog);
    await per.getByRole("link", { name: "Skriv noen stikkord, så skriver AI teksten" }).click();
    // Det tomme feltet viser et eksempel på stikkord, og ruten under forklarer de to stegene.
    await shot(per, "17c-stikkord-tomt-felt", form.locator("fieldset").first());
    await suggest.click();
    await form.getByRole("status").getByText("Forslaget står i feltet.", { exact: false }).waitFor();
    per.off("dialog", onDialog);
    assert.equal(asked, false, "et tomt felt erstattes uten spørsmål");
    assert.equal(await description.inputValue(), DRAFT);
    // Hytta settes tilbake slik den var, så resten av testen ser det samme som før.
    await description.fill(ORIGINAL);
    await save(ORIGINAL);
  });

  await check("personvernsiden sier hva som sendes til AI-tjenesten", async () => {
    await anne.goto(`${BASE}/personvern`);
    await anne
      .getByText("sender vi bildene av hytta, stedsnavnet, en avrundet posisjon", { exact: false })
      .waitFor();
    await anne.getByText("Selve forslaget lagrer vi ikke.", { exact: false }).waitFor();
  });
  await ai.close();

  console.log("Profilbilde");
  const linkedIn = await fakeLinkedIn();
  const userId = async (email) =>
    (await pool.query(`select "id" from "user" where "email" = $1`, [email])).rows[0].id;
  const storedPhoto = async (email) =>
    (
      await pool.query(
        `select p."source" from "profile_photo" p join "user" u on u."id" = p."user_id" where u."email" = $1`,
        [email],
      )
    ).rows[0]?.source ?? null;
  /** Henter adressen med kakene til vinduet, slik nettleseren gjør for et bilde. */
  const fetched = async (page, address) => {
    const response = await page.request.get(`${BASE}${address}`, { maxRedirects: 0 });
    return { status: response.status(), type: response.headers()["content-type"] ?? "" };
  };
  const perId = await userId("per@test.local");
  const menu = (page) => page.getByRole("banner");

  await check("uten bilde vises forbokstaven, og hyttekretsen foreslår å legge til et", async () => {
    await per.goto(`${BASE}/krets`);
    const nudge = per.getByRole("complementary", { name: "Vis hvem du er." });
    await nudge.waitFor();
    await nudge.getByRole("button", { name: "Hent bildet fra LinkedIn" }).waitFor();
    assert.equal(await menu(per).locator("img").count(), 0);
    assert.equal(
      await nudge.getByRole("button").count(),
      1,
      "Knappen for LinkedIn vises ikke. Start serveren med LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET og LINKEDIN_TEST_ORIGIN, se toppen av filen.",
    );
    await shot(per, "18a-vis-hvem-du-er", nudge);
  });

  await check("ett trykk henter bildet fra LinkedIn og legger det på profilen", async () => {
    await per
      .getByRole("complementary", { name: "Vis hvem du er." })
      .getByRole("button", { name: "Hent bildet fra LinkedIn" })
      .click();
    await per.waitForURL(/\/profil\?bilde=hentet$/);
    await per.getByRole("status").getByText("Bildet er hentet fra LinkedIn.").waitFor();
    await per.getByText(/Bildet ble hentet fra LinkedIn \d+\. /).waitFor();
    assert.equal(await storedPhoto("per@test.local"), "linkedin");
    // Vi ba bare om navn og bilde, og bare bildet ble hentet.
    const asked = linkedIn.seen.find((r) => r.path === "/oauth/v2/authorization");
    assert.equal(asked.query.scope, "openid profile");
    assert.equal(asked.query.redirect_uri, `${BASE}/profil/linkedin`);
    assert.deepEqual(
      linkedIn.seen.map((r) => r.path),
      ["/oauth/v2/authorization", "/oauth/v2/accessToken", "/v2/userinfo", "/bilde.jpg"],
    );
    // Navnet hos LinkedIn er et annet. Navnet her er urørt, og innloggingen er den samme.
    await per.getByRole("heading", { name: "Per Eier" }).waitFor();
    assert.equal((await per.getByRole("main").innerText()).includes("Per Privat"), false);
    // Bildet står i toppmenyen og på profilen.
    await menu(per).locator(`img[src^="/profilbilder/${perId}?v="]`).waitFor();
    const shown = per.getByRole("main").locator(`img[src^="/profilbilder/${perId}?v="]`);
    await eventually(
      async () => (await shown.evaluate((img) => img.naturalWidth)) === 400,
      "profilbildet ble ikke vist i full størrelse",
    );
    await shot(per, "18b-profil-med-bilde-fra-linkedin");
    // Dyttet på hyttekretsen er borte når bildet er på plass.
    await per.goto(`${BASE}/krets`);
    await per.getByRole("heading", { name: "Din hyttekrets" }).waitFor();
    assert.equal(await per.getByRole("complementary", { name: "Vis hvem du er." }).count(), 0);
  });

  await check("den som ser hytta, ser bildet av eieren der navnet står", async () => {
    await kari.goto(`${BASE}/krets`);
    const card = kari.getByRole("link", { name: /Sjøbua/ }).first();
    const avatar = card.locator(`img[src^="/profilbilder/${perId}?v="]`);
    await avatar.waitFor();
    await eventually(
      async () => (await avatar.evaluate((img) => img.naturalWidth)) === 128,
      "bildet av eieren ble ikke vist på hyttekortet",
    );
    await shot(kari, "18c-hyttekrets-med-bilde");
    await kari.goto(`${BASE}/hytter/${sjobua}`);
    await kari.getByText("Hytta til Per Eier.", { exact: false }).first().waitFor();
    await kari.getByRole("main").locator(`img[src^="/profilbilder/${perId}?v="]`).first().waitFor();
    await shot(kari, "18d-hytteside-med-bilde", kari.getByRole("main").locator("header").first());
  });

  await check("et medlem uten forbindelse og en uten innlogging får ikke bildet", async () => {
    const src = await menu(per).locator("img").getAttribute("src");
    assert.deepEqual(await fetched(per, src), { status: 200, type: "image/webp" });
    assert.deepEqual(await fetched(kari, src), { status: 200, type: "image/webp" });
    // Pia ser bare Fjellro, som er Karis. Hun har ingen forbindelse til Per.
    assert.equal((await fetched(partner, src)).status, 404);
    assert.equal((await fetched(partner, `/profilbilder/${perId}`)).status, 404);
    // Uten innlogging sendes man til innloggingen, og får ikke noe bilde.
    const anonymous = await phone();
    const refusedTo = await fetched(anonymous, src);
    assert.notEqual(refusedTo.status, 200);
    assert.equal(refusedTo.type.startsWith("image/"), false);
    await anonymous.context().close();
  });

  await check("avbryter brukeren hos LinkedIn, er ingenting hentet", async () => {
    linkedIn.state.answer = "cancel";
    await kari.goto(`${BASE}/profil`);
    await kari.getByRole("button", { name: "Hent bildet fra LinkedIn" }).click();
    await kari.waitForURL(/\/profil\?bilde=avbrutt$/);
    await kari.getByRole("alert").getByText("Du avbrøt hos LinkedIn.", { exact: false }).waitFor();
    assert.equal(await storedPhoto("kari@test.local"), null);
    linkedIn.state.answer = "allow";
  });

  await check("et svar som ikke hører til en tur brukeren selv startet, gir ingenting", async () => {
    const before = linkedIn.seen.length;
    // Som om noen lurte Kari til å åpne en lenke med en fremmed kode fra LinkedIn.
    await kari.goto(`${BASE}/profil/linkedin?code=fremmed-kode&state=funnet-paa`);
    await kari.waitForURL(/\/profil\?bilde=feil$/);
    await kari.getByRole("alert").getByText("Vi fikk ikke hentet bildet fra LinkedIn.", { exact: false }).waitFor();
    assert.equal(linkedIn.seen.length, before, "koden skal ikke sendes videre til LinkedIn");
    assert.equal(await storedPhoto("kari@test.local"), null);
  });

  await check("brukeren kan laste opp et bilde selv, og fjerne det igjen", async () => {
    const own = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#7a4b2a" },
    })
      .jpeg()
      .toBuffer();
    await kari.goto(`${BASE}/profil`);
    await kari.getByText("Du har ikke noe bilde ennå.", { exact: false }).waitFor();
    await kari.getByRole("button", { name: "Last opp et bilde" }).waitFor();
    await kari
      .locator("input[data-profilbilde]")
      .setInputFiles({ name: "meg.jpg", mimeType: "image/jpeg", buffer: own });
    await kari.getByRole("status").getByText("Bildet er lagret.").waitFor();
    assert.equal(await storedPhoto("kari@test.local"), "upload");
    await kari.getByText(/Du lastet opp bildet \d+\. /).waitFor();
    const kariId = await userId("kari@test.local");
    await menu(kari).locator(`img[src^="/profilbilder/${kariId}?v="]`).waitFor();
    await shot(kari, "18e-profil-med-eget-bilde");

    await kari.getByRole("button", { name: "Fjern bildet" }).click();
    await kari.getByRole("status").getByText("Bildet er fjernet.").waitFor();
    await kari.getByText("Du har ikke noe bilde ennå.", { exact: false }).waitFor();
    assert.equal(await storedPhoto("kari@test.local"), null);
    assert.equal(await menu(kari).locator("img").count(), 0);
  });

  await check("invitasjonen viser bildet av den som inviterer, før innlogging", async () => {
    // Invitasjonen legges rett i databasen, så ingen e-post sendes for denne sjekken.
    const token = "profilbildetest-0123456789abcdef";
    await pool.query(
      `insert into "invitation" ("email", "kind", "cabin_id", "invited_by", "token")
       values ('bilde@test.local', 'friend', $1, $2, $3)`,
      [sjobua, perId, token],
    );
    const invited = await phone();
    await invited.goto(`${BASE}/invitasjon/${token}`);
    await invited.getByRole("heading", { name: "Per låner deg hytta si" }).waitFor();
    const avatar = invited.locator(`img[src^="/invitasjon/${token}/avsender?v="]`);
    await avatar.waitFor();
    await eventually(
      async () => (await avatar.evaluate((img) => img.naturalWidth)) === 128,
      "bildet av den som inviterer, ble ikke vist",
    );
    await invited.getByText("Per Eier", { exact: true }).waitFor();
    await shot(invited, "18f-invitasjon-med-bilde");
    // Trekkes invitasjonen tilbake, viser lenken ikke bildet lenger.
    const src = await avatar.getAttribute("src");
    await pool.query(`update "invitation" set "revoked_at" = now() where "token" = $1`, [token]);
    assert.equal((await fetched(invited, src)).status, 404);
    await pool.query(`delete from "invitation" where "token" = $1`, [token]);
    await invited.context().close();
  });

  await check("personvernsiden sier hva som hentes fra LinkedIn, og hvem som ser bildet", async () => {
    await anne.goto(`${BASE}/personvern`);
    await anne.getByText("Profilbildet ditt, hvis du legger inn et.", { exact: false }).waitFor();
    await anne.getByText("Vi henter bare bildet.", { exact: false }).waitFor();
    await anne.getByText("Profilbildet ditt står ved navnet ditt", { exact: false }).waitFor();
  });
  await linkedIn.close();

  console.log("Lenkene nederst og Hytteløftet");
  await check("sidene bak lenkene nederst viser menyen for den som er logget inn", async () => {
    for (const [link, heading] of [
      ["Hytteløftet", "Hytteløftet"],
      ["Personvern", "Personvern"],
      ["Om oss", /^Om /],
    ]) {
      await ola.goto(`${BASE}/krets`);
      await ola.getByRole("contentinfo").getByRole("link", { name: link }).click();
      await ola.getByRole("heading", { level: 1, name: heading }).waitFor();
      const menu = ola.getByRole("navigation", { name: "Hovedmeny" });
      await menu.getByRole("link", { name: "Hyttekrets" }).waitFor();
      await ola.getByRole("button", { name: "Logg ut" }).waitFor();
      if (link === "Hytteløftet") await shot(ola, "23-hytteloftet-innlogget");
      await menu.getByRole("link", { name: "Hyttekrets" }).click();
      await ola.waitForURL(/\/krets$/);
    }
  });
  await check("også «Slik virker det» har menyen, og de andre åpne sidene er som før", async () => {
    // Fra Hytteløftet kommer man videre til «Slik virker det» med lenken nederst.
    await ola.goto(`${BASE}/hytteloftet`);
    await ola.getByRole("contentinfo").getByRole("link", { name: "Slik virker det" }).click();
    await ola.waitForURL(/\/slik-virker-det$/);
    await ola.getByRole("navigation", { name: "Hovedmeny" }).getByRole("link", { name: "Hyttekrets" }).waitFor();
    // Sidene for hver målgruppe er ikke lenket fra tjenesten, og har ingen meny.
    await ola.goto(`${BASE}/v1`);
    await ola.getByRole("heading", { level: 1 }).waitFor();
    await ola.waitForLoadState("networkidle");
    assert.equal(await ola.getByRole("navigation", { name: "Hovedmeny" }).count(), 0);
  });
  await check("løftet lover ikke vask når eieren tar betalt for vask", async () => {
    await ola.goto(`${BASE}/hytteloftet`);
    await ola
      .getByText(
        "Ryddet, søppel tatt med, vann og strøm slik eieren har bedt om, og vasket når eieren ikke tar betalt for vask.",
      )
      .waitFor();
  });
  await check("mobilnummeret kan rettes på profilen", async () => {
    await ola.goto(`${BASE}/profil`);
    const panel = ola.locator("section").filter({ has: ola.getByRole("heading", { name: "Mobilnummer" }) });
    const field = panel.getByLabel("Mobilnummer");
    assert.equal(await field.inputValue(), "91234567");
    // Uten landskode vet ingen hvilket land nummeret hører til.
    await field.fill("070-123 45 67");
    await panel.getByRole("button", { name: "Lagre nummeret" }).click();
    await panel.getByRole("alert").getByText("Utenlandske nummer skrives med landskode", { exact: false }).waitFor();
    await field.fill("+46 70 123 45 67");
    await panel.getByRole("button", { name: "Lagre nummeret" }).click();
    await panel.getByRole("status").getByText("Mobilnummeret er lagret.").waitFor();
    await shot(ola, "24-profil-mobilnummer", panel);
    await ola.reload();
    assert.equal(await field.inputValue(), "+46701234567");
  });
  await check("uten innlogging har de samme sidene ingen meny", async () => {
    const anonymous = await phone();
    for (const path of ["/hytteloftet", "/personvern", "/om", "/"]) {
      await anonymous.goto(`${BASE}${path}`);
      await anonymous.getByRole("heading", { level: 1 }).waitFor();
      await anonymous.waitForLoadState("networkidle");
      assert.equal(await anonymous.getByRole("navigation", { name: "Hovedmeny" }).count(), 0, path);
      assert.equal(await anonymous.getByRole("button", { name: "Logg ut" }).count(), 0, path);
    }
    await anonymous.context().close();
  });

  console.log("Varsler");
  await check("lenken til en deling som er fjernet, gir ingenting", async () => {
    await per.goto(perLink);
    await per.getByRole("heading", { name: "Invitasjonen gjelder ikke lenger" }).waitFor();
    assert.equal(/Fjellro|Hafjell/.test(await per.getByRole("main").innerText()), false);
  });
  await check("hver invitasjon ga én e-post, og ingen gikk til andre enn testbrukerne", async () => {
    const mails = await newMails();
    assert.deepEqual(mails.filter((mail) => !mail.to.endsWith("@test.local")), []);
    const invitations = mails.filter((mail) => /\/invitasjon\//.test(mail.text));
    const perRecipient = new Map();
    for (const mail of invitations) perRecipient.set(mail.to, (perRecipient.get(mail.to) ?? 0) + 1);
    assert.deepEqual(Object.fromEntries(perRecipient), {
      "nina@test.local": 1,
      "kari@test.local": 1,
      "per@test.local": 1,
      "ola@test.local": 1,
      "angrer@test.local": 1,
      "sen@test.local": 1,
      "siri@test.local": 1,
      "tor@test.local": 1,
      "mottaker@test.local": 1,
    });
    const accesses = await pool.query(`select count(*)::int as n from "cabin_access"`);
    assert.equal(accesses.rows[0].n, 3, "Sjøbua er delt med Kari og Ola. Fjellro bare med Pia, som eieren godkjente");
  });

  console.log(`\n${passed} sjekker bestått i nettleser (390 × 844).`);
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error("\nTESTEN FEILET\n", error);
} finally {
  await browser.close();
  await pool.end();
}
process.exit(failed ? 1 : 0);
