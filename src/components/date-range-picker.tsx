"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  type DateRange,
  formatDate,
  formatDateLong,
  formatRange,
  freePeriods,
  isIsoDate,
  isRangeFree,
  monthGrid,
  monthName,
  monthOf,
  monthsBetween,
} from "@/lib/dates";
import { calculatePrice, formatKroner, type PriceInput } from "@/lib/pricing";
import { inputClass } from "./ui";

const WEEKDAYS: [short: string, long: string][] = [
  ["ma", "mandag"],
  ["ti", "tirsdag"],
  ["on", "onsdag"],
  ["to", "torsdag"],
  ["fr", "fredag"],
  ["lø", "lørdag"],
  ["sø", "søndag"],
];

/** Så mange måneder vises om gangen. Resten nås med knappene over kalenderen. */
const SHOWN = 2;

function monthTitle(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${monthName(month - 1)} ${year}`;
}

/** «november og desember 2026», eller «desember 2026 og januar 2027». */
function rangeTitle(shown: string[]): string {
  const first = shown[0];
  const last = shown[shown.length - 1];
  if (first === last) return monthTitle(first);
  if (first.slice(0, 4) !== last.slice(0, 4)) return `${monthTitle(first)} og ${monthTitle(last)}`;
  return `${monthName(Number(first.slice(5)) - 1)} og ${monthTitle(last)}`;
}

/** Deler dagene i en måned i uker, slik at kalenderen kan settes opp som en tabell. */
function weeksOf(monthKey: string): (string | null)[][] {
  const days = monthGrid(monthKey);
  while (days.length % 7 !== 0) days.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/**
 * Kalender der låneren velger ankomst og avreise.
 *
 * Ledighet vises på tre måter, slik at ingen er avhengig av fargene:
 *  - som tekst i listen «Ledige perioder» over kalenderen
 *  - som tekst på hver dato for skjermlesere («fredag 19. februar 2027, ledig»)
 *  - som form i kalenderen: ledige datoer har fylt bakgrunn og fet skrift,
 *    datoer som ikke er ledige, er gjennomstreket
 *
 * Datoene kan også skrives rett inn i feltene Ankomst og Avreise, som virker
 * med tastatur, skjermleser og mobilens egen datovelger. Kalenderen viser to
 * måneder om gangen og kan blas helt til siste dato eieren har åpnet.
 */
export function DateRangePicker({
  today,
  available,
  taken,
  price,
  readOnly = false,
}: {
  today: string;
  available: DateRange[];
  taken: DateRange[];
  price?: PriceInput;
  /** Eierens visning: viser kalenderen uten mulighet til å velge. */
  readOnly?: boolean;
}) {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const lastDay = useMemo(
    () => available.reduce((max, p) => (p.endDate > max ? p.endDate : max), today),
    [available, today],
  );
  const months = useMemo(() => monthsBetween(today, lastDay), [today, lastDay]);
  const free = useMemo(() => freePeriods(available, taken, today), [available, taken, today]);
  const lastStart = Math.max(0, months.length - SHOWN);

  const indexOfMonth = (day: string) =>
    Math.min(lastStart, Math.max(0, months.indexOf(monthOf(day))));
  // Kalenderen åpner på den første ledige perioden, ikke nødvendigvis i dag.
  const [first, setFirst] = useState(() => (free[0] ? indexOfMonth(free[0].startDate) : 0));

  const isOpenNight = (day: string) =>
    day >= today && isRangeFree({ startDate: day, endDate: addDays(day, 1) }, available, taken);
  const isBooked = (day: string) =>
    taken.some((stay) => stay.startDate <= day && day < stay.endDate);

  const canEndOn = (day: string) =>
    start !== null &&
    end === null &&
    day > start &&
    isRangeFree({ startDate: start, endDate: day }, available, taken);

  function choose(day: string) {
    if (start !== null && end === null && canEndOn(day)) {
      setEnd(day);
    } else if (isOpenNight(day)) {
      setStart(day);
      setEnd(null);
    }
  }

  /** Datoen er skrevet inn i et av feltene i stedet for valgt i kalenderen. */
  function typed(which: "start" | "end", value: string) {
    const day = isIsoDate(value) ? value : null;
    if (which === "start") {
      setStart(day);
      if (day && end !== null && end <= day) setEnd(null);
    } else {
      setEnd(day);
    }
    if (day && months.includes(monthOf(day))) setFirst(indexOfMonth(day));
  }

  if (available.length === 0) {
    return (
      <p className="text-muted">
        {readOnly
          ? "Du har ikke åpnet noen datoer ennå."
          : "Eieren har ikke åpnet noen datoer ennå."}
      </p>
    );
  }

  const chosenIsFree =
    start !== null &&
    end !== null &&
    start >= today &&
    isRangeFree({ startDate: start, endDate: end }, available, taken);
  const breakdown = price && start && end && chosenIsFree ? calculatePrice(price, start, end) : null;
  const shown = months.slice(first, first + SHOWN);

  /** Det skjermleseren får lest opp for en dato. */
  function statusOf(day: string): string {
    if (isOpenNight(day)) return "ledig";
    if (readOnly) return isBooked(day) ? "reservert" : "ikke åpnet";
    if (canEndOn(day)) return "kan velges som avreisedag";
    return "ikke ledig";
  }

  return (
    <div>
      <div className="mb-5">
        <h3 className="font-semibold">Ledige perioder</h3>
        {free.length === 0 ? (
          <p className="mt-1 text-muted">Alle datoene som er åpnet, er opptatt akkurat nå.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {free.map((period) => (
              <li key={period.startDate}>
                <button
                  type="button"
                  onClick={() => setFirst(indexOfMonth(period.startDate))}
                  className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-left underline-offset-2 hover:underline"
                >
                  {formatRange(period.startDate, period.endDate)}
                  <span className="sr-only">. Vis i kalenderen.</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">
          Siste dato i hver periode er seneste avreisedag. Kalenderen går til{" "}
          {formatDate(lastDay)}.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="basis-full font-semibold sm:basis-auto" aria-live="polite">
          Viser {rangeTitle(shown)}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setFirst(Math.max(0, first - SHOWN))}
            disabled={first === 0}
            className="cursor-pointer rounded-md border border-pine px-3 py-2 font-semibold text-pine disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
          >
            <span aria-hidden>← </span>Tidligere
          </button>
          <button
            type="button"
            onClick={() => setFirst(Math.min(lastStart, first + SHOWN))}
            disabled={first >= lastStart}
            className="cursor-pointer rounded-md border border-pine px-3 py-2 font-semibold text-pine disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
          >
            Senere<span aria-hidden> →</span>
          </button>
        </div>
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-hidden>
        <li className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-sm bg-window font-bold">7</span>{" "}
          Ledig
        </li>
        {readOnly ? (
          <li className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-sm border-2 border-pine font-bold">
              7
            </span>{" "}
            Reservert
          </li>
        ) : (
          <li className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-sm bg-pine font-bold text-white">
              7
            </span>{" "}
            Ditt valg
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className="grid size-6 place-items-center text-muted line-through">7</span>{" "}
          {readOnly ? "Ikke åpnet" : "Ikke ledig"}
        </li>
      </ul>

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {shown.map((monthKey) => (
          <table key={monthKey} className="w-full table-fixed border-separate border-spacing-1">
            <caption className="mb-2 text-left font-semibold first-letter:uppercase">
              {monthTitle(monthKey)}
            </caption>
            <thead>
              <tr>
                {WEEKDAYS.map(([short, long]) => (
                  <th
                    key={short}
                    scope="col"
                    abbr={long}
                    className="pb-1 text-sm font-normal text-muted"
                  >
                    {short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeksOf(monthKey).map((week, row) => (
                <tr key={row}>
                  {week.map((day, column) => {
                    if (!day) return <td key={`tom-${column}`} />;
                    const open = isOpenNight(day);
                    const selected =
                      start !== null && (end ? day >= start && day < end : day === start);
                    const isCheckout = end === day;
                    const clickable = !readOnly && (open || canEndOn(day));
                    const number = Number(day.slice(8));

                    let look = "text-muted line-through";
                    if (readOnly && isBooked(day)) look = "border-2 border-pine font-bold text-ink";
                    if (open) look = "bg-window font-bold text-ink";
                    if (selected) look = "bg-pine font-bold text-white";
                    if (isCheckout) look = "font-bold text-ink ring-2 ring-pine ring-inset";
                    if (clickable) {
                      look += " cursor-pointer hover:ring-2 hover:ring-pine hover:ring-inset";
                    }
                    const box = `flex aspect-square w-full items-center justify-center rounded-sm ${look}`;

                    if (readOnly) {
                      return (
                        <td key={day} className="p-0">
                          <span className={box}>
                            <span aria-hidden>{number}</span>
                            <span className="sr-only">
                              {formatDateLong(day)}, {statusOf(day)}
                            </span>
                          </span>
                        </td>
                      );
                    }
                    const role = isCheckout
                      ? ", valgt som avreisedag"
                      : selected
                        ? day === start
                          ? ", valgt som ankomstdag"
                          : ", med i oppholdet"
                        : "";
                    return (
                      <td key={day} className="p-0">
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => choose(day)}
                          aria-pressed={selected || isCheckout}
                          aria-label={`${formatDateLong(day)}, ${statusOf(day)}${role}`}
                          className={box}
                        >
                          {number}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-muted">
            Trykk på ankomstdagen og avreisedagen i kalenderen, eller skriv datoene her.
          </p>
          <div className="mt-3 grid max-w-md grid-cols-2 gap-4">
            <label className="block">
              <span className="block font-medium">Ankomst</span>
              <input
                type="date"
                name="startDate"
                required
                min={today}
                max={addDays(lastDay, -1)}
                value={start ?? ""}
                onChange={(event) => typed("start", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block font-medium">Avreise</span>
              <input
                type="date"
                name="endDate"
                required
                min={start ? addDays(start, 1) : addDays(today, 1)}
                max={lastDay}
                value={end ?? ""}
                onChange={(event) => typed("end", event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4" aria-live="polite">
            {start && !end && (
              <p className="text-muted">Ankomst {formatDate(start)}. Velg avreisedag.</p>
            )}
            {start && end && !chosenIsFree && (
              <p className="font-medium text-barn">
                Hytta er ikke ledig hele perioden {formatRange(start, end)}. Se listen over ledige
                perioder, og velg andre datoer.
              </p>
            )}
            {start && end && chosenIsFree && (
              <div>
                <p className="text-lg font-semibold">
                  {formatRange(start, end)}
                  {breakdown &&
                    `, ${breakdown.nights} ${breakdown.nights === 1 ? "natt" : "netter"}`}
                </p>
                {breakdown && (
                  <dl className="mt-2 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1">
                    <dt>Selvkost</dt>
                    <dd className="text-right tabular-nums">{formatKroner(breakdown.cost)}</dd>
                    {breakdown.markup > 0 && (
                      <>
                        <dt>Påslag {price?.markupPercent} %</dt>
                        <dd className="text-right tabular-nums">
                          {formatKroner(breakdown.markup)}
                        </dd>
                      </>
                    )}
                    {breakdown.cleaning > 0 && (
                      <>
                        <dt>Vask</dt>
                        <dd className="text-right tabular-nums">
                          {formatKroner(breakdown.cleaning)}
                        </dd>
                      </>
                    )}
                    <div className="col-span-2 border-t border-line" aria-hidden />
                    <dt className="font-semibold">Til sammen</dt>
                    <dd className="text-right font-semibold tabular-nums">
                      {formatKroner(breakdown.total)}
                    </dd>
                  </dl>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
