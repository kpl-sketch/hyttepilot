import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { isAdminEmail } from "./brand";
import { db } from "./db";
import { profile } from "./db/schema";
import type { Actor } from "./errors";

export type Viewer = Actor & { phone: string };

/** Den innloggede brukeren fra innloggingen, eller null. Leses én gang per forespørsel. */
export const getSessionUser = cache(async () => {
  const current = await auth.api.getSession({ headers: await headers() });
  return current?.user ?? null;
});

/** Brukeren med profil, eller null hvis velkomstsiden ikke er fullført. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  const [row] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, sessionUser.id))
    .limit(1);
  if (!row) return null;
  const isAdmin = isAdminEmail(sessionUser.email);
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.name,
    phone: row.phone,
    isAdmin,
    isOwner: isAdmin || row.isOwner,
  };
});

/**
 * Brukes øverst på alle sider og i alle handlinger som krever innlogging.
 * Sender brukeren til innlogging eller velkomstsiden hvis noe mangler.
 */
export async function requireViewer(): Promise<Viewer> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/logg-inn");
  const viewer = await getViewer();
  if (!viewer) redirect("/velkommen");
  return viewer;
}
