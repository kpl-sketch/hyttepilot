/**
 * Datoer håndteres som tekst på formen «2027-02-19». Da slipper vi feil som
 * oppstår når klokkeslett og tidssoner blandes inn i rene datoer.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const d = toUtc(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Antall netter fra ankomst til avreise. */
export function nightsBetween(start: string, end: string): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / 86_400_000);
}

/** Dagens dato i Norge. */
export function todayInOslo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex];
}

/** «19. februar 2027» */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

/** «19. til 21. februar 2027» eller «28. februar til 3. mars 2027» */
export function formatRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy === ey && sm === em) return `${sd}. til ${ed}. ${MONTHS[em - 1]} ${ey}`;
  if (sy === ey) return `${sd}. ${MONTHS[sm - 1]} til ${ed}. ${MONTHS[em - 1]} ${ey}`;
  return `${formatDate(start)} til ${formatDate(end)}`;
}

export type DateRange = { startDate: string; endDate: string };

/** Sant hvis de to periodene deler minst én natt. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

/**
 * Sant hvis hver natt i ønsket periode ligger i en ledig periode og ingen av
 * nettene er opptatt.
 */
export function isRangeFree(
  wanted: DateRange,
  available: DateRange[],
  taken: DateRange[],
): boolean {
  if (wanted.startDate >= wanted.endDate) return false;
  for (let night = wanted.startDate; night < wanted.endDate; night = addDays(night, 1)) {
    const open = available.some((p) => p.startDate <= night && night < p.endDate);
    const busy = taken.some((p) => p.startDate <= night && night < p.endDate);
    if (!open || busy) return false;
  }
  return true;
}

/**
 * Sammenhengende ledige perioder fra og med i dag: de åpne periodene til
 * eieren, slått sammen der de overlapper eller ligger inntil hverandre, minus
 * nettene som er opptatt. endDate er seneste avreisedag, som ellers.
 */
export function freePeriods(
  available: DateRange[],
  taken: DateRange[],
  today: string,
): DateRange[] {
  const open = available
    .map((p) => ({
      startDate: p.startDate < today ? today : p.startDate,
      endDate: p.endDate,
    }))
    .filter((p) => p.startDate < p.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

  const merged: DateRange[] = [];
  for (const period of open) {
    const last = merged[merged.length - 1];
    if (last && period.startDate <= last.endDate) {
      if (period.endDate > last.endDate) last.endDate = period.endDate;
    } else {
      merged.push({ ...period });
    }
  }

  const busy = [...taken].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const free: DateRange[] = [];
  for (const period of merged) {
    let cursor = period.startDate;
    for (const stay of busy) {
      if (stay.endDate <= cursor || stay.startDate >= period.endDate) continue;
      if (stay.startDate > cursor) free.push({ startDate: cursor, endDate: stay.startDate });
      if (stay.endDate > cursor) cursor = stay.endDate;
    }
    if (cursor < period.endDate) free.push({ startDate: cursor, endDate: period.endDate });
  }
  return free;
}

/** En måned i kalenderen: «2027-02». */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Alle månedene fra og med måneden til `from` til og med måneden til `to`,
 * på formen «2027-02». `max` er bare en sikring mot uendelige lister.
 */
export function monthsBetween(from: string, to: string, max = 120): string[] {
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number);
  const last = monthOf(to);
  while (months.length < max) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) break;
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** Dagene i en måned som datoer, med `null` foran den første så uka starter på mandag. */
export function monthGrid(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const days: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${monthKey}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

const WEEKDAYS_LONG = [
  "søndag",
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
];

/** «fredag 19. februar 2027» */
export function formatDateLong(iso: string): string {
  return `${WEEKDAYS_LONG[toUtc(iso).getUTCDay()]} ${formatDate(iso)}`;
}
