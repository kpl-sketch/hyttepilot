import "server-only";
import { asc, sql } from "drizzle-orm";
import { isAdminEmail } from "../brand";
import { todayInOslo } from "../dates";
import { db } from "../db";
import { profile, user } from "../db/schema";
import { type Actor, UserError } from "../errors";

/*
 * Medlemsliste for administratorene: navn, e-post, når personen ble med og
 * hvem som inviterte. Listen sier ingenting om hytter, delinger eller
 * forespørsler.
 */

export type Member = {
  name: string;
  email: string;
  joinedAt: Date;
  invitedBy: string | null;
  isAdmin: boolean;
};

export async function listMembers(actor: Actor): Promise<Member[]> {
  if (!actor.isAdmin) throw new UserError("Bare administratorer har tilgang.");
  const rows = await db
    .select({
      name: user.name,
      email: user.email,
      joinedAt: profile.createdAt,
      // Den som sendte den første invitasjonen personen tok i bruk.
      invitedBy: sql<string | null>`(
        select inviter.name from invitation i
        join "user" inviter on inviter.id = i.invited_by
        where lower(i.email) = lower(${user.email}) and i.accepted_at is not null
        order by i.accepted_at limit 1
      )`,
    })
    .from(profile)
    .innerJoin(user, sql`${user.id} = ${profile.userId}`)
    .orderBy(asc(profile.createdAt));
  return rows.map((row) => ({ ...row, isAdmin: isAdminEmail(row.email) }));
}

/** Ett felt i CSV. Felt som begynner med =, +, - eller @ får en apostrof foran, så regnearket ikke leser dem som formler. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Medlemslisten som CSV med semikolon, slik Excel på norsk venter det. */
export function membersToCsv(members: Member[]): string {
  const header = ["Navn", "E-post", "Ble med", "Invitert av", "Administrator"];
  const lines = members.map((m) =>
    [
      m.name,
      m.email,
      todayInOslo(m.joinedAt),
      m.invitedBy ?? "",
      m.isAdmin ? "Ja" : "Nei",
    ]
      .map(csvField)
      .join(";"),
  );
  // BOM først, slik at Excel leser æ, ø og å riktig.
  return `﻿${[header.map(csvField).join(";"), ...lines].join("\r\n")}\r\n`;
}
