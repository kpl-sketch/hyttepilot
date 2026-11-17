import "server-only";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { addDays, type DateRange, freePeriods, nightsBetween, todayInOslo } from "../dates";
import { upcomingHoliday } from "../holidays";
import { db } from "../db";
import { availability, booking, cabin, user } from "../db/schema";
import { sendEmail } from "../email";
import { idleCabinMail } from "../emails";
import { type Actor, UserError } from "../errors";

/*
 * Påminnelse når hytta står ledig i en ferie.
 *
 * Eieren får e-post noen uker før en av de store feriene (se holidays.ts) når
 * hytta er åpen for lån i ferien, men ingen har spurt. Folk planlegger turer
 * da, så da er en påminnelse til nytte. E-posten peker til siden der eieren
 * inviterer flere. Den sier ingenting om andre enn eieren og hennes egen hytte.
 *
 * Reglene:
 * - Ferien må begynne om LAST_DAYS til LEAD_DAYS dager.
 * - Hytta må ha minst MIN_NIGHTS ledige netter i et sammenhengende tidsrom i
 *   ferien, og ingen forespørsel eller opphold i ferien.
 * - Hytta må ha ligget inne i minst GRACE_DAYS dager, så nye eiere får ro.
 * - Høyst én påminnelse per hytte per ferie, og aldri to med mindre enn
 *   GAP_DAYS dager imellom. Det blir høyst fem i året.
 * - Eieren kan slå påminnelsene av på siden for hytta.
 */
export const LEAD_DAYS = 28;
export const LAST_DAYS = 7;
export const MIN_NIGHTS = 2;
export const GRACE_DAYS = 7;
export const GAP_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Den første ledige perioden på minst MIN_NIGHTS netter innenfor `within`. */
export function firstIdlePeriod(
  available: DateRange[],
  taken: DateRange[],
  today: string,
  within: DateRange,
): DateRange | null {
  for (const period of freePeriods(available, taken, today)) {
    if (period.startDate >= within.endDate) break;
    const clipped = {
      startDate: period.startDate < within.startDate ? within.startDate : period.startDate,
      endDate: period.endDate > within.endDate ? within.endDate : period.endDate,
    };
    if (nightsBetween(clipped.startDate, clipped.endDate) >= MIN_NIGHTS) return clipped;
  }
  return null;
}

export type ReminderRun = { checked: number; sent: number; failed: number };

/**
 * Finner hyttene som står ledig i den neste ferien og sender eieren én
 * påminnelse. Kjøres daglig, men sender bare når en ferie nærmer seg. Trygg å
 * kjøre flere ganger: hver hytte reserveres i databasen før e-posten sendes,
 * så den samme påminnelsen går aldri ut to ganger, heller ikke ved to samtidige
 * kjøringer.
 */
export async function sendIdleReminders(now: Date = new Date()): Promise<ReminderRun> {
  const today = todayInOslo(now);
  const holiday = upcomingHoliday(today, LEAD_DAYS, LAST_DAYS);
  if (!holiday) return { checked: 0, sent: 0, failed: 0 };

  // Sendt før vinduet for denne ferien åpnet, gjelder en tidligere ferie.
  const windowOpened = new Date(`${addDays(holiday.startDate, -LEAD_DAYS)}T00:00:00Z`);
  const lastGap = new Date(now.getTime() - GAP_DAYS * DAY_MS);
  const before = windowOpened < lastGap ? windowOpened : lastGap;
  const settled = new Date(now.getTime() - GRACE_DAYS * DAY_MS);

  const candidates = await db
    .select({
      id: cabin.id,
      name: cabin.name,
      ownerEmail: user.email,
      ownerName: user.name,
    })
    .from(cabin)
    .innerJoin(user, eq(user.id, cabin.ownerId))
    .where(
      and(
        eq(cabin.remindWhenIdle, true),
        lt(cabin.createdAt, settled),
        or(isNull(cabin.idleReminderSentAt), lt(cabin.idleReminderSentAt, before)),
      ),
    );
  if (candidates.length === 0) return { checked: 0, sent: 0, failed: 0 };

  const ids = candidates.map((c) => c.id);
  const [open, interest] = await Promise.all([
    db
      .select({
        cabinId: availability.cabinId,
        startDate: availability.startDate,
        endDate: availability.endDate,
      })
      .from(availability)
      .where(
        and(
          inArray(availability.cabinId, ids),
          gt(availability.endDate, holiday.startDate),
          lt(availability.startDate, holiday.endDate),
        ),
      ),
    // Alt som ikke er avslått eller avlyst, teller: også en forespørsel som
    // venter, viser at noen har spurt.
    db
      .select({
        cabinId: booking.cabinId,
        startDate: booking.startDate,
        endDate: booking.endDate,
      })
      .from(booking)
      .where(
        and(
          inArray(booking.cabinId, ids),
          inArray(booking.status, ["pending", "approved", "paid"]),
          gt(booking.endDate, holiday.startDate),
          lt(booking.startDate, holiday.endDate),
        ),
      ),
  ]);

  let sent = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (interest.some((b) => b.cabinId === candidate.id)) continue;
    const period = firstIdlePeriod(
      open.filter((p) => p.cabinId === candidate.id),
      [],
      today,
      holiday,
    );
    if (!period) continue;

    // Reserver påminnelsen før e-posten sendes. Har en annen kjøring kommet
    // først, gir oppdateringen ingen rad, og vi hopper over.
    const claimed = await db
      .update(cabin)
      .set({ idleReminderSentAt: now })
      .where(
        and(
          eq(cabin.id, candidate.id),
          or(isNull(cabin.idleReminderSentAt), lt(cabin.idleReminderSentAt, before)),
        ),
      )
      .returning({ id: cabin.id });
    if (claimed.length === 0) continue;

    const accepted = await sendEmail(
      idleCabinMail(candidate.ownerEmail, candidate.ownerName, {
        cabinId: candidate.id,
        cabinName: candidate.name,
        holidayName: holiday.name,
        ...period,
      }),
    );
    if (accepted) {
      sent += 1;
    } else {
      // Kom ikke e-posten av gårde, prøver vi igjen ved neste kjøring.
      failed += 1;
      await db
        .update(cabin)
        .set({ idleReminderSentAt: sql`null` })
        .where(and(eq(cabin.id, candidate.id), eq(cabin.idleReminderSentAt, now)));
    }
  }
  return { checked: candidates.length, sent, failed };
}

/** Eieren slår påminnelsene om ledig hytte av eller på. */
export async function setIdleReminders(actor: Actor, cabinId: string, on: boolean) {
  if (!z.uuid().safeParse(cabinId).success) throw new UserError("Fant ikke hytta.");
  const updated = await db
    .update(cabin)
    .set({ remindWhenIdle: on })
    .where(and(eq(cabin.id, cabinId), eq(cabin.ownerId, actor.id)))
    .returning({ id: cabin.id });
  if (updated.length === 0) throw new UserError("Fant ikke hytta.");
}
