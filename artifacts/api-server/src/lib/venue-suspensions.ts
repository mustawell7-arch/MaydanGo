import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import {
  attendance,
  attendanceEvents,
  db,
  offerings,
  reservations,
  waitlistEntries,
} from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type UpcomingVenueTarget = {
  partnerId: string;
  city?: string;
  facility?: string;
};

export type VenueCancellationResult = {
  cancelledOfferingCount: number;
  cancelledBookingCount: number;
  closedWaitlistCount: number;
  affectedMemberIds: string[];
  affectedWaitlistMemberIds: string[];
};

export async function cancelUpcomingVenueSessions(
  tx: Transaction,
  target: UpcomingVenueTarget,
  actorId: string,
  now = new Date(),
): Promise<VenueCancellationResult> {
  const targetCondition = target.city && target.facility
    ? and(
      eq(offerings.partnerId, target.partnerId),
      eq(offerings.city, target.city),
      eq(offerings.facility, target.facility),
    )
    : eq(offerings.partnerId, target.partnerId);
  const rows = await tx.select().from(offerings).where(and(
    eq(offerings.scope, "live"),
    eq(offerings.active, true),
    isNull(offerings.cancelledAt),
    gt(offerings.startsAt, now),
    targetCondition,
  )).orderBy(offerings.startsAt, offerings.id).for("update");

  const affectedMemberIds = new Set<string>();
  const affectedWaitlistMemberIds = new Set<string>();
  let cancelledBookingCount = 0;
  let closedWaitlistCount = 0;

  for (const offering of rows) {
    const heldReservations = await tx.select({
      id: reservations.id,
      userId: reservations.userId,
    }).from(reservations).where(and(
      eq(reservations.offeringId, offering.id),
      inArray(reservations.status, ["reserved", "requested"]),
    )).for("update");
    cancelledBookingCount += heldReservations.length;
    heldReservations.forEach(row => affectedMemberIds.add(row.userId));

    const waitlist = await tx.select({
      id: waitlistEntries.id,
      userId: waitlistEntries.userId,
    }).from(waitlistEntries).where(and(
      eq(waitlistEntries.offeringId, offering.id),
      inArray(waitlistEntries.status, ["waiting", "offered"]),
    )).for("update");
    closedWaitlistCount += waitlist.length;
    waitlist.forEach(row => affectedWaitlistMemberIds.add(row.userId));

    const arrivals = await tx.select({
      id: attendance.id,
      reservationId: attendance.reservationId,
      status: attendance.status,
    }).from(attendance).where(and(
      eq(attendance.offeringId, offering.id),
      inArray(attendance.status, ["pending", "confirmed", "disputed"]),
    )).for("update");
    for (const arrival of arrivals) {
      await tx.update(attendance).set({
        status: "void",
        settlementEligible: false,
      }).where(eq(attendance.id, arrival.id));
      if (arrival.reservationId) {
        await tx.insert(attendanceEvents).values({
          id: randomUUID(),
          reservationId: arrival.reservationId,
          actorId,
          action: "venue_suspension_cancelled",
          before: arrival.status,
          after: "void",
          reason: "Upcoming venue session cancelled; the membership visit allowance was restored.",
        });
      }
    }

    await tx.update(offerings).set({
      active: false,
      cancelledAt: now,
      approvalStatus: "archived",
      activityStatus: "archived",
    }).where(eq(offerings.id, offering.id));
    await tx.update(reservations).set({
      status: "admin_cancelled",
      cancelledAt: now,
    }).where(and(
      eq(reservations.offeringId, offering.id),
      inArray(reservations.status, ["reserved", "requested"]),
    ));
    await tx.update(waitlistEntries).set({
      status: "closed",
      respondedAt: now,
    }).where(and(
      eq(waitlistEntries.offeringId, offering.id),
      inArray(waitlistEntries.status, ["waiting", "offered"]),
    ));
  }

  return {
    cancelledOfferingCount: rows.length,
    cancelledBookingCount,
    closedWaitlistCount,
    affectedMemberIds: [...affectedMemberIds],
    affectedWaitlistMemberIds: [...affectedWaitlistMemberIds],
  };
}
