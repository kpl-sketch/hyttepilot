import "server-only";
import { asc, sql } from "drizzle-orm";
import { isAdminEmail } from "../brand";
import { todayInOslo } from "../dates";
import { db } from "../db";
import { profile, user } from "../db/schema";
import { type Actor, UserError } from "../errors";

/*
 * Medlemsliste for administratorene: navn, e-post, når personen ble med, når
 * personen sist logget inn og hvem som inviterte. Listen sier ingenting om hytter, delinger eller
 * forespørsler.
 */

export type Member = {
  name: string;
  email: string;
  joinedAt: Date;
  /** Siste innlogging. Null hvis det ikke er registrert noen. */
  lastLoginAt: Date | null;
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
      lastLoginAt: user.lastLoginAt,
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

/** Tidspunkt i norsk tid, «2026-11-18 21:40», slik regneark kan sortere det. */
function osloDateTime(date: Date): string {
  const time = new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${todayInOslo(date)} ${time.replace(".", ":")}`;
}

/** Ett felt i CSV. Felt som begynner med =, +, - eller @ får en apostrof foran, så regnearket ikke leser dem som formler. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Medlemslisten som CSV med semikolon, slik Excel på norsk venter det. */
export function membersToCsv(members: Member[]): string {
  const header = ["Navn", "E-post", "Ble med", "Sist innlogget", "Invitert av", "Administrator"];
  const lines = members.map((m) =>
    [
      m.name,
      m.email,
      todayInOslo(m.joinedAt),
      m.lastLoginAt ? osloDateTime(m.lastLoginAt) : "",
      m.invitedBy ?? "",
      m.isAdmin ? "Ja" : "Nei",
    ]
      .map(csvField)
      .join(";"),
  );
  // BOM først, slik at Excel leser æ, ø og å riktig.
  return `﻿${[header.map(csvField).join(";"), ...lines].join("\r\n")}\r\n`;
}
