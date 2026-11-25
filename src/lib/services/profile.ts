import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { profile } from "../db/schema";
import { type Actor, UserError } from "../errors";
import { phoneSchema } from "./cabins";

/*
 * Brukerens egne opplysninger etter velkomstsiden. Bare brukeren selv endrer
 * dem: `actor` kommer fra innloggingen, og ingen funksjon her tar imot hvem
 * det gjelder.
 */

/**
 * Bytter mobilnummeret til brukeren selv, med samme regel som på
 * velkomstsiden (`phoneSchema`). Gir tilbake nummeret slik det er lagret.
 *
 * Nummeret leses fra profilen hver gang en eier ser en forespørsel, så eieren
 * ser det nye nummeret også i forespørsler som er sendt fra før. Vipps-nummeret
 * for en hytte er et eget felt på hytta og endres ikke her.
 */
export async function updateOwnPhone(actor: Actor, input: unknown): Promise<string> {
  const parsed = phoneSchema.safeParse(typeof input === "string" ? input : "");
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  await db.update(profile).set({ phone: parsed.data }).where(eq(profile.userId, actor.id));
  return parsed.data;
}
