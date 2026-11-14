import "server-only";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { loginThrottle } from "../db/schema";

const WINDOW_MINUTES = 15;

/**
 * Teller et forsøk og svarer om grensen er nådd. Brukes for å bremse både
 * utsending av koder og gjetting av koder.
 */
export async function isThrottled(key: string, max: number): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [{ attempts }] = await db
    .select({ attempts: count() })
    .from(loginThrottle)
    .where(and(eq(loginThrottle.key, key), gt(loginThrottle.createdAt, since)));
  if (attempts >= max) return true;
  await db.insert(loginThrottle).values({ key });
  return false;
}

/** Rydder bort gamle tellinger. Kalles i bakgrunnen etter innlogging. */
export async function pruneThrottle() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  await db.delete(loginThrottle).where(lt(loginThrottle.createdAt, dayAgo));
}
