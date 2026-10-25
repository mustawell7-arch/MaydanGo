import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, memberships, offerings, reservations, attendance, memberProfiles } from "@workspace/db";

export class BookingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function memberState(userId: string) {
  const [membershipRows, rows, profiles] = await Promise.all([
    db.select().from(memberships).where(eq(memberships.userId, userId)),
    db.select({ reservation: reservations, offering: offerings }).from(reservations)
      .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
      .where(eq(reservations.userId, userId)),
    db.select({ gender: memberProfiles.gender, birthDate: memberProfiles.birthDate }).from(memberProfiles).where(eq(memberProfiles.userId, userId)),
  ]);
  return { profile: profiles[0] ?? null, memberships: membershipRows, bookings: rows.map(({ reservation: r, offering: o }) => ({
    id: r.id, kind: o.kind, targetId: o.targetId, slot: o.slot, title: o.title,
    scope: o.scope, startsAt: o.startsAt, status: r.status,
    createdAt: r.createdAt, cancelledAt: r.cancelledAt,
  })) };
}

export async function createReservation(userId: string, input: { kind: string; targetId: string; slot: string }) {
  return db.transaction(async tx => {
    // Lock the account and offering: quota and capacity checks must be atomic.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [o] = await tx.select().from(offerings).where(and(
      eq(offerings.kind, input.kind), eq(offerings.targetId, input.targetId), eq(offerings.slot, input.slot),
    )).for("update");
    const now = new Date();
    if (!o || !o.active) throw new BookingError(404, "This offering is not available.");
    if (o.startsAt <= now) throw new BookingError(409, "This session has already started.");
    const [m] = await tx.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.scope, o.scope)));
    if (!m || !["active", "trial"].includes(m.status) || m.paymentStatus !== "paid" ||
        m.startsAt > now || m.endsAt < o.endsAt || m.endsAt <= now) {
      throw new BookingError(403, "An active eligible membership is required for this date.");
    }
    const rules = m.rules;
    if (o.gender !== "all" || o.minAge > 0 || o.maxAge !== null) {
      const [p] = await tx.select().from(memberProfiles).where(eq(memberProfiles.userId, userId));
      if (!p) throw new BookingError(403, "Save your eligibility details in Account before booking this session.");
      const birth = new Date(p.birthDate);
      let age = o.startsAt.getUTCFullYear() - birth.getUTCFullYear();
      if (o.startsAt.getUTCMonth() < birth.getUTCMonth() || (o.startsAt.getUTCMonth() === birth.getUTCMonth() && o.startsAt.getUTCDate() < birth.getUTCDate())) age--;
      if ((o.gender !== "all" && o.gender !== p.gender) || age < o.minAge || (o.maxAge !== null && age > o.maxAge)) {
        throw new BookingError(403, "This session's age or gender eligibility does not match your profile.");
      }
    }
    if (!o.tiers.includes(m.tier) ||
        (rules.cities && !rules.cities.includes(o.city)) ||
        (rules.facilities && !rules.facilities.includes(o.facility)) ||
        (rules.categories && !rules.categories.includes(o.category)) || o.additionalPayment) {
      throw new BookingError(403, "This membership does not include this offering.");
    }
    const active = await tx.select({ r: reservations, o: offerings }).from(reservations)
      .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
      .where(and(eq(reservations.userId, userId), inArray(reservations.status, ["reserved", "requested"])));
    if (active.some(({ o: other }) => other.id === o.id || (o.kind === "coach" && other.kind === "coach" && other.targetId === o.targetId))) {
      throw new BookingError(409, "You already have an active reservation or request.");
    }
    const used = await tx.select({ o: offerings }).from(attendance).innerJoin(offerings, eq(attendance.offeringId, offerings.id))
      .where(eq(attendance.userId, userId));
    const period = (date: Date) => date >= m.startsAt && date < m.endsAt;
    const held = active.filter(({ o: other }) => other.scope === o.scope && period(other.startsAt));
    const visited = used.filter(({ o: other }) => other.scope === o.scope && period(other.startsAt));
    // Reserve quota without manufacturing attendance; avoid double-counting checked-in reservations.
    const consumed = new Map([...held.map(x => x.o), ...visited.map(x => x.o)].map(x => [x.id, x]));
    if (consumed.size >= rules.quota) throw new BookingError(403, "Your membership reservation allowance is exhausted.");
    const facilityLimit = rules.facilityLimits?.[o.facility];
    const categoryLimit = rules.categoryLimits?.[o.category];
    if ((facilityLimit !== undefined && [...consumed.values()].filter(x => x.facility === o.facility).length >= facilityLimit) ||
        (categoryLimit !== undefined && [...consumed.values()].filter(x => x.category === o.category).length >= categoryLimit)) {
      throw new BookingError(403, "Your facility or activity allowance is exhausted.");
    }
    const day = o.startsAt.toISOString().slice(0, 10);
    if ([...consumed.values()].filter(x => x.startsAt.toISOString().slice(0, 10) === day).length >= rules.dailyLimit) {
      throw new BookingError(403, "Your daily booking limit has been reached.");
    }
    const places = await tx.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    if (places.length >= o.capacity) throw new BookingError(409, "This session is full.");
    const [row] = await tx.insert(reservations).values({
      id: randomUUID(), userId, offeringId: o.id, status: o.kind === "coach" ? "requested" : "reserved",
    }).returning();
    return row;
  });
}

export async function cancelReservation(userId: string, id: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [r] = await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.userId, userId))).for("update");
    if (!r) throw new BookingError(404, "Reservation not found.");
    if (r.status === "cancelled") return;
    if (!["reserved", "requested"].includes(r.status)) throw new BookingError(409, "This reservation cannot be cancelled.");
    const [o] = await tx.select().from(offerings).where(eq(offerings.id, r.offeringId));
    if (new Date() >= o.cancellationDeadline) throw new BookingError(409, "The cancellation deadline has passed. Contact support.");
    await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(reservations.id, r.id));
  });
}
