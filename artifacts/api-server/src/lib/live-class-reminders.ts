import { and, asc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { BOOKED_RESERVATION_STATUSES, db, offerings, reservations } from "@workspace/db";
import { sendMemberNotification } from "./notifications";

export const LIVE_CLASS_REMINDER_LEAD_MS = 60 * 60_000;
const DELIVERY_BATCH_SIZE = 25;

export async function processLiveClassReminders(now = new Date()) {
  const reminderWindowEnd = new Date(now.getTime() + LIVE_CLASS_REMINDER_LEAD_MS);
  const bookings = await db.select({
    reservationId: reservations.id,
    userId: reservations.userId,
  }).from(reservations)
    .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .where(and(
      inArray(reservations.status, BOOKED_RESERVATION_STATUSES),
      eq(offerings.scope, "live"),
      eq(offerings.kind, "session"),
      eq(offerings.accessType, "live"),
      eq(offerings.active, true),
      eq(offerings.additionalPayment, false),
      isNull(offerings.cancelledAt),
      gt(offerings.startsAt, now),
      lte(offerings.startsAt, reminderWindowEnd),
    ))
    .orderBy(asc(offerings.startsAt), asc(reservations.id));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (let offset = 0; offset < bookings.length; offset += DELIVERY_BATCH_SIZE) {
    const batch = bookings.slice(offset, offset + DELIVERY_BATCH_SIZE);
    const outcomes = await Promise.all(batch.map(booking => sendMemberNotification(
      booking.userId,
      "live_class_reminder",
      {
        reservationId: booking.reservationId,
        dedupeKey: `live-class-reminder:${booking.reservationId}`,
      },
    )));
    for (const outcome of outcomes) {
      if (outcome.status === "sent") sent++;
      else if (outcome.status === "failed") failed++;
      else skipped++;
    }
  }

  return { candidates: bookings.length, sent, failed, skipped };
}
