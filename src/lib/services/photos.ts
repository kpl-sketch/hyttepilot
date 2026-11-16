import "server-only";
import { and, asc, eq, max, min, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { cabin, cabinPhoto } from "../db/schema";
import { type Actor, UserError } from "../errors";
import { MAX_PHOTOS } from "../photo-limits";
import { photoRows, processPhotos } from "../photo-processing";
import { getOwnCabin, getVisibleCabin } from "./cabins";
import { getPreviewCabinId } from "./invitations";

/** Bildene uten innhold: det sidene trenger for å vise dem. */
export type PhotoInfo = { id: string; width: number; height: number };

/** Eieren legger til bilder på en hytte som finnes fra før. */
export async function addCabinPhotos(actor: Actor, cabinId: string, files: File[]) {
  const own = await getOwnCabin(actor, cabinId);
  if (!own) throw new UserError("Fant ikke hytta.");
  if (files.filter((file) => file.size > 0).length === 0) {
    throw new UserError("Velg minst ett bilde.");
  }

  const [stored] = await db
    .select({ count: sql<number>`count(*)::int`, last: max(cabinPhoto.position) })
    .from(cabinPhoto)
    .where(eq(cabinPhoto.cabinId, cabinId));
  const photos = await processPhotos(files, stored.count);

  await db.transaction(async (tx) => {
    // Låser hytta, slik at to opplastinger samtidig ikke kan gå over grensen.
    await tx.select({ id: cabin.id }).from(cabin).where(eq(cabin.id, cabinId)).for("update");
    const [now] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(cabinPhoto)
      .where(eq(cabinPhoto.cabinId, cabinId));
    if (now.count + photos.length > MAX_PHOTOS) {
      throw new UserError(`En hytte kan ha opptil ${MAX_PHOTOS} bilder.`);
    }
    await tx.insert(cabinPhoto).values(photoRows(cabinId, photos, (stored.last ?? -1) + 1));
  });
  return photos.length;
}

/** Finner bildet og hytta det hører til, men bare hvis brukeren eier hytta. */
async function ownPhoto(actor: Actor, photoId: string) {
  if (!z.uuid().safeParse(photoId).success) return null;
  const [row] = await db
    .select({ id: cabinPhoto.id, cabinId: cabinPhoto.cabinId })
    .from(cabinPhoto)
    .innerJoin(cabin, eq(cabin.id, cabinPhoto.cabinId))
    .where(and(eq(cabinPhoto.id, photoId), eq(cabin.ownerId, actor.id)))
    .limit(1);
  return row ?? null;
}

export async function removeCabinPhoto(actor: Actor, photoId: string) {
  const photo = await ownPhoto(actor, photoId);
  if (!photo) throw new UserError("Fant ikke bildet.");
  await db.delete(cabinPhoto).where(eq(cabinPhoto.id, photo.id));
}

/** Flytter bildet først, slik at det blir forsidebildet. */
export async function makeCoverPhoto(actor: Actor, photoId: string) {
  const photo = await ownPhoto(actor, photoId);
  if (!photo) throw new UserError("Fant ikke bildet.");
  const [first] = await db
    .select({ position: min(cabinPhoto.position) })
    .from(cabinPhoto)
    .where(eq(cabinPhoto.cabinId, photo.cabinId));
  await db
    .update(cabinPhoto)
    .set({ position: (first.position ?? 0) - 1 })
    .where(eq(cabinPhoto.id, photo.id));
}

/**
 * Bildene til en hytte, forsidebildet først. Den som kaller, har allerede
 * sjekket at brukeren får se hytta (getVisibleCabin eller getOwnCabin).
 */
export async function listCabinPhotos(cabinId: string): Promise<PhotoInfo[]> {
  return db
    .select({ id: cabinPhoto.id, width: cabinPhoto.width, height: cabinPhoto.height })
    .from(cabinPhoto)
    .where(eq(cabinPhoto.cabinId, cabinId))
    .orderBy(asc(cabinPhoto.position), asc(cabinPhoto.createdAt));
}

/**
 * Den som ser på bildet: en innlogget bruker, eller den som har åpnet
 * lenken til en hytteinvitasjon uten å være logget inn.
 */
export type PhotoViewer = Actor | { invitationToken: string };

/** Får den som ser på, se hytta bildet hører til? */
async function maySeeCabin(viewer: PhotoViewer, cabinId: string): Promise<boolean> {
  if ("invitationToken" in viewer) {
    return (await getPreviewCabinId(viewer.invitationToken)) === cabinId;
  }
  return Boolean(await getVisibleCabin(viewer, cabinId));
}

/**
 * Selve bildet, eller null hvis den som ser på, ikke får se hytta det hører
 * til. Reglene er de samme som for hytta: eieren og dem eieren har vist hytta
 * til. Lenken til en hytteinvitasjon som gjelder, viser bildene av den hytta.
 */
export async function getPhotoForViewer(
  viewer: PhotoViewer,
  photoId: string,
  size: "full" | "thumb",
): Promise<Buffer | null> {
  if (!z.uuid().safeParse(photoId).success) return null;
  const [photo] = await db
    .select({ cabinId: cabinPhoto.cabinId })
    .from(cabinPhoto)
    .where(eq(cabinPhoto.id, photoId))
    .limit(1);
  if (!photo) return null;
  if (!(await maySeeCabin(viewer, photo.cabinId))) return null;

  const [row] = await db
    .select({ data: size === "thumb" ? cabinPhoto.thumb : cabinPhoto.full })
    .from(cabinPhoto)
    .where(eq(cabinPhoto.id, photoId))
    .limit(1);
  return row?.data ?? null;
}
