/**
 * Sjekker tilkoblingene til databasen: at serveren holdes våken mens en
 * tilkobling er i bruk, at spørringer prøves på nytt når det er trygt, og at
 * verdier fra spørringer ikke havner i loggen. Kjøres mot den lokale databasen.
 */
import assert from "node:assert/strict";
import { describeForLog } from "../src/lib/auth-log";
import { connectionFailure, createPool, isRead, retry } from "../src/lib/db/pool";

let passed = 0;
async function check(name: string, run: () => unknown) {
  try {
    await run();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FEIL  ${name}`);
    throw error;
  }
}

/** Samler det serveren blir bedt om å holde seg våken for, og sier hva som er ferdig. */
function recorder() {
  const work: { done: boolean }[] = [];
  const keepAlive = (promise: Promise<unknown>) => {
    const entry = { done: false };
    work.push(entry);
    void promise.then(() => {
      entry.done = true;
    });
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { work, keepAlive, settle };
}

const failure = (message: string, code?: string) => Object.assign(new Error(message), { code });
const noPause = async () => {};
const connectionString = process.env.DATABASE_URL;

async function main() {
  console.log("Tilkoblinger til databasen");

  await check("feil fra tilkoblingen kjennes igjen", () => {
    const kind = (message: string, code?: string) => connectionFailure(failure(message, code));
    assert.equal(kind("Authentication timed out", "08P01"), "never-ran");
    assert.equal(
      kind("Client network socket disconnected before secure TLS connection was established", "ECONNRESET"),
      "never-ran",
    );
    assert.equal(kind("timeout exceeded when trying to connect"), "never-ran");
    assert.equal(kind("Connection terminated due to connection timeout"), "never-ran");
    assert.equal(kind("connect ECONNREFUSED 127.0.0.1:5", "ECONNREFUSED"), "never-ran");
    assert.equal(kind("Connection terminated unexpectedly"), "lost");
    assert.equal(kind("read ECONNRESET", "ECONNRESET"), "lost");
    assert.equal(kind("terminating connection due to administrator command", "57P01"), "lost");
    assert.equal(kind('duplicate key value violates unique constraint "x"', "23505"), null);
    assert.equal(kind("syntax error at or near", "42601"), null);
    assert.equal(connectionFailure("Authentication timed out"), null);
  });

  await check("bare ren lesing regnes som lesing", () => {
    assert.equal(isRead('select "id" from "session" where "token" = $1'), true);
    assert.equal(isRead({ text: "  SELECT 1" }), true);
    assert.equal(isRead('select "id" from "cabin" where "id" = $1 for update'), false);
    assert.equal(isRead("select 1 for no key update"), false);
    assert.equal(isRead('insert into "cabin" default values'), false);
    assert.equal(isRead('update "cabin" set "name" = $1'), false);
    assert.equal(isRead("begin"), false);
    assert.equal(isRead(undefined), false);
  });

  await check("lesing prøves på nytt når tilkoblingen forsvant", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 4) throw failure("Connection terminated unexpectedly");
        return "svar";
      },
      true,
      noPause,
    );
    assert.equal(result, "svar");
    assert.equal(calls, 4);
  });

  await check("skriving prøves bare på nytt når spørringen aldri ble sendt", async () => {
    let calls = 0;
    const lost = async () => {
      calls += 1;
      throw failure("Connection terminated unexpectedly");
    };
    await assert.rejects(retry(lost, false, noPause), /terminated unexpectedly/);
    assert.equal(calls, 1, "skriving skal ikke gjentas når vi ikke vet om den ble lagret");

    calls = 0;
    const written = await retry(
      async () => {
        calls += 1;
        if (calls === 1) throw failure("Authentication timed out", "08P01");
        return "lagret";
      },
      false,
      noPause,
    );
    assert.equal(written, "lagret");
    assert.equal(calls, 2);
  });

  await check("andre feil prøves ikke på nytt, og forsøkene tar slutt", async () => {
    let calls = 0;
    const duplicate = async () => {
      calls += 1;
      throw failure("duplicate key value", "23505");
    };
    await assert.rejects(retry(duplicate, true, noPause), /duplicate key/);
    assert.equal(calls, 1);

    calls = 0;
    const alwaysDown = async () => {
      calls += 1;
      throw failure("Authentication timed out", "08P01");
    };
    await assert.rejects(retry(alwaysDown, true, noPause), /Authentication timed out/);
    assert.equal(calls, 7, "ett forsøk og seks nye");
  });

  await check("serveren holdes våken til spørringen er ferdig og tilkoblingen lukket", async () => {
    const { work, keepAlive, settle } = recorder();
    const pool = createPool({ connectionString, max: 2, idleTimeoutMillis: 200 }, keepAlive);
    const pending = pool.query("select pg_sleep(0.15), 7 as n");
    await settle();
    assert.equal(work.length, 1);
    assert.equal(work[0].done, false, "spørringen kjører ennå");
    const result = await pending;
    assert.equal(result.rows[0].n, 7);
    await settle();
    assert.equal(work[0].done, false, "tilkoblingen ligger ledig og er ikke lukket ennå");
    assert.equal(pool.idleCount, 1);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(pool.totalCount, 0, "poolen har lukket den ledige tilkoblingen");
    assert.equal(work[0].done, true, "først nå får serveren sove");
    await pool.end();
  });

  await check("serveren holdes våken gjennom en hel transaksjon", async () => {
    const { work, keepAlive, settle } = recorder();
    const pool = createPool({ connectionString, max: 2, idleTimeoutMillis: 200 }, keepAlive);
    const client = await pool.connect();
    await client.query("begin");
    await client.query("select 1");
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(work.map((entry) => entry.done), [false], "transaksjonen er åpen");
    await client.query("rollback");
    client.release();
    await settle();
    assert.deepEqual(work.map((entry) => entry.done), [false]);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.deepEqual(work.map((entry) => entry.done), [true]);
    assert.equal(pool.totalCount, 0);
    await pool.end();
  });

  await check("mislykket tilkobling slipper taket i serveren", async () => {
    const { work, keepAlive, settle } = recorder();
    const pool = createPool(
      { connectionString: "postgres://postgres@127.0.0.1:1/finnes_ikke", connectionTimeoutMillis: 500 },
      keepAlive,
    );
    await assert.rejects(pool.query("select 1"), /ECONNREFUSED/);
    await settle();
    assert.equal(work.length, 7, "ett forsøk og seks nye");
    assert.equal(work.every((entry) => entry.done), true);
    await pool.end();
  });

  await check("en tilkobling databasen har brutt, stopper ikke neste lesing", async () => {
    const pool = createPool({ connectionString, max: 1 }, () => {});
    const admin = createPool({ connectionString, max: 1 }, () => {});
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...parts: unknown[]) => void warnings.push(parts.join(" "));
    try {
      for (let round = 0; round < 5; round += 1) {
        const { rows } = await pool.query("select pg_backend_pid() as pid");
        // Avslutter tilkoblingen fra databasens side, slik den gjør når den har gitt opp.
        await admin.query("select pg_terminate_backend($1)", [rows[0].pid]);
        const next = await pool.query("select $1::int as n", [round]);
        assert.equal(next.rows[0].n, round);
      }
    } finally {
      console.warn = original;
    }
    await pool.end();
    await admin.end();
  });

  await check("verdier fra spørringer står ikke i loggen", () => {
    const cause = failure("Authentication timed out", "08P01");
    const error = new Error(
      'Failed query: select "id" from "session" where "session"."token" = $1\nparams: hemmeligNokkel123',
      { cause },
    );
    Object.assign(error, { params: ["hemmeligNokkel123"] });
    const text = describeForLog(error);
    assert.equal(text.includes("hemmeligNokkel123"), false);
    assert.match(text, /Failed query: select "id" from "session"/);
    assert.match(text, /params: \[skjult\]/);
    assert.match(text, /Årsak: Authentication timed out \(08P01\)/);
    assert.equal(describeForLog({ params: ["hemmeligNokkel123"] }), "[objekt utelatt]");
    assert.equal(describeForLog("vanlig melding"), "vanlig melding");
  });

  console.log(`${passed} sjekker bestått.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
