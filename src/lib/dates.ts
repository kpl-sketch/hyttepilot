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
