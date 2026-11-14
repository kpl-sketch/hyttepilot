import "server-only";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { isIsoDate, isRangeFree, todayInOslo } from "../dates";
import { db } from "../db";
import { booking, cabin, profile, user } from "../db/schema";
import { sendEmail } from "../email";
import {
  approvedMail,
  cancelledMail,
  declinedMail,
  newRequestMail,
  paidMail,
} from "../emails";
import { type Actor, UserError } from "../errors";
import { calculatePrice } from "../pricing";
import { getCalendar, getVisibleCabin } from "./cabins";

const requestInput = z.object({
  startDate: z.string().refine(isIsoDate, "Velg ankomstdag i kalenderen."),
  endDate: z.string().refine(isIsoDate, "Velg avreisedag i kalenderen."),
  guests: z.coerce
    .number<string>("Skriv hvor mange dere blir.")
    .int()
    .min(1, "Dere må være minst én."),
  message: z.string().trim().max(1000).default(""),
});

/** Låneren sender en forespørsel om å låne en hytte. */
export async function createBooking(actor: Actor, cabinId: string, data: unknown) {
  const parsed = requestInput.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const input = parsed.data;

  const visible = await getVisibleCabin(actor, cabinId);
  if (!visible) throw new UserError("Fant ikke hytta.");
  const target = visible.cabin;
  if (target.ownerId === actor.id) {
    throw new UserError("Du kan ikke sende forespørsel til din egen hytte.");
  }
  if (input.startDate >= input.endDate) {
    throw new UserError("Avreisedagen må være etter ankomstdagen.");
  }
  if (input.startDate < todayInOslo()) {
    throw new UserError("Ankomstdagen kan ikke ligge bak i tid.");
  }
  if (input.guests > target.beds) {
    throw new UserError(`Hytta har ${target.beds} sengeplasser.`);
  }

  const { available, taken } = await getCalendar(cabinId);
  if (!isRangeFree(input, available, taken)) {
    throw new UserError("Hytta er ikke ledig hele denne perioden. Velg andre datoer.");
  }

  const [duplicate] = await db
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.cabinId, cabinId),
        eq(booking.borrowerId, actor.id),
        inArray(booking.status, ["pending", "approved", "paid"]),
        lt(booking.startDate, input.endDate),
        gt(booking.endDate, input.startDate),
      ),
    )
    .limit(1);
  if (duplicate) {
    throw new UserError("Du har allerede en forespørsel til denne hytta i samme periode.");
  }

  const price = calculatePrice(target, input.startDate, input.endDate);
  const [created] = await db
    .insert(booking)
    .values({
      cabinId,
      borrowerId: actor.id,
      startDate: input.startDate,
      endDate: input.endDate,
      guests: input.guests,
      message: input.message,
      totalPrice: price.total,
    })
    .returning({ id: booking.id });

  const [owner] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, target.ownerId))
    .limit(1);
  if (owner) {
    await sendEmail(
      newRequestMail(owner.email, actor.name, {
        cabinName: target.name,
        startDate: input.startDate,
        endDate: input.endDate,
        totalPrice: price.total,
        guests: input.guests,
        message: input.message,
      }),
    );
  }
  return created.id;
}

/** Henter en forespørsel med hytte, eier og låner. */
async function loadBooking(bookingId: string) {
  if (!z.uuid().safeParse(bookingId).success) return null;
  const owner = alias(user, "owner");
  const borrower = alias(user, "borrower");
  const [row] = await db
    .select({
      booking,
      cabin,
      ownerName: owner.name,
      ownerEmail: owner.email,
      borrowerName: borrower.name,
      borrowerEmail: borrower.email,
    })
    .from(booking)
    .innerJoin(cabin, eq(cabin.id, booking.cabinId))
    .innerJoin(owner, eq(owner.id, cabin.ownerId))
    .innerJoin(borrower, eq(borrower.id, booking.borrowerId))
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row ?? null;
}

function mailInfo(row: NonNullable<Awaited<ReturnType<typeof loadBooking>>>) {
  return {
    cabinName: row.cabin.name,
    startDate: row.booking.startDate,
    endDate: row.booking.endDate,
    totalPrice: row.booking.totalPrice,
  };
}

/** Eieren svarer ja eller nei på en forespørsel. */
export async function decideBooking(
  actor: Actor,
  bookingId: string,
  decision: "approve" | "decline",
  rawReply: unknown,
) {
  const ownerReply = typeof rawReply === "string" ? rawReply.trim().slice(0, 1000) : "";
  const row = await loadBooking(bookingId);
  if (!row || row.cabin.ownerId !== actor.id) {
    throw new UserError("Fant ikke forespørselen.");
  }

  await db.transaction(async (tx) => {
    // Låser hytta mens vi sjekker, slik at to ja på samme tid ikke kan kollidere.
    await tx.execute(sql`select id from ${cabin} where id = ${row.cabin.id} for update`);

    const [current] = await tx
      .select({ status: booking.status })
      .from(booking)
      .where(eq(booking.id, bookingId));
    if (current?.status !== "pending") {
      throw new UserError("Denne forespørselen er allerede besvart.");
    }

    if (decision === "approve") {
      const [clash] = await tx
        .select({ id: booking.id })
        .from(booking)
        .where(
          and(
            eq(booking.cabinId, row.cabin.id),
            ne(booking.id, bookingId),
            inArray(booking.status, ["approved", "paid"]),
            lt(booking.startDate, row.booking.endDate),
            gt(booking.endDate, row.booking.startDate),
          ),
        )
        .limit(1);
      if (clash) {
        throw new UserError("Du har allerede sagt ja til noen andre i denne perioden.");
      }
    }

    await tx
      .update(booking)
      .set({
        status: decision === "approve" ? "approved" : "declined",
        ownerReply,
        decidedAt: new Date(),
      })
      .where(eq(booking.id, bookingId));
  });

  const info = { ...mailInfo(row), ownerReply };
  await sendEmail(
    decision === "approve"
      ? approvedMail(row.borrowerEmail, row.ownerName, {
          ...info,
          vippsNumber: row.cabin.vippsNumber,
        })
      : declinedMail(row.borrowerEmail, row.ownerName, info),
  );
}

/** Eieren bekrefter at betalingen er mottatt. Da er oppholdet reservert. */
export async function markPaid(actor: Actor, bookingId: string) {
  const row = await loadBooking(bookingId);
  if (!row || row.cabin.ownerId !== actor.id) {
    throw new UserError("Fant ikke forespørselen.");
  }
  const updated = await db
    .update(booking)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(booking.id, bookingId), eq(booking.status, "approved")))
    .returning({ id: booking.id });
  if (updated.length === 0) {
    throw new UserError("Bare forespørsler du har sagt ja til, kan markeres som betalt.");
  }
  await sendEmail(paidMail(row.borrowerEmail, row.ownerName, mailInfo(row)));
}

/**
 * Låneren trekker en forespørsel, eller eieren avlyser et lån.
 * Et betalt lån kan bare avlyses av eieren, som da må ordne tilbakebetaling selv.
 */
export async function cancelBooking(actor: Actor, bookingId: string) {
  const row = await loadBooking(bookingId);
  const isOwner = row?.cabin.ownerId === actor.id;
  const isBorrower = row?.booking.borrowerId === actor.id;
  if (!row || (!isOwner && !isBorrower)) {
    throw new UserError("Fant ikke forespørselen.");
  }

  const allowed: ("pending" | "approved" | "paid")[] = isOwner
    ? ["approved", "paid"]
    : ["pending", "approved"];
  const updated = await db
    .update(booking)
    .set({ status: "cancelled" })
    .where(and(eq(booking.id, bookingId), inArray(booking.status, allowed)))
    .returning({ id: booking.id });
  if (updated.length === 0) {
    throw new UserError(
      isBorrower && row.booking.status === "paid"
        ? "Lånet er betalt. Ta kontakt med eieren for å avlyse."
        : "Denne forespørselen kan ikke avlyses.",
    );
  }

  await sendEmail(
    cancelledMail(
      isOwner ? row.borrowerEmail : row.ownerEmail,
      actor.name,
      mailInfo(row),
    ),
  );
}

/** Forespørsler til hyttene brukeren eier. */
export async function listIncoming(actor: Actor) {
  return db
    .select({
      booking,
      cabinName: cabin.name,
      borrowerName: user.name,
      borrowerEmail: user.email,
      borrowerPhone: profile.phone,
    })
    .from(booking)
    .innerJoin(cabin, eq(cabin.id, booking.cabinId))
    .innerJoin(user, eq(user.id, booking.borrowerId))
    .leftJoin(profile, eq(profile.userId, booking.borrowerId))
    .where(eq(cabin.ownerId, actor.id))
    .orderBy(desc(booking.createdAt));
}

/**
 * Forespørsler brukeren selv har sendt. Vipps-nummeret vises når eieren har
 * sagt ja. Adresse og praktiske opplysninger vises når lånet er betalt.
 */
export async function listOutgoing(actor: Actor) {
  const rows = await db
    .select({
      booking,
      cabinName: cabin.name,
      cabinArea: cabin.area,
      vippsNumber: cabin.vippsNumber,
      arrivalInfo: cabin.arrivalInfo,
      ownerName: user.name,
    })
    .from(booking)
    .innerJoin(cabin, eq(cabin.id, booking.cabinId))
    .innerJoin(user, eq(user.id, cabin.ownerId))
    .where(eq(booking.borrowerId, actor.id))
    .orderBy(desc(booking.createdAt));

  return rows.map((row) => ({
    ...row,
    vippsNumber:
      row.booking.status === "approved" || row.booking.status === "paid"
        ? row.vippsNumber
        : null,
    arrivalInfo: row.booking.status === "paid" ? row.arrivalInfo : null,
  }));
}
