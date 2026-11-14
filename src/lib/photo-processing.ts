import "server-only";
import { UserError } from "./errors";
import { MAX_PHOTOS, MAX_UPLOAD_BYTES } from "./photo-limits";

const FULL_SIDE = 1600;
const THUMB_SIDE = 640;
const ACCEPTED_FORMATS = ["jpeg", "png", "webp"];

export type ProcessedPhoto = {
  width: number;
  height: number;
  full: Buffer;
  thumb: Buffer;
};

/**
 * Gjør en opplastet fil om til de to bildene vi lagrer. Bildet kodes på nytt,
 * så opptaksdata som GPS-posisjon og kameramodell blir ikke med videre.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UserError(`Bildet «${file.name}» er for stort. Prøv å laste det opp på nytt.`);
  }
  const unreadable = new UserError(
    `Vi klarte ikke å lese «${file.name}». Bruk et bilde i JPG, PNG eller WebP.`,
  );
  // Bildebiblioteket lastes først når et bilde skal behandles. Da stopper ikke
  // resten av tjenesten hvis biblioteket skulle mangle der tjenesten kjører.
  const { default: sharp } = await import("sharp");
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 30_000_000 });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED_FORMATS.includes(format)) throw unreadable;

    // rotate() uten argument snur bildet slik kameraet mente det skulle stå.
    const upright = image.rotate();
    const full = await upright
      .clone()
      .resize({ width: FULL_SIDE, height: FULL_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await upright
      .clone()
      .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();

    return { width: full.info.width, height: full.info.height, full: full.data, thumb };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw unreadable;
  }
}

/** Behandler bildene fra et skjema og stopper hvis hytta får for mange. */
export async function processPhotos(
  files: File[],
  alreadyStored = 0,
): Promise<ProcessedPhoto[]> {
  const chosen = files.filter((file) => file.size > 0);
  if (alreadyStored + chosen.length > MAX_PHOTOS) {
    throw new UserError(`En hytte kan ha opptil ${MAX_PHOTOS} bilder.`);
  }
  const processed: ProcessedPhoto[] = [];
  for (const file of chosen) processed.push(await processPhoto(file));
  return processed;
}

/** Radene som settes inn for en hytte, i den rekkefølgen bildene ble valgt. */
export function photoRows(cabinId: string, photos: ProcessedPhoto[], firstPosition = 0) {
  return photos.map((photo, index) => ({
    cabinId,
    position: firstPosition + index,
    ...photo,
  }));
}
