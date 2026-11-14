"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { profile, user } from "@/lib/db/schema";
import type { FormState } from "@/lib/errors";
import { PLEDGE_VERSION } from "@/lib/pledge";
import { phoneSchema } from "@/lib/services/cabins";
import { claimInvitations } from "@/lib/services/invitations";
import { getSessionUser } from "@/lib/session";

const input = z.object({
  name: z.string().trim().min(2, "Skriv navnet ditt.").max(80),
  phone: phoneSchema,
  pledge: z.literal("on", "Du må gi Hytteløftet for å bli med."),
});

/** Fullfører registreringen: navn, mobilnummer og Hytteløftet. */
export async function completeOnboarding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/logg-inn");

  const parsed = input.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    pledge: formData.get("pledge") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.update(user).set({ name: parsed.data.name }).where(eq(user.id, sessionUser.id));
  await db
    .insert(profile)
    .values({
      userId: sessionUser.id,
      phone: parsed.data.phone,
      pledgeAcceptedAt: new Date(),
      pledgeVersion: PLEDGE_VERSION,
    })
    .onConflictDoNothing();
  await claimInvitations(sessionUser.id, sessionUser.email);

  redirect("/hytter");
}
