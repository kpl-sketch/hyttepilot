import { addDays, type DateRange } from "./dates";

/*
 * De store feriene, da folk planlegger turer.
 *
 * Påminnelsen om ledig hytte sendes bare før disse. Datoene gjelder netter:
 * startDate er første natt, endDate er avreisedagen, som ellers i tjenesten.
 *
 * Bare Norge er lagt inn. Vinter- og høstferien følger Oslo og Akershus (uke 8
 * og 40). Andre fylker og land kan få egne lister senere. Tjenesten vet ennå
 * ikke hvilket land eieren bor i, så alle eiere får de norske feriene.
 */

export type Holiday = DateRange & { name: string };

export type Country = "NO";

/** Mandagen i ISO-uke `week` i år `year`. */
function mondayOfWeek(year: number, week: number): string {
  // 4. januar ligger alltid i uke 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekday = (jan4.getUTCDay() + 6) % 7; // mandag = 0
  const monday1 = addDays(jan4.toISOString().slice(0, 10), -weekday);
  return addDays(monday1, (week - 1) * 7);
}

/** Første påskedag (gregoriansk kalender). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** En ferieuke: fra lørdagen før til mandagen etter. */
function schoolWeek(year: number, week: number): DateRange {
  const monday = mondayOfWeek(year, week);
  return { startDate: addDays(monday, -2), endDate: addDays(monday, 7) };
}

/** Feriene som begynner i året `year`. */
export function holidaysInYear(year: number, country: Country = "NO"): Holiday[] {
  if (country !== "NO") return [];
  const easter = easterSunday(year);
  return [
    { name: "vinterferien", ...schoolWeek(year, 8) },
    // Fra lørdagen før palmesøndag til dagen etter andre påskedag.
    { name: "påsken", startDate: addDays(easter, -8), endDate: addDays(easter, 2) },
    { name: "sommerferien", startDate: `${year}-06-20`, endDate: `${year}-08-17` },
    { name: "høstferien", ...schoolWeek(year, 40) },
    { name: "julen", startDate: `${year}-12-21`, endDate: `${year + 1}-01-02` },
  ];
}

/** Ferien som begynner om høyst `leadDays` dager, men ikke før om `lastDays` dager. */
export function upcomingHoliday(
  today: string,
  leadDays: number,
  lastDays: number,
  country: Country = "NO",
): Holiday | null {
  const year = Number(today.slice(0, 4));
  const from = addDays(today, lastDays);
  const to = addDays(today, leadDays);
  for (const holiday of [...holidaysInYear(year, country), ...holidaysInYear(year + 1, country)]) {
    if (holiday.startDate >= from && holiday.startDate <= to) return holiday;
  }
  return null;
}
