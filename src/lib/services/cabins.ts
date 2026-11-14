import "server-only";
import { and, asc, eq, getTableColumns, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isIsoDate, todayInOslo } from "../dates";
import { db } from "../db";
import { availability, booking, cabin, cabinAccess, cabinPhoto, user } from "../db/schema";
import { type Actor, UserError } from "../errors";
import { photoRows, processPhotos } from "../photo-processing";

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
  arrivalInfo: z.string().trim().max(2000).default(""),
});

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
 * Feltene andre enn eieren får se. Vipps-nummer, adresse og praktiske
 * opplysninger er holdt utenfor og hentes bare der de skal vises.
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

/** Hyttene brukeren får se. Hytteeiere ser alle. Venner ser bare det de er invitert til. */
export async function listVisibleCabins(actor: Actor) {
  const base = db
    .select({ cabin: publicCabin, ownerName: user.name })
    .from(cabin)
    .innerJoin(user, eq(user.id, cabin.ownerId));

  if (actor.isOwner) return base.orderBy(asc(cabin.area), asc(cabin.name));

  const granted = await db
    .select({ cabinId: cabinAccess.cabinId })
    .from(cabinAccess)
    .where(eq(cabinAccess.userId, actor.id));
  if (granted.length === 0) return [];
  return base
    .where(
      inArray(
        cabin.id,
        granted.map((g) => g.cabinId),
      ),
    )
    .orderBy(asc(cabin.area), asc(cabin.name));
}

/** Én hytte, eller null hvis brukeren ikke har lov til å se den. */
export async function getVisibleCabin(actor: Actor, cabinId: string) {
  if (!z.uuid().safeParse(cabinId).success) return null;
  const [row] = await db
    .select({ cabin: publicCabin, ownerName: user.name })
    .from(cabin)
    .innerJoin(user, eq(user.id, cabin.ownerId))
    .where(eq(cabin.id, cabinId))
    .limit(1);
  if (!row) return null;
  if (actor.isOwner || row.cabin.ownerId === actor.id) return row;

  const [granted] = await db
    .select({ cabinId: cabinAccess.cabinId })
    .from(cabinAccess)
    .where(and(eq(cabinAccess.cabinId, cabinId), eq(cabinAccess.userId, actor.id)))
    .limit(1);
  return granted ? row : null;
}

export async function listOwnCabins(actor: Actor) {
  return db
    .select({ ...getTableColumns(cabin), coverPhotoId })
    .from(cabin)
    .where(eq(cabin.ownerId, actor.id))
    .orderBy(asc(cabin.name));
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
 */
export async function createCabin(actor: Actor, data: unknown, photoFiles: File[] = []) {
  if (!actor.isOwner) {
    throw new UserError("Bare inviterte hytteeiere kan legge inn hytter.");
  }
  const input = parse(cabinInput, data);
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
  const input = parse(cabinInput, data);
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

/** Ledige perioder og opptatte netter fra i dag og framover. */
export async function getCalendar(cabinId: string) {
  const today = todayInOslo();
  const [available, taken] = await Promise.all([
    db
      .select({
        id: availability.id,
        startDate: availability.startDate,
        endDate: availability.endDate,
      })
      .from(availability)
      .where(and(eq(availability.cabinId, cabinId), gt(availability.endDate, today)))
      .orderBy(asc(availability.startDate)),
    db
      .select({ startDate: booking.startDate, endDate: booking.endDate })
      .from(booking)
      .where(
        and(
          eq(booking.cabinId, cabinId),
          inArray(booking.status, ["approved", "paid"]),
          gt(booking.endDate, today),
        ),
      ),
  ]);
  return { today, available, taken };
}
