import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, partners, operators, offerings, facilityProfiles, memberships, reservations, attendance, checkinPolicies, checkinChallenges, manualCheckinChallenges, attendanceEvents } from "@workspace/db";
import { savePolicy, issueQr, scanQr, review, roster, scanInput, issueManualCheckinCode, recordManualCheckin, manualCheckinInput } from "./checkin";
import { BookingError, createReservation } from "./reservations";
import app from "../app";

const prefix = `checkin-test-${randomUUID()}`;
const member = `${prefix}-member`, staff = `${prefix}-staff`, secondStaff = `${prefix}-second-staff`, admin = `${prefix}-admin`, stranger = `${prefix}-stranger`;
const p = `${prefix}-partner`, o = `${prefix}-offering`, r = `${prefix}-reservation`;
const nextOffering = `${prefix}-next`;
const requestReservation = `${prefix}-request-reservation`;
const manualReservation = `${prefix}-manual-reservation`;
const fraudOffering = `${prefix}-fraud-offering`, fraudReservation = `${prefix}-fraud-reservation`;
const mainFacilityProfile = `${prefix}-facility-profile`, otherFacilityProfile = `${prefix}-other-facility-profile`;
const users = [member, staff, secondStaff, admin, stranger];
const now = Date.now();
const reject = (f: () => Promise<unknown>, status: number) => assert.rejects(f, e => e instanceof BookingError && e.status === status);
const location = () => ({ latitude: 33.3, longitude: 44.4, accuracy: 5, capturedAt: new Date().toISOString() });
const openHoursAroundNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const time = (value: number) => {
    const normalized = (value + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  };
  return Array.from({ length: 7 }, (_, day) => ({
    day, closed: false, opensAt: time(minute - 10), closesAt: time(minute + 10),
  }));
};
const closedHours = () => Array.from({ length: 7 }, (_, day) => ({
  day, closed: true, opensAt: null, closesAt: null,
}));
test("secure attendance: authentication, partner scope, eligibility, atomic replay protection and audited reconciliation", async t => {
  await db.insert(partners).values({ id: p, name: prefix, groupId: prefix, ownerUserId: staff, approved: true });
  await db.insert(operators).values([
    { userId: staff, role: "partner", partnerId: p },
    { userId: secondStaff, role: "partner", partnerId: p },
    { userId: admin, role: "admin" },
  ]);
  await db.insert(facilityProfiles).values([
    {
      id: mainFacilityProfile, partnerId: p, city: "baghdad", facility: prefix,
      localizedName: { en: prefix, ar: "منشأة اختبارية", ku: "شوێنی تاقیکردنەوە" },
      localizedDistrict: { en: "Test district", ar: "منطقة اختبارية", ku: "ناوچەی تاقیکردنەوە" },
      localizedAddress: { en: "Test address", ar: "عنوان اختباري", ku: "ناونیشانی تاقیکردنەوە" },
      localizedDescription: { en: "Test facility", ar: "منشأة اختبارية", ku: "شوێنی تاقیکردنەوە" },
      activities: [], amenities: [], accessibility: [], openingHours: openHoursAroundNow(),
      contactPhone: null, websiteUrl: null, latitude: 33.3, longitude: 44.4,
    },
    {
      id: otherFacilityProfile, partnerId: p, city: "baghdad", facility: `${prefix}-other`,
      localizedName: { en: `${prefix} other`, ar: "منشأة اختبارية أخرى", ku: "شوێنێکی تاقیکردنەوەی تر" },
      localizedDistrict: { en: "Test district", ar: "منطقة اختبارية", ku: "ناوچەی تاقیکردنەوە" },
      localizedAddress: { en: "Test address", ar: "عنوان اختباري", ku: "ناونیشانی تاقیکردنەوە" },
      localizedDescription: { en: "Test facility", ar: "منشأة اختبارية", ku: "شوێنی تاقیکردنەوە" },
      activities: [], amenities: [], accessibility: [], openingHours: openHoursAroundNow(),
      contactPhone: null, websiteUrl: null, latitude: 33.5, longitude: 44.4,
    },
  ]);
  await db.insert(offerings).values({ id: o, targetId: o, kind: "session", title: prefix, scope: "live", partnerId: p,
    active: true, city: "baghdad", facility: prefix, category: "gym", tiers: ["M"], capacity: 3,
    startsAt: new Date(now - 60000), endsAt: new Date(now + 3600000), cancellationDeadline: new Date(now - 120000) });
  await db.insert(memberships).values({ userId: member, scope: "live", status: "trial", source: "trial", paymentStatus: "not_required", tier: "M",
    startsAt: new Date(now - 86400000), endsAt: new Date(now + 86400000),
    rules: { quota: 2, dailyLimit: 2, trialAllowedTypes: ["physical"] } });
  await db.insert(reservations).values({ id: r, userId: member, offeringId: o, status: "reserved" });
  await db.insert(offerings).values({ id: nextOffering, targetId: nextOffering, kind: "session", title: prefix, scope: "live", partnerId: p,
    active: true, city: "baghdad", facility: prefix, category: "gym", tiers: ["M"], capacity: 3,
    startsAt: new Date(now + 7200000), endsAt: new Date(now + 10800000), cancellationDeadline: new Date(now + 3600000) });
  await t.test("saving a reservation creates no attendance; unauthenticated API denied", async () => {
    assert.equal((await roster(member)).rows[0].status, "not_checked_in");
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const address = server.address() as { port: number };
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/attendance`)).status, 401);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  await t.test("partner rejection is scoped, reasoned, and only applies to a future request", async () => {
    await db.insert(reservations).values({
      id: requestReservation, userId: member, offeringId: nextOffering, status: "requested",
    });
    await reject(() => review(stranger, requestReservation, {
      action: "reject_request", reason: "Not an assigned partner",
    }), 403);
    await review(staff, requestReservation, {
      action: "reject_request", reason: "The requested session is unavailable",
    });
    const [booking] = await db.select().from(reservations).where(eq(reservations.id, requestReservation));
    assert.equal(booking.status, "partner_cancelled");
    assert.ok(booking.cancelledAt);
    const [decision] = await db.select().from(attendanceEvents).where(and(
      eq(attendanceEvents.reservationId, requestReservation),
      eq(attendanceEvents.action, "reject_request"),
    ));
    assert.equal(decision.before, "requested");
    assert.equal(decision.after, "partner_cancelled");
    assert.equal(decision.reason, "The requested session is unavailable");
    await reject(() => review(staff, requestReservation, {
      action: "reject_request", reason: "Reject the same request again",
    }), 409);
    await db.delete(attendanceEvents).where(eq(attendanceEvents.reservationId, requestReservation));
    await db.delete(reservations).where(eq(reservations.id, requestReservation));
  });
  await t.test("only assigned partner/admin may configure or issue; no policy fails closed", async () => {
    await reject(() => issueQr(stranger, r), 403);
    await reject(() => issueQr(staff, r), 409);
    await savePolicy(staff, r, { latitude: 33.3, longitude: 44.4, radius: 150,
      opensAt: new Date(now - 120000).toISOString(), closesAt: new Date(now + 3600000).toISOString(),
      correctionEndsAt: new Date(now + 86400000).toISOString() });
    assert.equal((await roster(stranger)).rows.length, 0);
  });
  let token: string;
  await t.test("requested, cancelled, sample, unapproved and expired memberships rejected", async () => {
    for (const status of ["requested", "cancelled", "partner_cancelled"]) {
      await db.update(reservations).set({ status }).where(eq(reservations.id, r));
      await reject(() => issueQr(staff, r), 409);
    }
    await db.update(reservations).set({ status: "reserved" }).where(eq(reservations.id, r));
    await db.update(offerings).set({ scope: "preview" }).where(eq(offerings.id, o));
    await reject(() => issueQr(staff, r), 403);
    await db.update(offerings).set({ scope: "live" }).where(eq(offerings.id, o));
    await db.update(partners).set({ approved: false }).where(eq(partners.id, p));
    await reject(() => issueQr(staff, r), 403);
    await db.update(partners).set({ approved: true }).where(eq(partners.id, p));
    await db.update(memberships).set({ status: "terminated" }).where(eq(memberships.userId, member));
    await reject(() => issueQr(staff, r), 403);
    await db.update(memberships).set({ status: "trial" }).where(eq(memberships.userId, member));
    await db.update(memberships).set({ paymentStatus: "paid" }).where(eq(memberships.userId, member));
    await reject(() => issueQr(staff, r), 403);
    await db.update(memberships).set({ source: "paid", paymentStatus: "past_due" }).where(eq(memberships.userId, member));
    await reject(() => issueQr(staff, r), 403);
    await db.update(memberships).set({ paymentStatus: "paid" }).where(eq(memberships.userId, member));
    await issueQr(staff, r);
    await db.update(memberships).set({ source: "trial", paymentStatus: "not_required" }).where(eq(memberships.userId, member));
    token = (await issueQr(staff, r))!.token;
  });
  await t.test("owner, forged/old QR, geofence, accuracy, stale and mocked location enforced", async () => {
    assert.equal(scanInput.safeParse({ token, ...location(), latitude: 500 }).success, false);
    assert.equal(scanInput.safeParse({ token, ...location(), accuracy: 101 }).success, false);
    await reject(() => scanQr(stranger, { token, ...location() }), 403);
    await reject(() => scanQr(member, { token: `MDG1:${"0".repeat(64)}`, ...location() }), 400);
    await reject(() => scanQr(member, { token, ...location(), latitude: 32 }), 403);
    await reject(() => scanQr(member, { token, ...location(), latitude: 33.301, accuracy: 100 }), 403);
    await reject(() => scanQr(member, { token, ...location(), mocked: true }), 403);
    await reject(() => scanQr(member, { token, ...location(), capturedAt: new Date(now - 120000).toISOString() }), 403);
    const previous = token; token = (await issueQr(staff, r))!.token;
    await reject(() => scanQr(member, { token: previous, ...location() }), 409);
    await issueQr(staff, r, true);
    await reject(() => scanQr(member, { token, ...location() }), 409);
    token = (await issueQr(staff, r))!.token;
    await db.update(checkinChallenges).set({ expiresAt: new Date(now - 1000) }).where(eq(checkinChallenges.reservationId, r));
    await reject(() => scanQr(member, { token, ...location() }), 409);
    token = (await issueQr(staff, r))!.token;
  });
  await t.test("window and quota rechecked at scan time", async () => {
    await db.update(checkinPolicies).set({ opensAt: new Date(now + 600000) }).where(eq(checkinPolicies.offeringId, o));
    await reject(() => scanQr(member, { token, ...location() }), 409);
    await db.update(checkinPolicies).set({ opensAt: new Date(now - 120000) }).where(eq(checkinPolicies.offeringId, o));
    await db.update(checkinPolicies).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(checkinPolicies.offeringId, o));
    await reject(() => scanQr(member, { token, ...location() }), 409);
    await db.update(checkinPolicies).set({ closesAt: new Date(now + 3600000) }).where(eq(checkinPolicies.offeringId, o));
    await db.update(memberships).set({ rules: { quota: 0, dailyLimit: 2, trialAllowedTypes: ["physical"] } }).where(eq(memberships.userId, member));
    await reject(() => scanQr(member, { token, ...location() }), 403);
    await db.update(memberships).set({ rules: { quota: 2, dailyLimit: 2, trialAllowedTypes: ["physical"] } }).where(eq(memberships.userId, member));
  });
  await t.test("QR and manual arrival are blocked while facility hours are closed", async () => {
    await db.update(facilityProfiles).set({ openingHours: closedHours() }).where(eq(facilityProfiles.id, mainFacilityProfile));
    try {
      await reject(() => issueQr(staff, r), 409);
      await reject(() => scanQr(member, { token, ...location() }), 409);
      await reject(() => issueManualCheckinCode(member, r), 409);
      await db.update(facilityProfiles).set({ openingHours: [] }).where(eq(facilityProfiles.id, mainFacilityProfile));
      await reject(() => issueQr(staff, r), 409);
    } finally {
      await db.update(facilityProfiles).set({ openingHours: openHoursAroundNow() })
        .where(eq(facilityProfiles.id, mainFacilityProfile));
    }
  });
  await t.test("simultaneous replay creates exactly one pending arrival, no automatic attendance", async () => {
    const results = await Promise.allSettled([scanQr(member, { token, ...location() }), scanQr(member, { token, ...location() })]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    const rows = await db.select().from(attendance).where(eq(attendance.reservationId, r));
    assert.equal(rows.length, 1); assert.equal(rows[0].status, "pending"); assert.equal(rows[0].settlementEligible, false);
    assert.equal((await db.select().from(reservations).where(eq(reservations.id, r)))[0].status, "reserved");
  });
  await t.test("rapid check-in and impossible travel are rejected", async () => {
    const at = Date.now();
    await db.insert(offerings).values({ id: fraudOffering, targetId: fraudOffering, kind: "session", title: prefix,
      scope: "live", partnerId: p, active: true, city: "baghdad", facility: `${prefix}-other`,
      category: "gym", tiers: ["M"], capacity: 3,
      startsAt: new Date(at - 60000), endsAt: new Date(at + 3600000),
      cancellationDeadline: new Date(at - 120000) });
    await db.insert(reservations).values({ id: fraudReservation, userId: member, offeringId: fraudOffering, status: "reserved" });

    try {
      await savePolicy(staff, fraudReservation, { latitude: 33.3, longitude: 44.4, radius: 150,
        opensAt: new Date(at - 120000).toISOString(), closesAt: new Date(at + 3600000).toISOString(),
        correctionEndsAt: new Date(at + 86400000).toISOString() });
      const fraudToken = (await issueQr(staff, fraudReservation))!.token;

      await reject(() => scanQr(member, { token: fraudToken, ...location() }), 409);

      await db.update(attendance).set({ checkedInAt: new Date(Date.now() - 120000) })
        .where(eq(attendance.reservationId, r));
      await db.update(checkinPolicies).set({ latitude: 33.5 }).where(eq(checkinPolicies.offeringId, fraudOffering));
      await reject(() => scanQr(member, {
        token: fraudToken, ...location(), latitude: 33.5,
      }), 409);
    } finally {
      await db.delete(attendanceEvents).where(eq(attendanceEvents.reservationId, fraudReservation));
      await db.delete(checkinChallenges).where(eq(checkinChallenges.reservationId, fraudReservation));
      await db.delete(attendance).where(eq(attendance.reservationId, fraudReservation));
      await db.delete(checkinPolicies).where(eq(checkinPolicies.offeringId, fraudOffering));
      await db.delete(reservations).where(eq(reservations.id, fraudReservation));
      await db.delete(offerings).where(eq(offerings.id, fraudOffering));
    }
  });
  await t.test("partner confirmation, member dispute, admin correction and locking are auditable", async () => {
    await reject(() => review(stranger, r, { action: "confirm", reason: "Not authorized" }), 403);
    await db.update(memberships).set({ endsAt: new Date(now - 1) }).where(eq(memberships.userId, member));
    await review(staff, r, { action: "confirm", reason: "Member present at desk" });
    assert.equal((await roster(member)).rows[0].settlementEligible, true);
    await review(member, r, { action: "dispute", reason: "Attendance needs review" });
    assert.equal((await roster(member)).rows[0].settlementEligible, false);
    await reject(() => review(staff, r, { action: "resolve_confirm", reason: "Not an administrator" }), 403);
    await review(admin, r, { action: "resolve_confirm", reason: "Verified evidence with partner" });
    await db.update(memberships).set({ endsAt: new Date(now + 86400000),
      rules: { quota: 1, dailyLimit: 1, trialAllowedTypes: ["physical"] } }).where(eq(memberships.userId, member));
    await reject(() => createReservation(member, { kind: "session", targetId: nextOffering, slot: "" }), 403);
    await review(staff, r, { action: "void", reason: "Incorrect attendance correction" });
    const replacement = await createReservation(member, { kind: "session", targetId: nextOffering, slot: "" });
    assert.equal(replacement.status, "reserved", "Voiding the visit must release its reserved allowance");
    await db.delete(reservations).where(eq(reservations.id, replacement.id));
    const row = (await roster(member)).rows[0];
    assert.equal(row.status, "void"); assert.equal(row.settlementEligible, false); assert.ok(row.events.length >= 6);
    await db.update(checkinPolicies).set({ correctionEndsAt: new Date(now - 1) }).where(eq(checkinPolicies.offeringId, o));
    assert.equal((await roster(member)).rows[0].locked, true);
    await reject(() => review(admin, r, { action: "dispute", reason: "Too late to change" }), 409);
  });
  await t.test("no-show only after window and never for an existing arrival", async () => {
    await db.update(checkinPolicies).set({ correctionEndsAt: new Date(now + 86400000) }).where(eq(checkinPolicies.offeringId, o));
    await reject(() => review(staff, r, { action: "no_show", reason: "Must not overwrite arrival" }), 409);
    await db.delete(attendance).where(eq(attendance.reservationId, r));
    await db.update(reservations).set({ status: "reserved", cancelledAt: null }).where(eq(reservations.id, r));
    await reject(() => review(staff, r, { action: "no_show", reason: "Window still open" }), 409);
    await db.update(checkinPolicies).set({ closesAt: new Date(now - 1) }).where(eq(checkinPolicies.offeringId, o));
    await review(staff, r, { action: "no_show", reason: "Checked roster after close" });
    assert.equal((await roster(member)).rows[0].status, "no_show");
    await reject(() => createReservation(member, { kind: "session", targetId: nextOffering, slot: "" }), 403);
    await review(member, r, { action: "dispute", reason: "I was present at the session" });
    await reject(() => review(admin, r, { action: "resolve_confirm", reason: "No arrival evidence exists" }), 409);
    await review(admin, r, { action: "resolve_void", reason: "No-show charge waived" });
    const replacement = await createReservation(member, { kind: "session", targetId: nextOffering, slot: "" });
    assert.equal(replacement.status, "reserved", "Waiving a disputed no-show must release its reserved allowance");
  });
  await t.test("manual arrival codes are reservation-bound, single-use, attempt-limited and independently confirmed", async () => {
    const windowNow = new Date();
    await db.update(checkinPolicies).set({
      opensAt: new Date(windowNow.getTime() - 120000),
      closesAt: new Date(windowNow.getTime() + 3600000),
      correctionEndsAt: new Date(windowNow.getTime() + 86400000),
    }).where(eq(checkinPolicies.offeringId, o));
    await db.update(memberships).set({
      endsAt: new Date(windowNow.getTime() + 86400000),
      rules: { quota: 10, dailyLimit: 10, trialAllowedTypes: ["physical"] },
    }).where(eq(memberships.userId, member));
    await db.insert(reservations).values({ id: manualReservation, userId: member, offeringId: o, status: "reserved" });

    await reject(() => issueManualCheckinCode(stranger, manualReservation), 403);
    assert.equal(manualCheckinInput.safeParse({ code: "12345678", reason: "   " }).success, false,
      "manual exception reason must not be blank");
    await db.update(memberships).set({ status: "terminated" }).where(eq(memberships.userId, member));
    await reject(() => issueManualCheckinCode(member, manualReservation), 403);
    await db.update(memberships).set({ status: "trial" }).where(eq(memberships.userId, member));
    const first = await issueManualCheckinCode(member, manualReservation);
    assert.match(first.code, /^\d{8}$/);
    await reject(() => recordManualCheckin(stranger, manualReservation, {
      code: first.code, reason: "Member is present at the desk",
    }), 403);
    await reject(() => recordManualCheckin(admin, manualReservation, {
      code: first.code, reason: "Member is present at the desk",
    }), 403);

    const wrongCode = first.code === "00000000" ? "11111111" : "00000000";
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await recordManualCheckin(staff, manualReservation, {
        code: wrongCode, reason: "Member is present at the desk",
      });
      assert.equal(result.ok, false);
      assert.equal(result.exhausted, attempt === 4);
    }
    const [exhausted] = await db.select().from(manualCheckinChallenges)
      .where(eq(manualCheckinChallenges.reservationId, manualReservation));
    assert.equal(exhausted.attempts, 5);
    assert.ok(exhausted.consumedAt);

    await db.update(manualCheckinChallenges).set({ createdAt: new Date(Date.now() - 31000) })
      .where(eq(manualCheckinChallenges.id, exhausted.id));
    const second = await issueManualCheckinCode(member, manualReservation);
    await db.update(facilityProfiles).set({ openingHours: closedHours() })
      .where(eq(facilityProfiles.id, mainFacilityProfile));
    await reject(() => recordManualCheckin(staff, manualReservation, {
      code: second.code, reason: "Member is present at the desk",
    }), 409);
    await db.update(facilityProfiles).set({ openingHours: openHoursAroundNow() })
      .where(eq(facilityProfiles.id, mainFacilityProfile));
    const result = await recordManualCheckin(staff, manualReservation, {
      code: second.code, reason: "Member is present at the desk",
    });
    assert.equal(result.ok, true);
    const [arrival] = await db.select().from(attendance).where(eq(attendance.reservationId, manualReservation));
    assert.equal(arrival.status, "pending");
    assert.equal(arrival.settlementEligible, false);
    const [manualEventBeforeReview] = await db.select().from(attendanceEvents).where(and(
      eq(attendanceEvents.reservationId, manualReservation), eq(attendanceEvents.action, "manual.checkin"),
    ));
    await reject(() => review(staff, manualReservation, {
      action: "confirm", reason: "Manual arrival requires another staff member",
    }), 403);
    assert.equal((await roster(member)).rows.find(row => row.reservationId === manualReservation)?.settlementEligible, false);
    // A prior staff-assisted arrival makes this new exception visibly repeat use.
    await db.insert(attendanceEvents).values({
      id: randomUUID(), reservationId: r, actorId: staff, action: "manual.checkin",
      before: "not_checked_in", after: "prior-manual-visit", reason: "Prior manually verified visit",
    });
    let memberRow = (await roster(member)).rows.find(row => row.reservationId === manualReservation)!;
    assert.equal(memberRow.manualCheckin, true);
    assert.equal(memberRow.manualRepeatUse, true);
    assert.equal(memberRow.settlementEligible, false);
    await review(secondStaff, manualReservation, { action: "confirm", reason: "Second assigned staff member verified arrival" });
    memberRow = (await roster(member)).rows.find(row => row.reservationId === manualReservation)!;
    assert.equal(memberRow.settlementEligible, true);
    const [manualEventAfterReview] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, manualEventBeforeReview.id));
    assert.deepEqual(manualEventAfterReview, manualEventBeforeReview,
      "review appends a new audit event and does not change the original manual check-in event");
  });
});
after(async () => {
  await db.delete(attendanceEvents).where(eq(attendanceEvents.reservationId, manualReservation));
  await db.delete(manualCheckinChallenges).where(eq(manualCheckinChallenges.reservationId, manualReservation));
  await db.delete(attendance).where(eq(attendance.reservationId, manualReservation));
  await db.delete(reservations).where(eq(reservations.id, manualReservation));
  await db.delete(attendanceEvents).where(eq(attendanceEvents.reservationId, r));
  await db.delete(checkinChallenges).where(eq(checkinChallenges.reservationId, r));
  await db.delete(attendance).where(eq(attendance.reservationId, r));
  await db.delete(checkinPolicies).where(eq(checkinPolicies.offeringId, o));
  await db.delete(reservations).where(inArray(reservations.offeringId, [o, nextOffering]));
  await db.delete(offerings).where(inArray(offerings.id, [o, nextOffering]));
  await db.delete(facilityProfiles).where(inArray(facilityProfiles.id, [mainFacilityProfile, otherFacilityProfile]));
  await db.delete(memberships).where(inArray(memberships.userId, users));
  await db.delete(operators).where(inArray(operators.userId, users));
  await db.delete(partners).where(eq(partners.id, p));
  await pool.end();
});
