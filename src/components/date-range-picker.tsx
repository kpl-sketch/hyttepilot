"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  type DateRange,
  formatDate,
  formatRange,
  isRangeFree,
  monthName,
} from "@/lib/dates";
import { calculatePrice, formatKroner, type PriceInput } from "@/lib/pricing";

const WEEKDAYS = ["ma", "ti", "on", "to", "fr", "lø", "sø"];
const MAX_MONTHS = 12;

type Month = { year: number; month: number; days: (string | null)[] };

/** Bygger månedene som skal vises, med tomme ruter foran den første dagen. */
function buildMonths(from: string, to: string): Month[] {
  const months: Month[] = [];
  let [year, month] = from.split("-").map(Number);
  const [endYear, endMonth] = to.split("-").map(Number);
  while (
    (year < endYear || (year === endYear && month <= endMonth)) &&
    months.length < MAX_MONTHS
  ) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = (first.getUTCDay() + 6) % 7; // mandag først
    const days: (string | null)[] = Array(leading).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(
        `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      );
    }
    months.push({ year, month: month - 1, days });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Kalender der låneren velger ankomst og avreise. Gule ruter er ledige netter.
 * Valget sendes med skjemaet i de skjulte feltene startDate og endDate.
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
  /** Viser bare kalenderen, uten mulighet til å velge. */
  readOnly?: boolean;
}) {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const lastDay = useMemo(
    () => available.reduce((max, p) => (p.endDate > max ? p.endDate : max), today),
    [available, today],
  );
  const months = useMemo(() => buildMonths(today, lastDay), [today, lastDay]);

  const isOpenNight = (day: string) =>
    day >= today && isRangeFree({ startDate: day, endDate: addDays(day, 1) }, available, taken);

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

  if (available.length === 0) {
    return <p className="text-muted">Eieren har ikke lagt inn ledige perioder ennå.</p>;
  }

  const breakdown = price && start && end ? calculatePrice(price, start, end) : null;

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-sm bg-window" aria-hidden /> Ledig
        </li>
        {!readOnly && (
          <li className="flex items-center gap-2">
            <span className="size-4 rounded-sm bg-pine" aria-hidden /> Ditt valg
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-sm border border-line" aria-hidden /> Ikke ledig
        </li>
      </ul>

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {months.map((m) => (
          <div key={`${m.year}-${m.month}`}>
            <h3 className="mb-2 font-semibold first-letter:uppercase">
              {monthName(m.month)} {m.year}
            </h3>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} className="pb-1 text-sm text-muted">
                  {w}
                </span>
              ))}
              {m.days.map((day, i) => {
                if (!day) return <span key={`tom-${i}`} />;
                const open = isOpenNight(day);
                const selected =
                  start !== null && (end ? day >= start && day < end : day === start);
                const isCheckout = end === day;
                const clickable = !readOnly && (open || canEndOn(day));
                const number = Number(day.slice(8));

                let look = "text-muted/50";
                if (open) look = "bg-window text-ink font-semibold";
                if (selected) look = "bg-pine text-white font-semibold";
                if (isCheckout) look += " ring-2 ring-pine ring-inset";
                if (clickable) look += " cursor-pointer hover:ring-2 hover:ring-pine hover:ring-inset";

                if (readOnly) {
                  return (
                    <span
                      key={day}
                      className={`flex aspect-square items-center justify-center rounded-sm ${look}`}
                    >
                      {number}
                    </span>
                  );
                }
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!clickable}
                    onClick={() => choose(day)}
                    aria-pressed={selected || isCheckout}
                    aria-label={`${formatDate(day)}, ${open ? "ledig" : "ikke ledig"}`}
                    className={`flex aspect-square items-center justify-center rounded-sm ${look}`}
                  >
                    {number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-6 border-t border-line pt-4" aria-live="polite">
          <input type="hidden" name="startDate" value={start ?? ""} />
          <input type="hidden" name="endDate" value={end ?? ""} />
          {!start && <p className="text-muted">Trykk på ankomstdagen i kalenderen.</p>}
          {start && !end && (
            <p className="text-muted">
              Ankomst {formatDate(start)}. Trykk på avreisedagen.
            </p>
          )}
          {start && end && breakdown && (
            <div>
              <p className="text-lg font-semibold">
                {formatRange(start, end)}, {breakdown.nights}{" "}
                {breakdown.nights === 1 ? "natt" : "netter"}
              </p>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
