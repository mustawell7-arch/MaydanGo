import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, partners, operators, offerings, reservations, attendance, attendanceEvents } from "@workspace/db";
import { review } from "./checkin";
import { memberState } from "./reservations";

after(async () => { await pool.end(); });

test("accepted and rejected booking requests keep attendance separate", async () => {
  const prefix = `booking-status-${randomUUID()}`;
  const partnerId = `${prefix}-partner`;
  const adminId = `${prefix}-admin`;
  const acceptedMemberId = `${prefix}-accepted-member`;
  const rejectedMemberId = `${prefix}-rejected-member`;
  const acceptedOfferingId = `${prefix}-accepted-offering`;
  const rejectedOfferingId = `${prefix}-rejected-offering`;
  const acceptedReservationId = `${prefix}-accepted-reservation`;
  const rejectedReservationId = `${prefix}-rejected-reservation`;

  await db.insert(partners).values({
    id: partnerId, name: prefix, groupId: prefix, ownerUserId: adminId, approved: true,
  });
  await db.insert(operators).values({ userId: adminId, role: "partner_operations_admin" });
  const startsAt = new Date(Date.now() + 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  await db.insert(offerings).values([
    {
      id: acceptedOfferingId, targetId: acceptedOfferingId, kind: "coach", title: "Coaching",
      scope: "live", partnerId, active: true, city: "baghdad", facility: prefix,
      category: "fitness", tiers: [], capacity: 2, startsAt, endsAt,
      cancellationDeadline: new Date(startsAt.getTime() - 30 * 60_000),
    },
    {
      id: rejectedOfferingId, targetId: rejectedOfferingId, kind: "coach", title: "Coaching",
      scope: "live", partnerId, active: true, city: "baghdad", facility: prefix,
      category: "fitness", tiers: [], capacity: 2, startsAt, endsAt,
      cancellationDeadline: new Date(startsAt.getTime() - 30 * 60_000),
    },
  ]);
  await db.insert(reservations).values([
    { id: acceptedReservationId, userId: acceptedMemberId, offeringId: acceptedOfferingId, status: "requested" },
    { id: rejectedReservationId, userId: rejectedMemberId, offeringId: rejectedOfferingId, status: "requested" },
  ]);

  try {
    await review(adminId, acceptedReservationId, {
      action: "accept_request", reason: "The requested session is available",
    });
    const [accepted] = await db.select().from(reservations).where(eq(reservations.id, acceptedReservationId));
    assert.equal(accepted.status, "confirmed");
    assert.equal(accepted.cancelledAt, null);
    assert.equal((await db.select().from(attendance).where(eq(attendance.reservationId, acceptedReservationId))).length, 0);
    await assert.rejects(
      () => db.insert(reservations).values({
        id: `${prefix}-duplicate`, userId: acceptedMemberId, offeringId: acceptedOfferingId, status: "requested",
      }),
      error => {
        const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
        return !!cause && typeof cause === "object" && "constraint" in cause
          && cause.constraint === "one_active_reservation_including_confirmed";
      },
    );

    const accountBooking = (await memberState(acceptedMemberId)).bookings
      .find(booking => booking.id === acceptedReservationId);
    assert.equal(accountBooking?.status, "confirmed");
    assert.equal(accountBooking?.attendanceStatus, "not_checked_in");
    assert.equal(accountBooking?.checkedInAt, null);
    assert.equal(accountBooking?.settlementEligible, false);

    await review(adminId, rejectedReservationId, {
      action: "reject_request", reason: "The requested session is unavailable",
    });
    const [rejected] = await db.select().from(reservations).where(eq(reservations.id, rejectedReservationId));
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.cancelledAt, null);
    const [rejectionEvent] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.reservationId, rejectedReservationId));
    assert.equal(rejectionEvent.before, "requested");
    assert.equal(rejectionEvent.after, "rejected");
  } finally {
    await db.delete(attendanceEvents).where(eq(attendanceEvents.reservationId, acceptedReservationId));
    await db.delete(attendanceEvents).where(eq(attendanceEvents.reservationId, rejectedReservationId));
    await db.delete(reservations).where(eq(reservations.id, acceptedReservationId));
    await db.delete(reservations).where(eq(reservations.id, rejectedReservationId));
    await db.delete(offerings).where(eq(offerings.id, acceptedOfferingId));
    await db.delete(offerings).where(eq(offerings.id, rejectedOfferingId));
    await db.delete(operators).where(eq(operators.userId, adminId));
    await db.delete(partners).where(eq(partners.id, partnerId));
  }
});
