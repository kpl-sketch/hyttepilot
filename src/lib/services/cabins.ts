import "server-only";
import { and, asc, eq, getTableColumns, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { type DateRange, freePeriods, isIsoDate, todayInOslo } from "../dates";
import { db } from "../db";
import { availability, booking, cabin, cabinAccess, cabinPhoto, user } from "../db/schema";
import { type Actor, UserError } from "../errors";
import { photoRows, processPhotos } from "../photo-processing";
import { approximatePosition, isShortMapLink, parsePosition } from "../position";
import { expandPositionField } from "./map-links";

const whole = (label: string, min: number, max: number) =>
  z.coerce
    .number<string>(`${label} må være et tall.`)
    .int(`${label} må være et helt tall.`)
    .min(min, `${label} må være minst ${min}.`)
    .max(max, `${label} kan ikke være mer enn ${max}.`);

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+47)?\d{8}$/, "Skriv et norsk mobilnummer med åtte sifre."));

/**
 * Kartposisjonen slik eieren skrev den: koordinater eller en lenke fra en
 * karttjeneste. Tomt felt betyr at hytta ikke har noen posisjon.
 */
const position = z
  .string()
  .trim()
  .max(1000, "Kartposisjonen er for lang.")
  .default("")
  .transform((value, context) => {
    if (value === "") return { latitude: null, longitude: null };
    const found = parsePosition(value);
    if (found) return found;
    if (isShortMapLink(value)) {
      context.addIssue({
        code: "custom",
        message:
          "Vi fikk ikke lest posisjonen fra lenken. Åpne den i Google Maps, trykk lenge på hytta i kartet og kopier tallene som kommer opp.",
      });
      return z.NEVER;
    }
    context.addIssue({
      code: "custom",
      message:
        "Fant ingen kartposisjon i det du skrev. Skriv to tall, for eksempel 61.2345, 10.4567.",
    });
    return z.NEVER;
  });

export const cabinInput = z.object({
  name: z.string().trim().min(2, "Gi hytta et navn.").max(80),
  area: z.string().trim().min(2, "Skriv hvor hytta ligger.").max(80),
  description: z.string().trim().max(2000).default(""),
  beds: whole("Sengeplasser", 1, 40),
  costPerNight: whole("Selvkost per døgn", 0, 20000),
  markupPercent: whole("Påslag", 0, 100),
  cleaningFee: whole("Vask", 0, 20000),
  rules: z.string().trim().max(2000).default(""),
  minAge: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(18, "Aldersgrensen må være minst 18.").max(99).nullable()),
  vippsNumber: phone,
  address: z.string().trim().max(200, "Adressen er for lang.").default(""),
  position,
  arrivalInfo: z.string().trim().max(2000).default(""),
});

/**
 * Feltene slik de lagres: posisjonen er delt i breddegrad og lengdegrad. En
 * kort delingslenke fra Google Maps følges først, slik at den blir til koordinater.
 */
async function cabinValues(data: unknown) {
  const raw =
    data && typeof data === "object"
      ? { ...data, position: await expandPositionField((data as { position?: unknown }).position) }
      : data;
  const { position: place, ...fields } = parse(cabinInput, raw);
  return { ...fields, latitude: place.latitude, longitude: place.longitude };
}

export { phone as phoneSchema };

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new UserError(result.error.issues[0].message);
  return result.data;
}

/**
 * Forsidebildet til hytta: bildet som står først. Null hvis hytta ikke har bilder.
 * Tabellnavnene er skrevet rett ut, fordi Drizzle ellers fjerner dem i
 * spørringer mot én tabell, og da peker `id` på feil tabell.
 */
const coverPhotoId = sql<string | null>`(
  select p.id from cabin_photo p
  where p.cabin_id = "cabin"."id"
  order by p.position, p.created_at
  limit 1
)`;

/**
 * Feltene andre enn eieren får se. Vipps-nummer, adresse, kartposisjon og
 * praktiske opplysninger er holdt utenfor og hentes bare der de skal vises.
 */
const publicCabin = {
  id: cabin.id,
  ownerId: cabin.ownerId,
  name: cabin.name,
  area: cabin.area,
  description: cabin.description,
  beds: cabin.beds,
  costPerNight: cabin.costPerNight,
  markupPercent: cabin.markupPercent,
  cleaningFee: cabin.cleaningFee,
  rules: cabin.rules,
  minAge: cabin.minAge,
  coverPhotoId,
};

/**
 * Hyttene andre har delt med brukeren, med de ledige periodene framover.
 * Egne hytter er ikke med: de hentes med listOwnCabins.
 *
 * En rad i cabin_access er den eneste veien til innsyn i en annens hytte.
 * Det gjelder også for hytteeiere og administratorer.
 */
export async function listSharedCabins(actor: Actor) {
  const rows = await db
    .select({ cabin: publicCabin, ownerName: user.name, sharedAt: cabinAccess.createdAt })
    .from(cabinAccess)
    .innerJoin(cabin, eq(cabin.id, cabinAccess.cabinId))
    .innerJoin(user, eq(user.id, cabin.ownerId))
    .where(and(eq(cabinAccess.userId, actor.id), ne(cabin.ownerId, actor.id)))
    .orderBy(asc(cabin.area), asc(cabin.name));
  const calendars = await getCalendars(rows.map((row) => row.cabin.id));
  return rows.map((row) => ({ ...row, free: freeNow(calendars.get(row.cabin.id)) }));
}

/**
 * Én hytte, eller null hvis brukeren ikke har lov til å se den: enten eier
 * brukeren hytta, eller så har eieren delt den med brukeren. Alle sider,
 * bilder og forespørsler går gjennom denne sjekken.
 */
export async function getVisibleCabin(actor: Actor, cabinId: string) {
  if (!z.uuid().safeParse(cabinId).success) return null;
  const [found] = await db
    .select({
      cabin: publicCabin,
      ownerName: user.name,
      latitude: cabin.latitude,
      longitude: cabin.longitude,
    })
    .from(cabin)
    .innerJoin(user, eq(user.id, cabin.ownerId))
    .where(eq(cabin.id, cabinId))
    .limit(1);
  if (!found) return null;
  // Den nøyaktige posisjonen forlater aldri denne funksjonen. Ut går bare et
  // grovt punkt for området, som alle som ser hytta, kan få se.
  const { latitude, longitude, ...rest } = found;
  const row = { ...rest, areaPosition: approximatePosition({ latitude, longitude }) };
  if (row.cabin.ownerId === actor.id) return row;

  const [granted] = await db
    .select({ cabinId: cabinAccess.cabinId })
    .from(cabinAccess)
    .where(and(eq(cabinAccess.cabinId, cabinId), eq(cabinAccess.userId, actor.id)))
    .limit(1);
  return granted ? row : null;
}

/** Så mange har eieren delt hytta med. */
const sharedWithCount = sql<number>`(
  select count(*)::int from cabin_access a where a.cabin_id = "cabin"."id"
)`;

/** Invitasjoner til hytta som er sendt, men ikke tatt i bruk ennå. */
const pendingInvitationCount = sql<number>`(
  select count(*)::int from invitation i
  where i.cabin_id = "cabin"."id"
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
)`;

/**
 * Brukerens egne hytter, med det som trengs for å si om hytta faktisk er
 * delt: hvor mange som ser den, og hvilke perioder som er ledige.
 */
export async function listOwnCabins(actor: Actor) {
  const rows = await db
    .select({
      ...getTableColumns(cabin),
      coverPhotoId,
      sharedWith: sharedWithCount,
      pendingInvitations: pendingInvitationCount,
    })
    .from(cabin)
    .where(eq(cabin.ownerId, actor.id))
    .orderBy(asc(cabin.name));
  const calendars = await getCalendars(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, free: freeNow(calendars.get(row.id)) }));
}

export async function getOwnCabin(actor: Actor, cabinId: string) {
  if (!z.uuid().safeParse(cabinId).success) return null;
  const [row] = await db
    .select()
    .from(cabin)
    .where(and(eq(cabin.id, cabinId), eq(cabin.ownerId, actor.id)))
    .limit(1);
  return row ?? null;
}

/**
 * Legger inn en hytte, med bilder hvis eieren valgte noen. Bildene behandles
 * før noe lagres, så et bilde som ikke kan leses, stopper hele innleggingen.
 *
 * Alle medlemmer kan legge inn hytte. En ny hytte er privat: ingen andre ser
 * den før eieren deler den (se services/invitations.ts).
 */
export async function createCabin(actor: Actor, data: unknown, photoFiles: File[] = []) {
  const input = await cabinValues(data);
  const photos = await processPhotos(photoFiles);
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(cabin)
      .values({ ...input, ownerId: actor.id })
      .returning({ id: cabin.id });
    if (photos.length > 0) {
      await tx.insert(cabinPhoto).values(photoRows(created.id, photos));
    }
    return created.id;
  });
}

export async function updateCabin(actor: Actor, cabinId: string, data: unknown) {
  const own = await getOwnCabin(actor, cabinId);
  if (!own) throw new UserError("Fant ikke hytta.");
  const input = await cabinValues(data);
  await db.update(cabin).set(input).where(eq(cabin.id, cabinId));
}

/* ------------------------------ Ledige perioder ----------------------------- */

export async function addAvailability(
  actor: Actor,
  cabinId: string,
  startDate: unknown,
  endDate: unknown,
) {
  const own = await getOwnCabin(actor, cabinId);
  if (!own) throw new UserError("Fant ikke hytta.");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new UserError("Velg både første og siste dato.");
  }
  if (startDate >= endDate) {
    throw new UserError("Siste dato må være etter første dato.");
  }
  if (endDate <= todayInOslo()) {
    throw new UserError("Perioden må ligge fram i tid.");
  }
  await db.insert(availability).values({ cabinId, startDate, endDate });
}

export async function removeAvailability(actor: Actor, availabilityId: string) {
  const [row] = await db
    .select({ id: availability.id, ownerId: cabin.ownerId })
    .from(availability)
    .innerJoin(cabin, eq(cabin.id, availability.cabinId))
    .where(eq(availability.id, availabilityId))
    .limit(1);
  if (!row || row.ownerId !== actor.id) throw new UserError("Fant ikke perioden.");
  await db.delete(availability).where(eq(availability.id, availabilityId));
}

export type Calendar = {
  today: string;
  available: (DateRange & { id: string })[];
  taken: DateRange[];
};

/**
 * Ledige perioder og opptatte netter fra i dag og framover, for flere hytter
 * på én gang. Den som kaller, har allerede sjekket at brukeren får se hyttene.
 * En natt er opptatt fra eieren har sagt ja (status approved eller paid).
 */
export async function getCalendars(cabinIds: string[]): Promise<Map<string, Calendar>> {
  const today = todayInOslo();
  const calendars = new Map<string, Calendar>(
    cabinIds.map((id) => [id, { today, available: [], taken: [] }]),
  );
  if (cabinIds.length === 0) return calendars;

  const [available, taken] = await Promise.all([
    db
      .select({
        id: availability.id,
        cabinId: availability.cabinId,
        startDate: availability.startDate,
        endDate: availability.endDate,
      })
      .from(availability)
      .where(and(inArray(availability.cabinId, cabinIds), gt(availability.endDate, today)))
      .orderBy(asc(availability.startDate)),
    db
      .select({
        cabinId: booking.cabinId,
        startDate: booking.startDate,
        endDate: booking.endDate,
      })
      .from(booking)
      .where(
        and(
          inArray(booking.cabinId, cabinIds),
          inArray(booking.status, ["approved", "paid"]),
          gt(booking.endDate, today),
        ),
      ),
  ]);
  for (const { cabinId, ...period } of available) calendars.get(cabinId)?.available.push(period);
  for (const { cabinId, ...stay } of taken) calendars.get(cabinId)?.taken.push(stay);
  return calendars;
}

/** Ledige perioder og opptatte netter for én hytte. */
export async function getCalendar(cabinId: string): Promise<Calendar> {
  const calendars = await getCalendars([cabinId]);
  return calendars.get(cabinId) ?? { today: todayInOslo(), available: [], taken: [] };
}

/** Periodene som faktisk kan forespørres nå: åpnet av eieren og ikke opptatt. */
function freeNow(calendar: Calendar | undefined): DateRange[] {
  if (!calendar) return [];
  return freePeriods(calendar.available, calendar.taken, calendar.today);
}
