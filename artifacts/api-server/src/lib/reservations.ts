import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, memberships, offerings, reservations, attendance, memberProfiles, partners, waitlistEntries } from "@workspace/db";

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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assertReservationEligible(
  tx: Transaction, userId: string, o: typeof offerings.$inferSelect, now = new Date(),
) {
  if (o.scope === "live") {
    const [partner] = o.partnerId ? await tx.select().from(partners).where(eq(partners.id, o.partnerId)).for("share") : [];
    if (!partner?.approved) throw new BookingError(403, "This partner is not approved for live bookings.");
  }
  if (o.startsAt <= now) throw new BookingError(409, "This class has already started.");
  const [m] = await tx.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.scope, o.scope)));
  const paymentEligible = m && (o.scope === "live"
    ? ((["trial", "corporate"].includes(m.source) && m.paymentStatus === "not_required") ||
       (m.source === "paid" && m.paymentStatus === "paid"))
    : m.paymentStatus === "paid");
  if (!m || !["active", "trial"].includes(m.status) || !paymentEligible ||
      m.startsAt > now || m.endsAt < o.endsAt || m.endsAt <= now) {
    throw new BookingError(403, "You need an active membership that covers this class.");
  }
  const rules = m.rules;
  if (o.scope === "live" && m.source === "trial" && !rules.trialAllowedTypes?.includes(o.accessType))
    throw new BookingError(403, "This activity is not included in your trial.");
  if (o.scope === "live" && m.source === "corporate" && (!rules.corporateId || m.corporateId !== rules.corporateId))
    throw new BookingError(403, "Corporate eligibility is required.");
  if (o.gender !== "all" || o.minAge > 0 || o.maxAge !== null) {
    const [p] = await tx.select().from(memberProfiles).where(eq(memberProfiles.userId, userId));
    if (!p) throw new BookingError(403, "Save your age and gender details in Account before booking this class.");
    const birth = new Date(p.birthDate);
    let age = o.startsAt.getUTCFullYear() - birth.getUTCFullYear();
    if (o.startsAt.getUTCMonth() < birth.getUTCMonth() || (o.startsAt.getUTCMonth() === birth.getUTCMonth() && o.startsAt.getUTCDate() < birth.getUTCDate())) age--;
    if ((o.gender !== "all" && o.gender !== p.gender) || age < o.minAge || (o.maxAge !== null && age > o.maxAge)) {
      throw new BookingError(403, "This class’s age or gender requirement doesn’t match your profile.");
    }
  }
  if (!o.tiers.includes(m.tier) ||
      (rules.cities && !rules.cities.includes(o.city)) ||
      (rules.facilities && !rules.facilities.includes(o.facility)) ||
      (rules.categories && !rules.categories.includes(o.category)) || o.additionalPayment) {
    throw new BookingError(403, "Your membership doesn’t include this activity.");
  }
  const active = await tx.select({ r: reservations, o: offerings }).from(reservations)
    .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .where(and(eq(reservations.userId, userId), inArray(reservations.status, ["reserved", "requested"])));
  if (active.some(({ o: other }) => other.id === o.id || (o.kind === "coach" && other.kind === "coach" && other.targetId === o.targetId))) {
    throw new BookingError(409, "You already have an active booking or request.");
  }
  const used = await tx.select({ o: offerings }).from(attendance).innerJoin(offerings, eq(attendance.offeringId, offerings.id))
    .where(and(eq(attendance.userId, userId), inArray(attendance.status, ["pending", "confirmed", "disputed"])));
  const period = (date: Date) => date >= m.startsAt && date < m.endsAt;
  const held = active.filter(({ o: other }) => other.scope === o.scope && period(other.startsAt));
  const visited = used.filter(({ o: other }) => other.scope === o.scope && period(other.startsAt));
  // Reserve quota without manufacturing attendance; avoid double-counting checked-in reservations.
  const consumed = new Map([...held.map(x => x.o), ...visited.map(x => x.o)].map(x => [x.id, x]));
  const uses = [...consumed.values()];
  if (rules.quotaMode === "separate") {
    const limit = o.accessType === "premium" ? rules.premiumQuota : o.accessType === "live" ? rules.liveQuota : rules.physicalQuota;
    if (uses.filter(x => x.accessType === o.accessType).length >= (limit ?? 0))
      throw new BookingError(403, "Your activity-type allowance is exhausted.");
  } else if (consumed.size >= rules.quota) throw new BookingError(403, "You’ve used all the bookings in your membership.");
  const groupLimit = o.partnerGroup ? rules.partnerGroupLimits?.[o.partnerGroup] : undefined;
  if (groupLimit !== undefined && uses.filter(x => x.partnerGroup === o.partnerGroup).length >= groupLimit)
    throw new BookingError(403, "Your partner-group allowance is exhausted.");
  const facilityLimit = rules.facilityLimits?.[o.facility];
  const categoryLimit = rules.categoryLimits?.[o.category];
  if ((facilityLimit !== undefined && [...consumed.values()].filter(x => x.facility === o.facility).length >= facilityLimit) ||
      (categoryLimit !== undefined && [...consumed.values()].filter(x => x.category === o.category).length >= categoryLimit)) {
    throw new BookingError(403, "You’ve used your allowance for this place or activity.");
  }
  const iraqDay = (date: Date) => new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  const day = iraqDay(o.startsAt);
  if (uses.filter(x => iraqDay(x.startsAt) === day).length >= rules.dailyLimit) {
    throw new BookingError(403, "You’ve reached your daily booking limit.");
  }
  return { active };
}

export async function createReservation(
  userId: string,
  input: { kind: string; targetId: string; slot: string },
  options: { waitlistEntryId?: string } = {},
) {
  return db.transaction(async tx => {
    // Lock the account and offering: quota and capacity checks must be atomic.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [o] = await tx.select().from(offerings).where(and(
      eq(offerings.kind, input.kind), eq(offerings.targetId, input.targetId), eq(offerings.slot, input.slot),
    )).for("update");
    const now = new Date();
    if (!o || !o.active || o.cancelledAt) throw new BookingError(404, "This activity isn’t available.");
    await assertReservationEligible(tx, userId, o, now);
    const places = await tx.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    if (places.length >= o.capacity) throw new BookingError(409, "This class is full.");
    if (!options.waitlistEntryId) {
      const [waiting] = await tx.select({ id: waitlistEntries.id }).from(waitlistEntries)
        .where(and(eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "waiting")))
        .orderBy(asc(waitlistEntries.joinedAt), asc(waitlistEntries.id)).limit(1);
      if (waiting) throw new BookingError(409, "A waiting-list member has priority for this place.");
    }
    if (options.waitlistEntryId) {
      const [head] = await tx.select({ id: waitlistEntries.id }).from(waitlistEntries)
        .where(and(eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "waiting")))
        .orderBy(asc(waitlistEntries.joinedAt), asc(waitlistEntries.id)).limit(1).for("update");
      if (head?.id !== options.waitlistEntryId)
        throw new BookingError(409, "The waiting-list order changed. Please retry the promotion.");
    }
    const [row] = await tx.insert(reservations).values({
      id: randomUUID(), userId, offeringId: o.id, status: o.kind === "coach" ? "requested" : "reserved",
    }).returning();
    if (options.waitlistEntryId) {
      const [entry] = await tx.update(waitlistEntries).set({
        status: "promoted", reservationId: row.id, reason: null, updatedAt: now,
      }).where(and(
        eq(waitlistEntries.id, options.waitlistEntryId), eq(waitlistEntries.userId, userId),
        eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "waiting"),
      )).returning({ id: waitlistEntries.id });
      if (!entry) throw new BookingError(409, "This waiting-list place is no longer available.");
    } else {
      await tx.update(waitlistEntries).set({ status: "booked", reservationId: row.id, updatedAt: now })
        .where(and(eq(waitlistEntries.userId, userId), eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "waiting")));
    }
    return row;
  });
}

export async function cancelReservation(userId: string, id: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [r] = await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.userId, userId))).for("update");
    if (!r) throw new BookingError(404, "Booking not found.");
    if (r.status === "cancelled") return false;
    if (!["reserved", "requested"].includes(r.status)) throw new BookingError(409, "This booking can’t be canceled.");
    if ((await tx.select().from(attendance).where(eq(attendance.reservationId, id))).length)
      throw new BookingError(409, "Attendance already exists. Request an attendance review.");
    const [o] = await tx.select().from(offerings).where(eq(offerings.id, r.offeringId));
    if (new Date() >= o.cancellationDeadline) throw new BookingError(409, "The cancellation deadline has passed. Contact support.");
    await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(reservations.id, r.id));
    return true;
  });
}
