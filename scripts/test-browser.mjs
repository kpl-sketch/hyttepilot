/**
 * Går gjennom invitasjon, første innlogging, deling og booking i en ekte
 * nettleser på mobilstørrelse. Deler av flyten gjøres bare med tastatur, og
 * kalenderen sjekkes for dato og ledighet slik en skjermleser får det.
 *
 * Slik kjøres den:
 *   1. npx next build
 *   2. EMAIL_DEV_OUTBOX=1 ADDRESS_SEARCH_URL=http://127.0.0.1:9/sok npx next start
 *   3. npm run test:nettleser
 *
 * Testen TØMMER databasen og nekter å kjøre mot annet enn en lokal database.
 * Den trenger Chrome eller Chromium (sett CHROME_PATH hvis den ikke finnes
 * av seg selv). Ingen e-post sendes: innloggingskoder og invitasjoner leses
 * fra .dev-outbox.jsonl. Alle adresser slutter på @test.local.
 *
 * Skjermbildene havner i mappen SCREENSHOT_DIR (standard: skjermbilder/).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import pg from "pg";
import { chromium } from "playwright-core";

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

async function onboard(page, name) {
  await page.getByRole("heading", { name: "Velkommen" }).waitFor();
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Mobilnummer").fill("91234567");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Gi løftet og bli med" }).click();
}

async function addCabin(page, { name, area, cost, cleaning }) {
  await page.goto(`${BASE}/mine-hytter/ny`);
  // Skjemaet er langt, og flere ledetekster ligner. Feltene fylles etter navn.
  const field = (key) => page.locator(`form [name="${key}"]`);
  await field("name").fill(name);
  await field("area").fill(area);
  await field("description").fill("Tømmerhytte med peis og badstue. Fem minutter til skiløypa.");
  await field("costPerNight").fill(String(cost));
  await field("markupPercent").fill("0");
  await field("cleaningFee").fill(String(cleaning));
  await field("rules").fill("Ingen fest. Hund er velkommen.");
  await field("address").fill("Fjellvegen 12, 2636 Øyer");
  await field("arrivalInfo").fill("Nøkkelboks ved døra, kode 1234.");
  await page.getByRole("button", { name: "Legg inn hytta" }).click();
  await page.getByText("Hytta er lagret. Den er privat til du deler den.").waitFor();
  return page.url().match(/mine-hytter\/([0-9a-f-]+)/)[1];
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
    `truncate "booking", "availability", "cabin_photo", "cabin_access", "invitation", "cabin", "profile", "login_throttle", "verification", "session", "account", "user" cascade`,
  );

  console.log("Administrator og første hytteeier");
  const anne = await phone();
  await anne.goto(`${BASE}/`);
  await check("forsiden sier hva tjenesten er, uten å love for mye", async () => {
    await anne.getByRole("heading", { name: "Del hytta med folk du kjenner." }).waitFor();
    await anne.getByText("Du blir invitert av noen som allerede er med.").waitFor();
    await shot(anne, "01-forside");
  });
  await anne.goto(`${BASE}/logg-inn`);
  await logIn(anne, "admin@test.local");
  await onboard(anne, "Anne Admin");
  await check("tom hyttekrets forklarer hva som mangler og hva man kan gjøre", async () => {
    await anne.getByRole("heading", { name: "Din hyttekrets" }).waitFor();
    await anne.getByText("Ingen har delt en hytte med deg ennå.").waitFor();
    await anne.getByRole("heading", { name: "Har du en hytte du vil dele med noen du kjenner?" }).waitFor();
    await shot(anne, "02-tom-hyttekrets");
  });
  await anne.goto(`${BASE}/admin`);
  await anne.getByLabel("E-postadresse").fill("kari@test.local");
  await anne.getByLabel("Personlig hilsen").fill("Fint om du vil være med fra start.");
  await anne.getByRole("button", { name: "Send invitasjonen" }).click();
  await anne.getByText("Invitasjonen er sendt.").waitFor();
  await check("administrasjon sier rett ut at den ikke gir innsyn i andres hytter", async () => {
    await anne.getByText("Som administrator ser du ikke andres hytter").waitFor();
    await shot(anne, "03-administrasjon");
  });

  const kari = await phone();
  await kari.goto(await invitationLink("kari@test.local"));
  await kari.getByRole("heading", { name: /Anne Admin inviterer deg til/ }).waitFor();
  await kari.getByRole("link", { name: "Logg inn" }).click();
  await logIn(kari, "kari@test.local");
  await onboard(kari, "Kari Eier");
  await check("invitasjon uten hytte gir adgang, og sier at ingen hytter er delt ennå", async () => {
    await kari.getByRole("heading", { name: "Velkommen. Anne Admin har invitert deg." }).waitFor();
    await kari.getByText("Invitasjonen gir deg adgang, men ingen hytter ennå.").waitFor();
  });

  console.log("Dele egen hytte");
  const fjellro = await addCabin(kari, { name: "Fjellro", area: "Hafjell", cost: 252, cleaning: 500 });
  await check("ny hytte er privat, og siden sier hva som gjenstår", async () => {
    await kari.getByRole("heading", { name: "Hytta er privat" }).waitFor();
    await kari.getByText("Bare du.").waitFor();
    await shot(kari, "04-ny-hytte-er-privat", kari.locator("section", { hasText: "Hytta er privat" }).first());
  });
  await openDates(kari, d(10), d(40));
  await openDates(kari, d(380), d(430));

  await kari.getByLabel("E-postadressen til den du vil dele med").fill("per@test.local");
  await kari.getByLabel("Personlig hilsen").fill("Velkommen på hytta, Per!");
  await kari.getByRole("button", { name: "Se over før du sender" }).click();
  await check("eieren ser mottaker, hytte, tilgang og e-posten før noe sendes", async () => {
    const heading = kari.getByRole("heading", { name: "Se over før du sender" });
    await heading.waitFor();
    await kari.getByText("per@test.local (ny)").waitFor();
    await kari.getByText("Fjellro, Hafjell").first().waitFor();
    await kari.getByText("dele hytta di videre med noen").waitFor();
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

  console.log("Invitasjon og første innlogging, bare med tastatur");
  const perLink = await invitationLink("per@test.local");
  const per = await phone();
  await per.goto(perLink);
  await check("åpen invitasjonslenke viser avsender, men ingenting om hytta", async () => {
    await per.getByRole("heading", { name: /Kari Eier inviterer deg til/ }).waitFor();
    const text = await per.getByRole("main").innerText();
    assert.match(text, /p•••@test\.local/);
    assert.equal(/Fjellro|Hafjell|Fjellvegen/.test(text), false, "hytta skal ikke vises før innlogging");
    assert.equal(text.includes("per@test.local"), false, "hele adressen skal ikke vises");
    await shot(per, "06-invitasjon-for-innlogging");
  });
  await check("invitasjon, innlogging og løfte kan gjøres med tastatur", async () => {
    await tabTo(per, /Logg inn og se hytta/);
    await per.keyboard.press("Enter");
    await per.getByText("Du logger inn for å ta imot invitasjonen fra").waitFor();
    const before = (await newMails()).length;
    await tabTo(per, /E-postadresse/);
    await per.keyboard.type("per@test.local");
    await per.keyboard.press("Enter");
    await enterCode(per, "per@test.local", before, { keyboard: true });

    await per.getByRole("heading", { name: "Velkommen" }).waitFor();
    await per.getByText("har invitert deg").waitFor();
    await tabTo(per, /Navn/);
    await per.keyboard.press("ControlOrMeta+a");
    await per.keyboard.type("Per Eier");
    await tabTo(per, /Mobilnummer/);
    await per.keyboard.type("91234567");
    await tabTo(per, /Jeg har lest og lover/);
    await per.keyboard.press("Space");
    await tabTo(per, /Gi løftet og bli med/);
    await per.keyboard.press("Enter");
  });
  await check("første side viser hvem som inviterte, hilsenen og akkurat den hytta", async () => {
    await per.getByRole("heading", { name: "Kari Eier har delt Fjellro med deg" }).waitFor();
    await per.getByText("Velkommen på hytta, Per!").waitFor();
    await per.getByText("Du ble invitert av Kari Eier.").waitFor();
    assert.equal(await per.getByRole("link", { name: /Fjellro/ }).count(), 2);
    await per.getByText("Ledig for forespørsel:").waitFor();
    await shot(per, "07-forste-side-etter-innlogging");
  });

  await check("gjentatt åpning av invitasjonen gir verken ny e-post eller dobbel tilgang", async () => {
    const before = (await newMails()).length;
    for (let i = 0; i < 3; i++) {
      await per.goto(perLink);
      await per.getByRole("heading", { name: "Kari Eier har delt Fjellro med deg" }).waitFor();
    }
    assert.equal((await newMails()).length, before);
    const access = await pool.query(
      `select count(*)::int as n from "cabin_access" where "cabin_id" = $1`,
      [fjellro],
    );
    assert.equal(access.rows[0].n, 1);
  });

  console.log("Kalender og forespørsel, bare med tastatur");
  await tabTo(per, /Se Fjellro og ledige datoer/);
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
    await per.getByText("Du deler ingen hytte med Kari.").waitFor();
    await kari.goto(`${BASE}/krets`);
    await kari.getByText("Ingen har delt en hytte med deg ennå.").waitFor();
  });
  await per.getByText("Vil du dele hytta di med Kari?").click();
  await per.getByRole("button", { name: "Se over før du deler" }).click();
  await per.getByRole("heading", { name: "Se over før du deler" }).waitFor();
  await check("deling tilbake krever at B ser over og bekrefter", async () => {
    await per.getByText("Kari Eier (ny)").waitFor();
    await kari.reload();
    await kari.getByText("Ingen har delt en hytte med deg ennå.").waitFor();
    await shot(per, "10-dele-tilbake", per.locator("li", { hasText: "Vil du dele hytta di med Kari?" }));
  });
  await per.getByRole("button", { name: "Del hytta med Kari Eier" }).click();
  await per.getByText("Kari Eier ser nå hytta og har fått beskjed på e-post.").waitFor();
  await check("etter Bs valg ser A hytta til B", async () => {
    await kari.reload();
    await kari.getByRole("link", { name: /Sjøbua/ }).waitFor();
    await kari.getByText("Delt med deg av Per Eier.").waitFor();
    await kari.getByText("Du deler Fjellro med Per.").waitFor();
    await shot(kari, "11-din-hyttekrets");
  });

  await check("B inviterer C til sin hytte, bare med tastatur", async () => {
    await per.reload();
    await per.getByRole("heading", { name: "Hvem ville du selv lånt bort hytta til?" }).waitFor();
    await tabTo(per, /E-postadressen til den du vil dele med/);
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
  await ola.getByRole("link", { name: "Logg inn og se hytta" }).click();
  await logIn(ola, "ola@test.local");
  await onboard(ola, "Ola Venn");
  await ola.getByRole("heading", { name: "Per Eier har delt Sjøbua med deg" }).waitFor();
  await check("C ser bare hytta til B, ikke hytta til A", async () => {
    const text = await ola.getByRole("main").innerText();
    assert.equal(text.includes("Fjellro"), false);
    assert.equal(text.includes("Kari"), false);
    await nothingAt(ola, `${BASE}/hytter/${fjellro}`, /Fjellro|Hafjell|Tømmerhytte|Kari/);
  });
  await check("en annen innlogget person får ingenting ut av en videresendt invitasjon", async () => {
    await ola.goto(perLink);
    await ola.getByRole("heading", { name: "Invitasjonen gjelder en annen adresse" }).waitFor();
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

  await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
  let question = "";
  kari.once("dialog", async (dialog) => {
    question = dialog.message();
    await dialog.accept();
  });
  const stop = kari.getByRole("button", { name: "Slutt å dele med Per Eier" });
  await stop.waitFor();
  await shot(kari, "14-styre-deling", kari.locator("section", { hasText: "Velg hvem du vil dele med" }));
  await stop.click();
  await kari.getByText("Delingen er fjernet.").waitFor();
  await kari.getByText("Forespørsler og opphold er ikke endret.").waitFor();
  await check("eieren får vite hva som blir stående før delingen fjernes", () => {
    assert.match(question, /Slutte å dele Fjellro med Per Eier\?/);
    assert.match(question, /kan ikke sende nye forespørsler/);
    assert.match(question, /ett opphold du har sagt ja til\. Det står som før/);
  });
  await check("etter tilbaketrekking ser ikke B hytta, men oppholdet står", async () => {
    await nothingAt(per, `${BASE}/hytter/${fjellro}`, /Fjellro|Hafjell|Tømmerhytte/);
    await per.goto(`${BASE}/krets`);
    await per.getByText("Ingen har delt en hytte med deg ennå.").waitFor();
    await per.goto(`${BASE}/foresporsler`);
    await per.getByText("Betalt og reservert").waitFor();
    await per.getByText("Fjellvegen 12, 2636 Øyer").waitFor();
    await kari.goto(`${BASE}/foresporsler`);
    await kari.getByText("Betalt og reservert").waitFor();
  });

  console.log("Utløpt, tilbaketrukket og ukjent invitasjon");
  await kari.goto(`${BASE}/mine-hytter/${fjellro}`);
  for (const email of ["angrer@test.local", "sen@test.local"]) {
    await kari.getByLabel("E-postadressen til den du vil dele med").fill(email);
    await kari.getByRole("button", { name: "Se over før du sender" }).click();
    await kari.getByRole("button", { name: "Send invitasjonen" }).click();
    await kari.getByText(`Invitasjonen er sendt til ${email}.`).waitFor();
    await kari.getByRole("button", { name: "Inviter en til" }).click();
  }
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
      "kari@test.local": 1,
      "per@test.local": 1,
      "ola@test.local": 1,
      "angrer@test.local": 1,
      "sen@test.local": 1,
    });
    const accesses = await pool.query(`select count(*)::int as n from "cabin_access"`);
    assert.equal(accesses.rows[0].n, 2, "Sjøbua er delt med Kari og Ola. Fjellro er ikke delt med noen");
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
