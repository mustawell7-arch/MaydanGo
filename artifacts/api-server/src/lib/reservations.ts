import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, memberships, offerings, reservations, attendance, memberProfiles, partners, waitlistEntries, memberUpdates } from "@workspace/db";
import { sendMemberNotification } from "./notifications";

export class BookingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type BookingTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function membershipCanAccess(membership: {
  status: string; startsAt: Date; endsAt: Date;
}, now = new Date()) {
  return membership.startsAt <= now && membership.endsAt > now &&
    ["active", "trial", "scheduled", "scheduled_cancellation"].includes(membership.status);
}

export function effectiveMembershipStatus(membership: {
  status: string; source: string; startsAt: Date; endsAt: Date;
}, now = new Date()) {
  if (membership.status === "scheduled" && membership.startsAt <= now)
    return membership.source === "trial" ? "trial" : "active";
  if (membership.status !== "paused" && membership.endsAt <= now &&
      ["active", "trial", "scheduled", "scheduled_cancellation"].includes(membership.status))
    return "expired";
  return membership.status;
}

export async function assertMemberEligibleForOffering(tx: BookingTx, userId: string, o: typeof offerings.$inferSelect) {
  const now = new Date();
  if (o.scope === "live") {
    const [partner] = o.partnerId ? await tx.select().from(partners).where(eq(partners.id, o.partnerId)).for("share") : [];
    if (!partner?.approved) throw new BookingError(403, "This partner is not approved for live bookings.");
  }
  const [m] = await tx.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.scope, o.scope)));
  const paymentEligible = m && (o.scope === "live"
    ? ((["trial", "corporate"].includes(m.source) && m.paymentStatus === "not_required") ||
       (m.source === "paid" && m.paymentStatus === "paid"))
    : m.paymentStatus === "paid");
  if (!m || !membershipCanAccess(m, now) || !paymentEligible ||
      m.startsAt > now || m.endsAt < o.endsAt || m.endsAt <= now) {
    throw new BookingError(403, "You need an active membership that covers this class.");
  }
  const rules = m.rules;
  if (o.kind === "event" && rules.planTerms?.eventAccess === false)
    throw new BookingError(403, "Your membership doesn’t include event access.");
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
}

export async function memberState(userId: string) {
  const [membershipRows, rows, profiles, waitlistRows, updateRows] = await Promise.all([
    db.select().from(memberships).where(eq(memberships.userId, userId)),
    db.select({ reservation: reservations, offering: offerings }).from(reservations)
      .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
      .where(eq(reservations.userId, userId)),
    db.select({ gender: memberProfiles.gender, birthDate: memberProfiles.birthDate }).from(memberProfiles).where(eq(memberProfiles.userId, userId)),
    db.select({ entry: waitlistEntries, offering: offerings }).from(waitlistEntries)
      .innerJoin(offerings, eq(waitlistEntries.offeringId, offerings.id))
      .where(eq(waitlistEntries.userId, userId)).orderBy(desc(waitlistEntries.createdAt)).limit(50),
    db.select().from(memberUpdates).where(eq(memberUpdates.userId, userId))
      .orderBy(desc(memberUpdates.createdAt), desc(memberUpdates.id)).limit(50),
  ]);
  return { profile: profiles[0] ?? null,
    memberships: membershipRows.map(membership => ({ ...membership, status: effectiveMembershipStatus(membership) })),
    bookings: rows.map(({ reservation: r, offering: o }) => ({
    id: r.id, kind: o.kind, targetId: o.targetId, slot: o.slot, title: o.title,
    localizedTitle: o.localizedTitle, city: o.city, facility: o.facility,
    cancellationDeadline: o.cancellationDeadline,
    scope: o.scope, startsAt: o.startsAt, status: r.status,
    createdAt: r.createdAt, cancelledAt: r.cancelledAt,
  })), waitlists: waitlistRows.map(({ entry: e, offering: o }) => ({
    id: e.id, offeringId: e.offeringId, title: o.title, startsAt: o.startsAt,
    queuePosition: e.queuePosition, status: e.status, createdAt: e.createdAt,
    offerExpiresAt: e.offerExpiresAt, respondedAt: e.respondedAt,
  })), waitlistUpdates: updateRows.map(({ id, kind, title, startsAt, createdAt }) => ({
    id, kind, title, startsAt, createdAt,
  })) };
}

export async function memberAccountSummary(userId: string) {
  const state = await memberState(userId);
  return {
    memberships: state.memberships.map(({ scope, status, tier, endsAt }) => ({
      scope, status, tier, endsAt,
    })),
    bookings: state.bookings,
  };
}

async function recordWaitlistUpdate(
  tx: BookingTx,
  entryId: string,
  userId: string,
  offering: typeof offerings.$inferSelect,
  kind: "waitlist_offer" | "waitlist_expired" | "waitlist_booked",
  createdAt: Date,
) {
  await tx.insert(memberUpdates).values({
    id: randomUUID(),
    userId,
    eventKey: `waitlist:${entryId}:${kind}`,
    kind,
    title: offering.title,
    startsAt: offering.startsAt,
    createdAt,
  }).onConflictDoNothing();
}

type WaitlistChanges = {
  offered: { userId: string; expiresAt: Date }[];
  expired: string[];
  reminders: { entryId: string; userId: string; expiresAt: Date }[];
};

async function advanceWaitlistInTransaction(tx: BookingTx, offering: typeof offerings.$inferSelect, now: Date): Promise<WaitlistChanges> {
  const changes: WaitlistChanges = { offered: [], expired: [], reminders: [] };
  const expiredRows = await tx.update(waitlistEntries)
    .set({ status: "expired", respondedAt: now })
    .where(and(eq(waitlistEntries.offeringId, offering.id), eq(waitlistEntries.status, "offered"), lte(waitlistEntries.offerExpiresAt, now)))
    .returning({ id: waitlistEntries.id, userId: waitlistEntries.userId });
  for (const row of expiredRows)
    await recordWaitlistUpdate(tx, row.id, row.userId, offering, "waitlist_expired", now);
  changes.expired.push(...expiredRows.map(row => row.userId));

  const dueReminders = await tx.select({
    id: waitlistEntries.id,
    userId: waitlistEntries.userId,
    expiresAt: waitlistEntries.offerExpiresAt,
  }).from(waitlistEntries)
    .where(and(
      eq(waitlistEntries.offeringId, offering.id),
      eq(waitlistEntries.status, "offered"),
      gt(waitlistEntries.offerExpiresAt, now),
      lte(waitlistEntries.reminderAt, now),
      isNull(waitlistEntries.reminderAttemptedAt),
    )).for("update");
  for (const reminder of dueReminders) {
    if (!reminder.expiresAt) continue;
    const [claimed] = await tx.update(waitlistEntries).set({ reminderAttemptedAt: now })
      .where(and(
        eq(waitlistEntries.id, reminder.id),
        eq(waitlistEntries.status, "offered"),
        gt(waitlistEntries.offerExpiresAt, now),
        isNull(waitlistEntries.reminderAttemptedAt),
      )).returning({ id: waitlistEntries.id });
    if (claimed) changes.reminders.push({
      entryId: reminder.id, userId: reminder.userId, expiresAt: reminder.expiresAt,
    });
  }

  const [held] = await tx.select({ count: sql<number>`count(*)::int` }).from(reservations)
    .where(and(eq(reservations.offeringId, offering.id), inArray(reservations.status, ["reserved", "requested"])));
  const [offered] = await tx.select({ count: sql<number>`count(*)::int` }).from(waitlistEntries)
    .where(and(eq(waitlistEntries.offeringId, offering.id), eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, now)));
  let placesToOffer = Math.max(0, offering.capacity - Number(held?.count ?? 0) - Number(offered?.count ?? 0));
  if (!placesToOffer || offering.startsAt <= now || offering.cancelledAt || !offering.active) return changes;

  const waiting = await tx.select().from(waitlistEntries)
    .where(and(eq(waitlistEntries.offeringId, offering.id), eq(waitlistEntries.status, "waiting")))
    .orderBy(asc(waitlistEntries.queuePosition)).for("update");
  for (const entry of waiting) {
    if (!placesToOffer) break;
    try {
      await assertMemberEligibleForOffering(tx, entry.userId, offering);
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      await tx.update(waitlistEntries).set({ status: "ineligible", respondedAt: now })
        .where(eq(waitlistEntries.id, entry.id));
      continue;
    }
    const expiresAt = new Date(Math.min(now.getTime() + offering.waitlistOfferMinutes * 60_000, offering.startsAt.getTime()));
    if (expiresAt <= now) {
      await tx.update(waitlistEntries).set({ status: "expired", respondedAt: now })
        .where(eq(waitlistEntries.id, entry.id));
      await recordWaitlistUpdate(tx, entry.id, entry.userId, offering, "waitlist_expired", now);
      changes.expired.push(entry.userId);
      continue;
    }
    const offerDuration = expiresAt.getTime() - now.getTime();
    const reminderLead = Math.min(10 * 60_000, Math.floor(offerDuration / 2));
    const reminderAt = new Date(expiresAt.getTime() - reminderLead);
    await tx.update(waitlistEntries).set({
      status: "offered",
      offerExpiresAt: expiresAt,
      reminderAt,
      reminderAttemptedAt: null,
      respondedAt: null,
    })
      .where(eq(waitlistEntries.id, entry.id));
    await recordWaitlistUpdate(tx, entry.id, entry.userId, offering, "waitlist_offer", now);
    changes.offered.push({ userId: entry.userId, expiresAt });
    placesToOffer--;
  }
  return changes;
}

function notifyWaitlistChanges(changes: WaitlistChanges) {
  for (const userId of changes.expired) void sendMemberNotification(userId, "waitlist_expired");
  for (const offer of changes.offered) void sendMemberNotification(offer.userId, "waitlist_offer", { offerExpiresAt: offer.expiresAt });
  for (const reminder of changes.reminders) {
    void (async () => {
      const now = new Date();
      const [stillOpen] = await db.select({ expiresAt: waitlistEntries.offerExpiresAt }).from(waitlistEntries)
        .where(and(
          eq(waitlistEntries.id, reminder.entryId),
          eq(waitlistEntries.status, "offered"),
          gt(waitlistEntries.offerExpiresAt, now),
        )).limit(1);
      if (!stillOpen?.expiresAt) return;
      const remainingMinutes = Math.max(1, Math.ceil((stillOpen.expiresAt.getTime() - now.getTime()) / 60_000));
      await sendMemberNotification(reminder.userId, "waitlist_reminder", {
        remainingMinutes,
        dedupeKey: `waitlist-reminder:${reminder.entryId}`,
      });
    })().catch(error => console.error("Waitlist reminder dispatch failed.", error));
  }
}

export async function joinWaitlist(userId: string, offeringId: string) {
  await processWaitlistQueue(new Date(), [offeringId]);
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [offering] = await tx.select().from(offerings).where(eq(offerings.id, offeringId)).for("update");
    const now = new Date();
    if (!offering || offering.scope !== "live" || offering.kind !== "session" || !offering.active || offering.cancelledAt || offering.startsAt <= now)
      throw new BookingError(404, "This live class is not available for a waitlist.");
    const existing = await tx.select().from(waitlistEntries).where(and(
      eq(waitlistEntries.userId, userId), eq(waitlistEntries.offeringId, offeringId),
      inArray(waitlistEntries.status, ["waiting", "offered"]),
    )).limit(1);
    if (existing[0]) return existing[0];
    await assertMemberEligibleForOffering(tx, userId, offering);
    const [reserved] = await tx.select({ count: sql<number>`count(*)::int` }).from(reservations)
      .where(and(eq(reservations.offeringId, offeringId), inArray(reservations.status, ["reserved", "requested"])));
    const [offered] = await tx.select({ count: sql<number>`count(*)::int` }).from(waitlistEntries)
      .where(and(eq(waitlistEntries.offeringId, offeringId), eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, now)));
    if (Number(reserved?.count ?? 0) + Number(offered?.count ?? 0) < offering.capacity)
      throw new BookingError(409, "This class still has a place. Book it instead of joining the waitlist.");
    const [last] = await tx.select({ position: sql<number>`coalesce(max(${waitlistEntries.queuePosition}), 0)::int` })
      .from(waitlistEntries).where(eq(waitlistEntries.offeringId, offeringId));
    const [entry] = await tx.insert(waitlistEntries).values({
      id: randomUUID(), userId, offeringId, queuePosition: Number(last?.position ?? 0) + 1, status: "waiting",
    }).returning();
    return entry;
  });
  return result;
}

export async function leaveWaitlist(userId: string, entryId: string) {
  const [known] = await db.select({ offeringId: waitlistEntries.offeringId }).from(waitlistEntries)
    .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.userId, userId))).limit(1);
  if (!known) throw new BookingError(404, "Waitlist entry not found.");
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [offering] = await tx.select().from(offerings).where(eq(offerings.id, known.offeringId)).for("update");
    const [entry] = await tx.select().from(waitlistEntries).where(and(
      eq(waitlistEntries.id, entryId), eq(waitlistEntries.userId, userId),
    )).for("update");
    if (!entry || !offering) throw new BookingError(404, "Waitlist entry not found.");
    if (!["waiting", "offered"].includes(entry.status))
      return { changed: false, changes: { offered: [], expired: [], reminders: [] } as WaitlistChanges };
    await tx.update(waitlistEntries).set({ status: "left", respondedAt: new Date() }).where(eq(waitlistEntries.id, entryId));
    const changes = entry.status === "offered"
      ? await advanceWaitlistInTransaction(tx, offering, new Date())
      : { offered: [], expired: [], reminders: [] };
    return { changed: true, changes };
  });
  notifyWaitlistChanges(result.changes);
  return result.changed;
}

export async function acceptWaitlistOffer(userId: string, entryId: string) {
  const [known] = await db.select({ offeringId: waitlistEntries.offeringId }).from(waitlistEntries)
    .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.userId, userId))).limit(1);
  if (!known) throw new BookingError(404, "Waitlist offer not found.");
  await processWaitlistQueue(new Date(), [known.offeringId]);
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [offering] = await tx.select().from(offerings).where(eq(offerings.id, known.offeringId)).for("update");
    const [entry] = await tx.select().from(waitlistEntries).where(and(
      eq(waitlistEntries.id, entryId), eq(waitlistEntries.userId, userId),
    )).for("update");
    const now = new Date();
    if (!offering || !entry) throw new BookingError(404, "Waitlist offer not found.");
    if (entry.status !== "offered" || !entry.offerExpiresAt || entry.offerExpiresAt <= now)
      return { accepted: false, reason: "expired" as const, changes: { offered: [], expired: [], reminders: [] } as WaitlistChanges };
    if (offering.startsAt <= now || offering.cancelledAt || !offering.active)
      return { accepted: false, reason: "closed" as const, changes: { offered: [], expired: [], reminders: [] } as WaitlistChanges };
    let eligibilityError: BookingError | null = null;
    try {
      await assertMemberEligibleForOffering(tx, userId, offering);
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      eligibilityError = error;
    }
    if (eligibilityError) {
      await tx.update(waitlistEntries).set({ status: "ineligible", respondedAt: now }).where(eq(waitlistEntries.id, entryId));
      const changes = await advanceWaitlistInTransaction(tx, offering, now);
      return { accepted: false, reason: "ineligible" as const, eligibilityError, changes };
    }
    await tx.update(waitlistEntries).set({ status: "booked", respondedAt: now }).where(eq(waitlistEntries.id, entryId));
    await recordWaitlistUpdate(tx, entry.id, userId, offering, "waitlist_booked", now);
    await tx.insert(reservations).values({
      id: randomUUID(), userId, offeringId: offering.id, status: "reserved",
    });
    return { accepted: true, changes: { offered: [], expired: [], reminders: [] } as WaitlistChanges };
  });
  notifyWaitlistChanges(result.changes);
  if (result.accepted) {
    void sendMemberNotification(userId, "waitlist_booked");
    return true;
  }
  if (result.reason === "ineligible") throw result.eligibilityError;
  throw new BookingError(409, result.reason === "closed" ? "This class is no longer available." : "This offer has expired.");
}

export async function processWaitlistQueue(now = new Date(), onlyOfferingIds?: string[]) {
  const conditions = [inArray(waitlistEntries.status, ["waiting", "offered"])];
  if (onlyOfferingIds?.length) conditions.push(inArray(waitlistEntries.offeringId, onlyOfferingIds));
  const candidates = await db.select({ offeringId: waitlistEntries.offeringId }).from(waitlistEntries)
    .where(and(...conditions));
  const offeringIds = [...new Set(candidates.map(row => row.offeringId))];
  for (const offeringId of offeringIds) {
    const changes = await db.transaction(async tx => {
      const [offering] = await tx.select().from(offerings).where(eq(offerings.id, offeringId)).for("update");
      if (!offering) return { offered: [], expired: [], reminders: [] } as WaitlistChanges;
      return advanceWaitlistInTransaction(tx, offering, now);
    });
    notifyWaitlistChanges(changes);
  }
}

export async function createReservation(userId: string, input: { kind: string; targetId: string; slot: string }) {
  const [known] = await db.select({ id: offerings.id }).from(offerings).where(and(
    eq(offerings.kind, input.kind), eq(offerings.targetId, input.targetId), eq(offerings.slot, input.slot),
  )).limit(1);
  if (known) await processWaitlistQueue(new Date(), [known.id]);
  return db.transaction(async tx => {
    // Lock the account and offering: quota and capacity checks must be atomic.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [o] = await tx.select().from(offerings).where(and(
      eq(offerings.kind, input.kind), eq(offerings.targetId, input.targetId), eq(offerings.slot, input.slot),
    )).for("update");
    const now = new Date();
    if (!o || !o.active || o.cancelledAt) throw new BookingError(404, "This activity isn’t available.");
    if (o.startsAt <= now) throw new BookingError(409, "This class has already started.");
    await assertMemberEligibleForOffering(tx, userId, o);
    const places = await tx.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    const offeredPlaces = await tx.select({ id: waitlistEntries.id }).from(waitlistEntries)
      .where(and(eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, now)));
    if (places.length + offeredPlaces.length >= o.capacity) throw new BookingError(409, "This class is full.");
    const [row] = await tx.insert(reservations).values({
      id: randomUUID(), userId, offeringId: o.id, status: o.kind === "coach" ? "requested" : "reserved",
    }).returning();
    return row;
  });
}

export async function cancelReservation(userId: string, id: string) {
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [r] = await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.userId, userId))).for("update");
    if (!r) throw new BookingError(404, "Booking not found.");
    if (r.status === "cancelled") return { cancelled: false, changes: { offered: [], expired: [], reminders: [] } as WaitlistChanges };
    if (!["reserved", "requested"].includes(r.status)) throw new BookingError(409, "This booking can’t be canceled.");
    if ((await tx.select().from(attendance).where(eq(attendance.reservationId, id))).length)
      throw new BookingError(409, "Attendance already exists. Request an attendance review.");
    const [o] = await tx.select().from(offerings).where(eq(offerings.id, r.offeringId)).for("update");
    if (new Date() >= o.cancellationDeadline) throw new BookingError(409, "The cancellation deadline has passed. Contact support.");
    await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(reservations.id, r.id));
    const changes = o.scope === "live"
      ? await advanceWaitlistInTransaction(tx, o, new Date())
      : { offered: [], expired: [], reminders: [] };
    return { cancelled: true, changes };
  });
  notifyWaitlistChanges(result.changes);
  return result.cancelled;
}
