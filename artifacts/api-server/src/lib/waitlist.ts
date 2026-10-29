import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db, offerings, reservations, waitlistEntries } from "@workspace/db";
import { assertReservationEligible, BookingError, cancelReservation, createReservation } from "./reservations";
import { sendMemberNotification } from "./notifications";

export async function joinWaitlist(userId: string, offeringId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [offering] = await tx.select().from(offerings).where(eq(offerings.id, offeringId)).for("update");
    const now = new Date();
    if (!offering || offering.scope !== "live" || !offering.active || offering.cancelledAt ||
        offering.startsAt <= now || offering.kind === "coach") {
      throw new BookingError(404, "This activity is not accepting waiting-list requests.");
    }

    const activeBookings = await tx.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.userId, userId), eq(reservations.offeringId, offering.id),
        inArray(reservations.status, ["reserved", "requested"])));
    if (activeBookings.length) throw new BookingError(409, "You already have a place in this class.");

    const [existing] = await tx.select().from(waitlistEntries)
      .where(and(eq(waitlistEntries.userId, userId), eq(waitlistEntries.offeringId, offering.id),
        eq(waitlistEntries.status, "waiting"))).limit(1);
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(reservations)
      .where(and(eq(reservations.offeringId, offering.id), inArray(reservations.status, ["reserved", "requested"])));
    if ((count?.value ?? 0) < offering.capacity) {
      throw new BookingError(409, "A place is available now. Reserve it from the class listing.");
    }
    if (!existing) {
      await assertReservationEligible(tx, userId, offering, now);
      await tx.insert(waitlistEntries).values({
        id: randomUUID(), userId, offeringId: offering.id, status: "waiting", joinedAt: now, updatedAt: now,
      });
    }
    const [entry] = await tx.select().from(waitlistEntries)
      .where(and(eq(waitlistEntries.userId, userId), eq(waitlistEntries.offeringId, offering.id),
        eq(waitlistEntries.status, "waiting"))).limit(1);
    if (!entry) throw new BookingError(409, "This waiting-list place is no longer available.");
    const queue = await tx.select({ id: waitlistEntries.id }).from(waitlistEntries)
      .where(and(eq(waitlistEntries.offeringId, offering.id), eq(waitlistEntries.status, "waiting")))
      .orderBy(asc(waitlistEntries.joinedAt), asc(waitlistEntries.id));
    return {
      id: entry.id, offeringId: entry.offeringId,
      title: offering.title, localizedTitle: offering.localizedTitle, kind: offering.kind,
      city: offering.city, facility: offering.facility, startsAt: offering.startsAt,
      position: queue.findIndex(item => item.id === entry.id) + 1,
      status: "waiting" as const, joinedAt: entry.joinedAt,
    };
  });
}

export async function memberWaitlist(userId: string) {
  const recentPromotion = new Date(Date.now() - 30 * 86400000);
  const rows = await db.select({ entry: waitlistEntries, offering: offerings })
    .from(waitlistEntries).innerJoin(offerings, eq(waitlistEntries.offeringId, offerings.id))
    .where(and(
      eq(waitlistEntries.userId, userId),
      or(eq(waitlistEntries.status, "waiting"),
        and(inArray(waitlistEntries.status, ["promoted", "cancelled"]), sql`${waitlistEntries.updatedAt} >= ${recentPromotion}`)),
    ))
    .orderBy(asc(waitlistEntries.joinedAt), asc(waitlistEntries.id));
  const offeringIds = [...new Set(rows.map(({ entry }) => entry.offeringId))];
  const activeQueue = offeringIds.length
    ? await db.select({ id: waitlistEntries.id, offeringId: waitlistEntries.offeringId })
      .from(waitlistEntries).where(and(eq(waitlistEntries.status, "waiting"), inArray(waitlistEntries.offeringId, offeringIds)))
      .orderBy(asc(waitlistEntries.joinedAt), asc(waitlistEntries.id))
    : [];
  const positions = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const item of activeQueue) {
    const position = (counts.get(item.offeringId) ?? 0) + 1;
    counts.set(item.offeringId, position);
    positions.set(item.id, position);
  }
  return rows.map(({ entry, offering }) => ({
    id: entry.id, offeringId: entry.offeringId, title: offering.title, localizedTitle: offering.localizedTitle, kind: offering.kind,
    city: offering.city, facility: offering.facility, startsAt: offering.startsAt,
    status: entry.status, position: entry.status === "waiting" ? positions.get(entry.id) ?? null : null,
    joinedAt: entry.joinedAt,
  }));
}

export async function leaveWaitlist(userId: string, entryId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [entry] = await tx.select().from(waitlistEntries).where(and(
      eq(waitlistEntries.id, entryId), eq(waitlistEntries.userId, userId), eq(waitlistEntries.status, "waiting"),
    )).for("update");
    if (!entry) throw new BookingError(404, "Waiting-list place not found.");
    await tx.update(waitlistEntries).set({ status: "left", updatedAt: new Date() })
      .where(eq(waitlistEntries.id, entryId));
    return { left: true };
  });
}

export async function promoteWaitlistForOffering(offeringId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [next] = await db.select({ entry: waitlistEntries, offering: offerings })
      .from(waitlistEntries).innerJoin(offerings, eq(waitlistEntries.offeringId, offerings.id))
      .where(and(eq(waitlistEntries.offeringId, offeringId), eq(waitlistEntries.status, "waiting")))
      .orderBy(asc(waitlistEntries.joinedAt), asc(waitlistEntries.id)).limit(1);
    if (!next) return null;
    try {
      await createReservation(next.entry.userId, {
        kind: next.offering.kind, targetId: next.offering.targetId, slot: next.offering.slot,
      }, { waitlistEntryId: next.entry.id });
      void sendMemberNotification(next.entry.userId, "waitlist_promoted");
      return next.entry.userId;
    } catch (error) {
      if (error instanceof BookingError && error.status === 409 && error.message === "This class is full.") return null;
      if (error instanceof BookingError && error.status === 409 && error.message.includes("order changed")) continue;
      if (error instanceof BookingError && [400, 403, 404, 409].includes(error.status)) {
        await db.update(waitlistEntries).set({
          status: "skipped", reason: error.message.slice(0, 300), updatedAt: new Date(),
        }).where(and(eq(waitlistEntries.id, next.entry.id), eq(waitlistEntries.status, "waiting")));
        continue;
      }
      throw error;
    }
  }
  return null;
}

export async function cancelReservationAndPromote(userId: string, reservationId: string) {
  const [booking] = await db.select({ offeringId: reservations.offeringId }).from(reservations)
    .where(and(eq(reservations.id, reservationId), eq(reservations.userId, userId))).limit(1);
  const cancelled = await cancelReservation(userId, reservationId);
  if (!cancelled || !booking) return { cancelled, promotedUserId: null };
  const promotedUserId = await promoteWaitlistForOffering(booking.offeringId);
  return { cancelled, promotedUserId };
}
