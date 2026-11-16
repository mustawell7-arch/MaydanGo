import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, attendance, attendanceEvents, checkinChallenges, checkinPolicies, facilityProfiles, facilityHoursOverrides, guardianConsentDocuments, manualCheckinChallenges, memberships, offerings, operators, partners, reservations, memberProfiles, memberConsentEvents } from "@workspace/db";
import { z } from "zod";
import { BookingError, membershipCanAccess, processWaitlistQueue } from "./reservations";
import { ageOnDate } from "./age";
import { hasAdminPermission, type AdminPermission } from "./admin-roles";
import { isAccessSuspended, isVenueSafetyRestricted, lockVenueAccess } from "./account-access-restrictions";
import { iraqCalendarDate, openingState, previousIraqCalendarDate } from "./facility-hours";
import { getPlatformSafetyRules } from "./platform-rules";
import type { PlatformSafetyRules } from "@workspace/db";
import { getCurrentLegalPolicies } from "./legal-policies";
import {
  buildCurrentMemberConsentState,
  hasCurrentRequiredMemberConsent,
  MEMBER_CONSENT_REQUIRED_CODE,
  MEMBER_CONSENT_REQUIRED_MESSAGE,
} from "./member-consents";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
async function requireCurrentMemberConsent(userId: string) {
  if (!await hasCurrentRequiredMemberConsent(userId)) {
    throw new BookingError(403, MEMBER_CONSENT_REQUIRED_MESSAGE, MEMBER_CONSENT_REQUIRED_CODE);
  }
}
export const policyInput = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  radius: z.number().int().min(25).max(800),
  opensAt: z.string().datetime({ offset: true }), closesAt: z.string().datetime({ offset: true }),
  correctionEndsAt: z.string().datetime({ offset: true }),
}).strict();
export const scanInput = z.object({
  token: z.string().regex(/^MDG1:[a-f0-9]{64}$/),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100), capturedAt: z.string().datetime({ offset: true }),
  mocked: z.boolean().optional(),
}).strict();
export const reviewInput = z.object({
  action: z.enum(["confirm", "no_show", "dispute", "void", "resolve_confirm", "resolve_void", "accept_request", "reject_request", "lock"]),
  reason: z.string().trim().min(5).max(500),
}).strict();
export const manualCheckinInput = z.object({
  code: z.string().regex(/^\d{8}$/),
  reason: z.string().trim().min(5).max(500),
}).strict();
export function distance(a: number, b: number, c: number, d: number) {
  const rad = (x: number) => x * Math.PI / 180;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2)));
}
export function isCheckinTravelViolation(
  secondsSincePrevious: number,
  distanceMeters: number,
  rules: PlatformSafetyRules,
) {
  return secondsSincePrevious >= 0 && (
    secondsSincePrevious < rules.rapidCheckinBlockSeconds
    || (secondsSincePrevious < rules.impossibleTravelWindowSeconds
      && distanceMeters > rules.impossibleTravelBaseMeters
        + secondsSincePrevious * rules.impossibleTravelMetersPerSecond)
  );
}
async function event(tx: Tx, reservationId: string, actorId: string, action: string, before: string, after: string, reason: string) {
  await tx.insert(attendanceEvents).values({ id: randomUUID(), reservationId, actorId, action, before, after, reason });
}
async function context(tx: Tx, id: string) {
  const [initial] = await tx.select().from(reservations).where(eq(reservations.id, id));
  if (!initial) throw new BookingError(404, "Booking not found.");
  // Same lock order as booking/revocation: account, offering, then reservation.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${initial.userId}))`);
  const [o] = await tx.select().from(offerings).where(eq(offerings.id, initial.offeringId)).for("update");
  const [r] = await tx.select().from(reservations).where(eq(reservations.id, id)).for("update");
  if (o.scope !== "live") throw new BookingError(403, "Sample bookings cannot create verified attendance.");
  const [p] = await tx.select().from(checkinPolicies).where(eq(checkinPolicies.offeringId, o.id));
  const [a] = await tx.select().from(attendance).where(eq(attendance.reservationId, id));
  return { r, o, p, a };
}
async function staff(
  tx: Tx,
  actor: string,
  partnerId: string | null,
  permissions: AdminPermission[] = ["partner_operations"],
  offering?: typeof offerings.$inferSelect,
) {
  const [op] = await tx.select().from(operators).where(eq(operators.userId, actor)).for("share");
  const hasRequiredPermission = !!op && permissions.some(permission => hasAdminPermission(op.role, permission));
  if (!op || (!hasRequiredPermission && !(op.role === "partner" && partnerId && op.partnerId === partnerId)))
    throw new BookingError(403, "Authorized staff for this partner are required.");
  if (op.role === "partner" && partnerId) {
    await lockVenueAccess(tx, partnerId, offering?.city, offering?.facility);
  }
  if (op.role === "partner" && partnerId && await isVenueSafetyRestricted("partner", partnerId)) {
    throw new BookingError(403, "Partner attendance actions are temporarily restricted. Contact MaydanGo support.");
  }
  if (op.role === "partner" && offering && partnerId) {
    const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
      eq(facilityProfiles.partnerId, partnerId),
      eq(facilityProfiles.city, offering.city),
      eq(facilityProfiles.facility, offering.facility),
    )).limit(1);
    if (facility && await isVenueSafetyRestricted("facility", facility.id)) {
      throw new BookingError(403, "Facility attendance actions are temporarily restricted.");
    }
  }
  return op;
}
async function eligible(tx: Tx, c: Awaited<ReturnType<typeof context>>) {
  const { r, o } = c;
  await lockVenueAccess(tx, o.partnerId, o.city, o.facility);
  if (await isAccessSuspended("member", r.userId)) {
    throw new BookingError(403, "This account is temporarily restricted from check-in. Contact MaydanGo support.");
  }
  if (o.partnerId && await isVenueSafetyRestricted("partner", o.partnerId)) {
    throw new BookingError(403, "This partner is temporarily restricted from check-in.");
  }
  const [facility] = o.partnerId ? await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
    eq(facilityProfiles.partnerId, o.partnerId),
    eq(facilityProfiles.city, o.city),
    eq(facilityProfiles.facility, o.facility),
  )).limit(1) : [];
  if (facility && await isVenueSafetyRestricted("facility", facility.id)) {
    throw new BookingError(403, "This facility is temporarily restricted from check-in.");
  }
  const otherArrivals = await tx.select().from(attendance).where(and(eq(attendance.userId, r.userId),
    eq(attendance.offeringId, o.id), inArray(attendance.status, ["pending", "confirmed", "disputed"])));
  if (otherArrivals.some(a => a.reservationId !== r.id))
    throw new BookingError(409, "Attendance already exists for this member and session.");
  if (r.status !== "reserved" || !o.active || o.cancelledAt || o.accessType === "live")
    throw new BookingError(409, "A confirmed physical reservation is required.");
  const [partner] = await tx.select().from(partners).where(eq(partners.id, o.partnerId ?? "")).for("share");
  if (!partner?.approved) throw new BookingError(403, "Partner approval is required.");
  const [m] = await tx.select().from(memberships).where(and(eq(memberships.userId, r.userId), eq(memberships.scope, "live")));
  const now = new Date();
  const paymentEligible = m && (
    (["trial", "corporate"].includes(m.source) && m.paymentStatus === "not_required") ||
    (m.source === "paid" && m.paymentStatus === "paid")
  );
  if (!m || !membershipCanAccess(m, now) || !paymentEligible ||
      m.startsAt > now || m.endsAt <= now || m.endsAt < o.endsAt)
    throw new BookingError(403, "An active eligible membership is required.");
  const rules = m.rules;
  if (!o.tiers.includes(m.tier) || o.additionalPayment ||
      (rules.cities && !rules.cities.includes(o.city)) || (rules.facilities && !rules.facilities.includes(o.facility)) ||
      (rules.categories && !rules.categories.includes(o.category)) ||
      (m.source === "trial" && !rules.trialAllowedTypes?.includes(o.accessType)) ||
      (m.source === "corporate" && (!rules.corporateId || rules.corporateId !== m.corporateId)))
    throw new BookingError(403, "Your membership doesn’t include this activity.");
  if (o.gender !== "all" || o.minAge || o.maxAge !== null) {
    const [profile] = await tx.select().from(memberProfiles).where(eq(memberProfiles.userId, r.userId));
    const age = ageOnDate(profile?.birthDate, o.startsAt);
    if (!profile || age === null || (o.gender !== "all" && profile.gender !== o.gender) || age < o.minAge || (o.maxAge !== null && age > o.maxAge))
      throw new BookingError(403, "Your eligibility profile does not match this session.");
  }
  const held = await tx.select({ o: offerings }).from(reservations).innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .where(and(eq(reservations.userId, r.userId), inArray(reservations.status, ["reserved", "requested"])));
  const visits = await tx.select({ o: offerings }).from(attendance).innerJoin(offerings, eq(attendance.offeringId, offerings.id))
    .where(and(eq(attendance.userId, r.userId), inArray(attendance.status, ["pending", "confirmed", "disputed"])));
  const uses = [...new Map([...held, ...visits].filter(x => x.o.scope === "live" && x.o.startsAt >= m.startsAt && x.o.startsAt < m.endsAt).map(x => [x.o.id, x.o])).values()];
  const day = (d: Date) => new Date(d.getTime() + 10800000).toISOString().slice(0, 10);
  const limit = o.accessType === "premium" ? rules.premiumQuota : rules.physicalQuota;
  if ((rules.quotaMode === "separate" ? uses.filter(x => x.accessType === o.accessType).length > (limit ?? 0) : uses.length > rules.quota) ||
      uses.filter(x => day(x.startsAt) === day(o.startsAt)).length > rules.dailyLimit ||
      (rules.facilityLimits?.[o.facility] !== undefined && uses.filter(x => x.facility === o.facility).length > rules.facilityLimits[o.facility]) ||
      (rules.categoryLimits?.[o.category] !== undefined && uses.filter(x => x.category === o.category).length > rules.categoryLimits[o.category]) ||
      (o.partnerGroup && rules.partnerGroupLimits?.[o.partnerGroup] !== undefined && uses.filter(x => x.partnerGroup === o.partnerGroup).length > rules.partnerGroupLimits[o.partnerGroup]))
    throw new BookingError(403, "Your visit allowance is exhausted.");
}
async function requireFacilityOpen(tx: Tx, c: Awaited<ReturnType<typeof context>>, now: Date) {
  const [facility] = await tx.select({ id: facilityProfiles.id, openingHours: facilityProfiles.openingHours }).from(facilityProfiles)
    .where(and(
      eq(facilityProfiles.partnerId, c.o.partnerId ?? ""),
      eq(facilityProfiles.city, c.o.city),
      eq(facilityProfiles.facility, c.o.facility),
    )).limit(1);
  const today = iraqCalendarDate(now);
  const previousDate = previousIraqCalendarDate(now);
  const overrides = facility ? await tx.select({
    startDate: facilityHoursOverrides.startDate,
    endDate: facilityHoursOverrides.endDate,
    closed: facilityHoursOverrides.closed,
    opensAt: facilityHoursOverrides.opensAt,
    closesAt: facilityHoursOverrides.closesAt,
  }).from(facilityHoursOverrides).where(and(
    eq(facilityHoursOverrides.facilityId, facility.id),
    lte(facilityHoursOverrides.startDate, today),
    gte(facilityHoursOverrides.endDate, previousDate),
  )) : [];
  const state = facility ? openingState(facility.openingHours, now, overrides) : { openingStatus: "unavailable" as const };
  if (state.openingStatus !== "open")
    throw new BookingError(409, state.openingStatus === "closed"
      ? "The facility is closed."
      : "Facility opening hours are not published.");
}
export async function savePolicy(actor: string, id: string, input: z.infer<typeof policyInput>) {
  return db.transaction(async tx => {
    const c = await context(tx, id); await staff(tx, actor, c.o.partnerId, undefined, c.o);
    const opensAt = new Date(input.opensAt), closesAt = new Date(input.closesAt), correctionEndsAt = new Date(input.correctionEndsAt);
    if (opensAt >= closesAt || opensAt < new Date(c.o.startsAt.getTime() - 3600000) || closesAt > c.o.endsAt ||
        correctionEndsAt < c.o.endsAt || correctionEndsAt > new Date(c.o.endsAt.getTime() + 7 * 86400000))
      throw new BookingError(400, "Window must be within one hour before start and session end; correction deadline must be within seven days after end.");
    if (c.p || c.o.endsAt <= new Date()) throw new BookingError(409, "Policy is fixed once configured. Contact support for a replacement session.");
    await tx.insert(checkinPolicies).values({ ...input, offeringId: c.o.id, opensAt, closesAt, correctionEndsAt });
    await event(tx, id, actor, "policy", "", "", JSON.stringify(input));
  });
}
export async function issueQr(actor: string, id: string, revoke = false) {
  return db.transaction(async tx => {
    const c = await context(tx, id); await staff(tx, actor, c.o.partnerId, undefined, c.o);
    const now = new Date();
    if (!revoke) await requireFacilityOpen(tx, c, now);
    await tx.update(checkinChallenges).set({ consumedAt: now }).where(eq(checkinChallenges.reservationId, id));
    await tx.update(manualCheckinChallenges).set({ consumedAt: now })
      .where(and(eq(manualCheckinChallenges.reservationId, id), isNull(manualCheckinChallenges.consumedAt)));
    if (revoke) { await event(tx, id, actor, "qr.revoke", "", "", "QR deactivated"); return; }
    await eligible(tx, c);
    if (!c.p || new Date() < c.p.opensAt || new Date() >= c.p.closesAt || c.a) throw new BookingError(409, "Check-in is closed, unconfigured, or already recorded.");
    const token = `MDG1:${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Math.min(Date.now() + 300000, c.p.closesAt.getTime()));
    await tx.insert(checkinChallenges).values({ id: randomUUID(), reservationId: id, digest: digest(token), expiresAt });
    await event(tx, id, actor, "qr.issue", "", "", "Single-use QR issued");
    return { token, expiresAt };
  });
}
export async function issueManualCheckinCode(actor: string, id: string) {
  await requireCurrentMemberConsent(actor);
  return db.transaction(async tx => {
    const c = await context(tx, id);
    if (c.r.userId !== actor) throw new BookingError(403, "Only the member with this reservation can request its code.");
    await eligible(tx, c);
    const now = new Date();
    if (!c.p || now < c.p.opensAt || now >= c.p.closesAt)
      throw new BookingError(409, "Manual check-in is available only during the check-in window.");
    await requireFacilityOpen(tx, c, now);
    if (c.a) throw new BookingError(409, "Arrival is already recorded for this reservation.");
    const [latest] = await tx.select().from(manualCheckinChallenges)
      .where(eq(manualCheckinChallenges.reservationId, id))
      .orderBy(desc(manualCheckinChallenges.createdAt)).limit(1).for("update");
    if (latest && now.getTime() - latest.createdAt.getTime() < 30000)
      throw new BookingError(429, "Wait 30 seconds before requesting another code.");
    await tx.update(checkinChallenges).set({ consumedAt: now }).where(eq(checkinChallenges.reservationId, id));
    await tx.update(manualCheckinChallenges).set({ consumedAt: now })
      .where(and(eq(manualCheckinChallenges.reservationId, id), isNull(manualCheckinChallenges.consumedAt)));
    const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
    const expiresAt = new Date(Math.min(now.getTime() + 300000, c.p.closesAt.getTime()));
    await tx.insert(manualCheckinChallenges).values({
      id: randomUUID(), reservationId: id, digest: digest(code), createdAt: now, expiresAt,
    });
    await event(tx, id, actor, "manual.code.issue", "not_checked_in", "code_issued", "Member requested a staff-assisted check-in code");
    return { code, expiresAt };
  });
}
export async function recordManualCheckin(actor: string, id: string, input: z.infer<typeof manualCheckinInput>) {
  const currentPolicies = await getCurrentLegalPolicies();
  return db.transaction(async tx => {
    const c = await context(tx, id), op = await staff(tx, actor, c.o.partnerId, undefined, c.o);
    if (op.role !== "partner") throw new BookingError(403, "Only assigned partner staff can record a manual arrival.");
    const consentHistory = await tx.select().from(memberConsentEvents)
      .where(eq(memberConsentEvents.userId, c.r.userId))
      .orderBy(desc(memberConsentEvents.recordedAt), desc(memberConsentEvents.id));
    if (!buildCurrentMemberConsentState(consentHistory, currentPolicies).requiredAccepted) {
      throw new BookingError(403, MEMBER_CONSENT_REQUIRED_MESSAGE, MEMBER_CONSENT_REQUIRED_CODE);
    }
    await eligible(tx, c);
    const now = new Date();
    if (!c.p || now < c.p.opensAt || now >= c.p.closesAt)
      throw new BookingError(409, "Manual check-in is available only during the check-in window.");
    await requireFacilityOpen(tx, c, now);
    if (c.a) throw new BookingError(409, "Arrival is already recorded for this reservation.");
    const [challenge] = await tx.select().from(manualCheckinChallenges)
      .where(and(eq(manualCheckinChallenges.reservationId, id), isNull(manualCheckinChallenges.consumedAt)))
      .orderBy(desc(manualCheckinChallenges.createdAt)).limit(1).for("update");
    if (!challenge || challenge.expiresAt <= now || challenge.attempts >= 5)
      throw new BookingError(409, "Manual code expired or is unavailable. Ask the member to request a new one.");
    const expected = Buffer.from(challenge.digest, "hex"), received = Buffer.from(digest(input.code), "hex");
    if (!timingSafeEqual(expected, received)) {
      const attempts = challenge.attempts + 1, exhausted = attempts >= 5;
      await tx.update(manualCheckinChallenges).set({ attempts, ...(exhausted ? { consumedAt: now } : {}) })
        .where(eq(manualCheckinChallenges.id, challenge.id));
      await event(tx, id, actor, "manual.code.failed", "not_checked_in", exhausted ? "code_locked" : "code_retry", input.reason);
      return { ok: false as const, exhausted };
    }
    const reference = randomUUID();
    await tx.insert(attendance).values({
      id: reference, reservationId: c.r.id, userId: c.r.userId, offeringId: c.o.id,
      checkedInAt: now, verifiedBy: actor, status: "pending", settlementEligible: false,
    });
    await tx.update(manualCheckinChallenges).set({ consumedAt: now }).where(eq(manualCheckinChallenges.id, challenge.id));
    await event(tx, id, actor, "manual.checkin", "not_checked_in", reference, input.reason);
    return { ok: true as const, reference, status: "pending" };
  });
}
export async function scanQr(actor: string, input: z.infer<typeof scanInput>) {
  await requireCurrentMemberConsent(actor);
  const rules = await getPlatformSafetyRules();
  return db.transaction(async tx => {
    const [challenge] = await tx.select().from(checkinChallenges).where(eq(checkinChallenges.digest, digest(input.token)));
    if (!challenge) throw new BookingError(400, "Invalid QR code.");
    const c = await context(tx, challenge.reservationId);
    if (c.r.userId !== actor) throw new BookingError(403, "This QR belongs to another reservation.");
    const [fresh] = await tx.select().from(checkinChallenges).where(eq(checkinChallenges.id, challenge.id)).for("update");
    const now = new Date();
    if (fresh.consumedAt || fresh.expiresAt <= now || c.a) throw new BookingError(409, "QR expired, deactivated, or already used.");
    await eligible(tx, c);
    if (!c.p || now < c.p.opensAt || now >= c.p.closesAt) throw new BookingError(409, "Outside the check-in window.");
    await requireFacilityOpen(tx, c, now);
    if (input.mocked || input.accuracy > rules.maxCheckinAccuracyMeters
        || Math.abs(now.getTime() - new Date(input.capturedAt).getTime()) > 60000 ||
        distance(input.latitude, input.longitude, c.p.latitude, c.p.longitude) + input.accuracy > c.p.radius)
      throw new BookingError(403, "A fresh, accurate location inside the facility radius is required.");
    const recent = await tx.select({ a: attendance, p: checkinPolicies }).from(attendance)
      .innerJoin(checkinPolicies, eq(attendance.offeringId, checkinPolicies.offeringId)).where(eq(attendance.userId, actor));
    if (recent.some(({ a, p }) => {
      if (!a.verifiedBy || !["pending", "confirmed", "disputed"].includes(a.status)) return false;
      const seconds = (now.getTime() - a.checkedInAt.getTime()) / 1000;
      return isCheckinTravelViolation(
        seconds,
        distance(p.latitude, p.longitude, input.latitude, input.longitude),
        rules,
      );
    })) throw new BookingError(409, "Rapid check-in or impossible travel detected. Contact staff.");
    const reference = randomUUID();
    await tx.insert(attendance).values({ id: reference, reservationId: c.r.id, userId: actor, offeringId: c.o.id,
      checkedInAt: now, verifiedBy: actor, status: "pending", settlementEligible: false });
    await tx.update(checkinChallenges).set({ consumedAt: now }).where(eq(checkinChallenges.id, fresh.id));
    await event(tx, c.r.id, actor, "scan", "not_checked_in", "pending", "QR and location validated; partner confirmation required");
    return { reference, status: "pending" };
  });
}
export async function review(actor: string, id: string, input: z.infer<typeof reviewInput>) {
  const rejectedOfferingId = await db.transaction(async tx => {
    const c = await context(tx, id), { action, reason } = input;
    const now = new Date();
    const ownDispute = action === "dispute" && c.r.userId === actor;
    const requiredPermission = action.startsWith("resolve_") ? "fraud_compliance" : "partner_operations";
    const op = ownDispute ? null : await staff(tx, actor, c.o.partnerId, [requiredPermission], c.o);
    if (action === "reject_request") {
      if (c.r.status !== "requested" || c.o.startsAt <= now || !c.o.active || c.o.cancelledAt)
        throw new BookingError(409, "Only upcoming active booking requests may be rejected.");
      await tx.update(reservations).set({ status: "partner_cancelled", cancelledAt: now }).where(eq(reservations.id, id));
      await event(tx, id, actor, action, "requested", "partner_cancelled", reason);
      return c.o.id;
    }
    if (action === "accept_request") {
      if (c.r.status !== "requested" || c.o.startsAt <= now || !c.o.active || c.o.cancelledAt)
        throw new BookingError(409, "Only upcoming active requests may be confirmed.");
      await tx.update(reservations).set({ status: "reserved" }).where(eq(reservations.id, id));
      await event(tx, id, actor, action, "requested", "reserved", reason); return null;
    }
    if (!c.p) throw new BookingError(409, "Configure the attendance policy first.");
    const locked = !!c.a?.lockedAt || now >= c.p.correctionEndsAt;
    // No settlement-close override is exposed: a separate super-admin workflow is required.
    if (locked) throw new BookingError(409, "Attendance is locked. Contact administration.");
    if (action === "lock") {
      if (!op || !hasAdminPermission(op.role, "partner_operations") || !c.a || c.a.status === "disputed" || now < c.o.endsAt)
        throw new BookingError(403, "Only administrators can lock reconciled attendance after the session.");
      await tx.update(attendance).set({ lockedAt: now }).where(eq(attendance.id, c.a.id));
      await event(tx, id, actor, action, c.a.status, c.a.status, reason); return null;
    }
    if (action.startsWith("resolve_") && (!op || !hasAdminPermission(op.role, "fraud_compliance") || c.a?.status !== "disputed"))
      throw new BookingError(403, "Disputes require administrator review.");
    if (c.a?.status === "disputed" && !action.startsWith("resolve_"))
      throw new BookingError(409, "Attendance is on hold for administrator review.");
    if (action === "no_show" && (now < c.p.closesAt || c.a || c.r.status !== "reserved" || c.o.cancelledAt))
      throw new BookingError(409, "Only unscanned, confirmed reservations after the check-in window can be marked no-show.");
    if (action === "confirm") {
      if (actor === c.r.userId) throw new BookingError(403, "Another staff member must confirm your attendance.");
      if (c.a?.status !== "pending" || !c.a.verifiedBy) throw new BookingError(409, "A verified arrival is required before partner confirmation.");
      const [manual] = await tx.select().from(attendanceEvents).where(and(
        eq(attendanceEvents.reservationId, id), eq(attendanceEvents.action, "manual.checkin"), eq(attendanceEvents.after, c.a.id),
      )).limit(1);
      if (manual?.actorId === actor) throw new BookingError(403, "A different staff member must validate this manual arrival.");
    }
    if (action !== "no_show" && !c.a) throw new BookingError(409, "There is no attendance record to review.");
    if (action === "resolve_confirm") {
      if (!c.a?.verifiedBy || actor === c.r.userId) throw new BookingError(409, "An independent reviewer and verified arrival are required.");
    }
    if (["confirm", "resolve_confirm"].includes(action)) {
      const [profile] = await tx.select({ birthDate: memberProfiles.birthDate }).from(memberProfiles)
        .where(eq(memberProfiles.userId, c.r.userId));
      const age = ageOnDate(profile?.birthDate, c.o.startsAt);
      if (age === null) throw new BookingError(409, "A valid member birth date is required before attendance can be confirmed.");
      if (age < 18) {
        const [consent] = await tx.select({ id: guardianConsentDocuments.id }).from(guardianConsentDocuments)
          .where(and(
            eq(guardianConsentDocuments.attendanceId, c.a!.id),
            eq(guardianConsentDocuments.status, "ready"),
            gt(guardianConsentDocuments.expiresAt, now),
          )).for("share");
        if (!consent)
          throw new BookingError(409, "For members under 18, the partner must verify guardian consent on-site and upload its copy before confirming attendance.");
      }
    }
    // Eligibility was validated atomically with the arrival. Expiry or a later
    // membership change must not invalidate that historical evidence.
    if (["confirm", "resolve_confirm"].includes(action) && c.o.cancelledAt)
      throw new BookingError(409, "Cancelled sessions cannot become settlement eligible.");
    const status = action === "confirm" || action === "resolve_confirm" ? "confirmed"
      : action === "dispute" ? "disputed" : action === "no_show" ? "no_show" : "void";
    if (c.a) {
      await tx.update(attendance).set({ status, settlementEligible: status === "confirmed",
        verifiedBy: status === "confirmed" ? actor : c.a.verifiedBy })
        .where(eq(attendance.id, c.a.id));
    } else {
      await tx.insert(attendance).values({ id: randomUUID(), reservationId: id, userId: c.r.userId, offeringId: c.o.id,
        checkedInAt: now, verifiedBy: "", status, settlementEligible: false });
    }
    // No-shows retain their reserved allowance until explicitly waived.
    // A void correction releases the reservation hold as well as the visit.
    if (status === "void" && ["reserved", "requested"].includes(c.r.status)) {
      await tx.update(reservations).set({ status: "cancelled", cancelledAt: now }).where(eq(reservations.id, id));
    }
    await event(tx, id, actor, action, c.a?.status ?? "not_checked_in", status, reason);
    return null;
  });
  if (rejectedOfferingId) await processWaitlistQueue(new Date(), [rejectedOfferingId]);
}
export async function roster(actor: string) {
  const [op] = await db.select().from(operators).where(eq(operators.userId, actor));
  const isGlobalStaff = !!op && (
    hasAdminPermission(op.role, "partner_operations") || hasAdminPermission(op.role, "fraud_compliance")
  );
  const isStaff = isGlobalStaff || op?.role === "partner";
  if (!isStaff) await requireCurrentMemberConsent(actor);
  const rows = await db.select({
    r: reservations,
    o: offerings,
    a: attendance,
    p: checkinPolicies,
    profile: memberProfiles,
    guardianConsent: guardianConsentDocuments,
  }).from(reservations)
    .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .leftJoin(attendance, eq(attendance.reservationId, reservations.id))
    .leftJoin(checkinPolicies, eq(checkinPolicies.offeringId, offerings.id))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, reservations.userId))
    .leftJoin(guardianConsentDocuments, eq(guardianConsentDocuments.attendanceId, attendance.id))
    .where(and(eq(offerings.scope, "live"), isStaff
      ? isGlobalStaff ? undefined : eq(offerings.partnerId, op?.partnerId ?? "")
      : eq(reservations.userId, actor)));
  const events = rows.length ? await db.select().from(attendanceEvents).where(inArray(attendanceEvents.reservationId, rows.map(x => x.r.id))) : [];
  const userIds = [...new Set(rows.map(({ r }) => r.userId))];
  const manualVisitCounts = userIds.length ? await db.select({
    userId: reservations.userId,
    count: sql<number>`count(*)::int`,
  }).from(attendanceEvents).innerJoin(reservations, eq(attendanceEvents.reservationId, reservations.id))
    .where(and(inArray(reservations.userId, userIds), eq(attendanceEvents.action, "manual.checkin")))
    .groupBy(reservations.userId) : [];
  const manualCountByUser = new Map(manualVisitCounts.map(({ userId, count }) => [userId, count]));
  const now = new Date();
  return { role: isStaff ? op.role : "member", rows: rows.map(({ r, o, a, p, profile, guardianConsent }) => ({
    reservationId: r.id, userId: r.userId, title: o.title, facility: o.facility, startsAt: o.startsAt, endsAt: o.endsAt,
    bookingStatus: r.status, status: a?.status ?? "not_checked_in", reference: a?.id,
    checkedInAt: a?.verifiedBy ? a.checkedInAt : undefined,
    settlementEligible: a?.settlementEligible ?? false,
    manualCheckin: events.some(e => e.reservationId === r.id && e.action === "manual.checkin"),
    manualRepeatUse: (manualCountByUser.get(r.userId) ?? 0) > 1,
    guardianConsentState: isStaff
      ? ageOnDate(profile?.birthDate, o.startsAt) === null
        ? "age_unknown"
        : ageOnDate(profile?.birthDate, o.startsAt)! >= 18
          ? "not_required"
          : guardianConsent?.status === "ready" && guardianConsent.expiresAt > now
            ? "uploaded"
            : "required"
      : undefined,
    locked: !!a?.lockedAt || (!!p && new Date() >= p.correctionEndsAt), policy: p ?? undefined,
    events: events.filter(e => e.reservationId === r.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  })) };
}
