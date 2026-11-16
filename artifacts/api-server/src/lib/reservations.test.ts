import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, offerings, memberships, reservations, waitlistEntries, attendance, memberProfiles, memberConsentEvents, partners, operators, membershipPlans, accessGrants, operationAudit, learningCourses, learningLessons, courseEnrollments, lessonProgress, facilityProfiles, accountAccessRestrictions } from "@workspace/db";
import express from "express";
import operationsRouter from "../routes/operations";
import memberRouter from "../routes/member";
import publicRouter from "../routes/public";
import { createReservation, cancelReservation, memberState, memberAccountSummary, joinWaitlist, leaveWaitlist, acceptWaitlistOffer, processWaitlistQueue, BookingError } from "./reservations";
import app from "../app";
import { MEMBER_CONSENT_REQUIRED_CODE } from "./member-consents";

const prefix = `test-${randomUUID()}`;
const alice = `${prefix}-a`, bob = `${prefix}-b`, charlie = `${prefix}-c`;
const consentless = `${prefix}-consentless`;
const ids: string[] = [];
const waitlistUsers: string[] = [];
const partnerIds: string[] = [], planIds: string[] = [];
const courseIds: string[] = [];
const now = Date.now();
const input = (targetId: string) => ({ kind: "session", targetId, slot: "" });
async function offer(overrides: Partial<typeof offerings.$inferInsert> = {}) {
  const id = `${prefix}-${ids.length}`;
  ids.push(id);
  await db.insert(offerings).values({
    id, targetId: id, kind: "session", slot: "", title: "Isolated test offering", scope: prefix,
    active: true, city: "baghdad", facility: "test", category: "physical", tiers: ["M"],
    startsAt: new Date(now + 86400000), endsAt: new Date(now + 90000000),
    cancellationDeadline: new Date(now + 80000000), capacity: 5, ...overrides,
  });
  return id;
}
async function membership(userId: string) {
  await db.insert(memberships).values({
    userId, scope: prefix, tier: "M", status: "active", paymentStatus: "paid",
    startsAt: new Date(now - 86400000), endsAt: new Date(now + 10 * 86400000), rules: { quota: 20, dailyLimit: 20 },
  });
  await db.insert(memberConsentEvents).values(["terms_of_use", "privacy_policy"].map(purpose => ({
    id: `${prefix}-${userId}-${purpose}`,
    userId,
    purpose: purpose as "terms_of_use" | "privacy_policy",
    policyVersion: "v1-draft",
    choice: "accepted" as const,
  }))).onConflictDoNothing();
}
async function rejects(fn: () => Promise<unknown>, status: number) {
  await assert.rejects(fn, (e: unknown) => e instanceof BookingError && e.status === status);
}
test("authenticated booking service: ownership, durable history, eligibility and concurrency", async t => {
  await membership(alice); await membership(bob);
  const id = await offer();
  let bookingId: string;
  await t.test("persist reservation and reload it from the central database", async () => {
    const result = await createReservation(alice, input(id)); bookingId = result.id;
    const state = await memberState(alice);
    assert.equal(state.bookings.find(b => b.id === result.id)?.status, "reserved");
    const account = await memberAccountSummary(alice);
    assert.deepEqual(Object.keys(account).sort(), ["bookings", "memberships"]);
    assert.equal(account.bookings.find(b => b.id === result.id)?.status, "reserved");
    assert.equal(Object.hasOwn(account, "profile"), false);
    const again = await memberState(alice);
    assert.deepEqual(again.bookings, state.bookings);
  });
  await t.test("current Terms and Privacy consent is required before a booking", async () => {
    await membership(consentless);
    await db.delete(memberConsentEvents).where(eq(memberConsentEvents.userId, consentless));
    const consentOffer = await offer();
    const requireConsent = (error: unknown) => error instanceof BookingError
      && error.status === 403
      && error.code === MEMBER_CONSENT_REQUIRED_CODE
      && error.message.includes("Terms of Use and Privacy Policy");
    await assert.rejects(
      createReservation(consentless, input(consentOffer)),
      requireConsent,
    );
    await db.insert(memberConsentEvents).values(["terms_of_use", "privacy_policy"].map(purpose => ({
      id: `${prefix}-${consentless}-${purpose}-old`,
      userId: consentless,
      purpose: purpose as "terms_of_use" | "privacy_policy",
      policyVersion: "expired-v0",
      choice: "accepted" as const,
    })));
    await assert.rejects(createReservation(consentless, input(consentOffer)), requireConsent);
    await db.delete(memberConsentEvents).where(eq(memberConsentEvents.userId, consentless));
    await db.insert(memberConsentEvents).values(["terms_of_use", "privacy_policy"].map(purpose => ({
      id: `${prefix}-${consentless}-${purpose}-current`,
      userId: consentless,
      purpose: purpose as "terms_of_use" | "privacy_policy",
      policyVersion: "v1-draft",
      choice: "accepted" as const,
    })));
    assert.equal((await createReservation(consentless, input(consentOffer))).status, "reserved");
  });
  await t.test("other accounts cannot list or cancel an owner's reservation", async () => {
    assert.equal((await memberState(bob)).bookings.length, 0);
    await rejects(() => cancelReservation(bob, bookingId), 404);
    assert.equal((await memberState(alice)).bookings[0].status, "reserved");
  });
  await t.test("duplicate prevention and reservation is not attendance", async () => {
    await rejects(() => createReservation(alice, input(id)), 409);
    assert.equal((await db.select().from(attendance).where(eq(attendance.userId, alice))).length, 0);
  });
  await t.test("cancellation is persistent, idempotent, and allows rebooking with retained history", async () => {
    await cancelReservation(alice, bookingId); await cancelReservation(alice, bookingId);
    assert.equal((await memberState(alice)).bookings[0].status, "cancelled");
    const second = await createReservation(alice, input(id));
    assert.notEqual(second.id, bookingId);
    assert.equal((await memberState(alice)).bookings.length, 2);
    await cancelReservation(alice, second.id);
  });
  await t.test("missing, inactive, expired, unpaid and ineligible memberships are rejected", async () => {
    await rejects(() => createReservation(`${prefix}-outsider`, input(id)), 403);
    for (const patch of [
      { status: "paused" }, { status: "expired" }, { status: "suspended" }, { paymentStatus: "overdue" },
      { endsAt: new Date(now - 1) }, { tier: "XL" },
      { rules: { quota: 20, dailyLimit: 20, cities: ["basra"] } },
      { rules: { quota: 20, dailyLimit: 20, facilities: ["other"] } },
      { rules: { quota: 20, dailyLimit: 20, categories: ["other"] } },
      { rules: { quota: 0, dailyLimit: 20 } }, { rules: { quota: 20, dailyLimit: 0 } },
      { rules: { quota: 20, dailyLimit: 20, facilityLimits: { test: 0 } } },
    ]) {
      await db.update(memberships).set(patch).where(eq(memberships.userId, alice));
      await rejects(() => createReservation(alice, input(id)), 403);
      await db.delete(memberships).where(eq(memberships.userId, alice)); await membership(alice);
    }
  });
  await t.test("capacity remains correct under concurrent attempts", async () => {
    const one = await offer({ capacity: 1 });
    const results = await Promise.allSettled([createReservation(alice, input(one)), createReservation(bob, input(one))]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected").length, 1);
  });
  await t.test("gender and age restrictions fail closed until profile is eligible", async () => {
    const restricted = await offer({ gender: "female", minAge: 18 });
    await rejects(() => createReservation(alice, input(restricted)), 403);
    await db.insert(memberProfiles).values({ userId: alice, gender: "male", birthDate: "2000-01-01" });
    await rejects(() => createReservation(alice, input(restricted)), 403);
    await db.update(memberProfiles).set({ gender: "female", birthDate: new Date(now - 365 * 86400000).toISOString().slice(0, 10) }).where(eq(memberProfiles.userId, alice));
    await rejects(() => createReservation(alice, input(restricted)), 403);
    await db.update(memberProfiles).set({ birthDate: "2000-01-01" }).where(eq(memberProfiles.userId, alice));
    assert.equal((await createReservation(alice, input(restricted))).status, "reserved");
  });
  await t.test("invalid slots, unavailable offers, extra payment, scope and deadlines are enforced", async () => {
    await rejects(() => createReservation(alice, { ...input(id), slot: "fake" }), 404);
    await rejects(async () => createReservation(alice, input(await offer({ active: false }))), 404);
    await rejects(async () => createReservation(alice, input(await offer({ scope: "live" }))), 403);
    await rejects(async () => createReservation(alice, input(await offer({ additionalPayment: true }))), 403);
    await rejects(async () => createReservation(alice, input(await offer({ startsAt: new Date(now - 1) }))), 409);
    const late = await createReservation(alice, input(await offer({ cancellationDeadline: new Date(now - 1) })));
    await rejects(() => cancelReservation(alice, late.id), 409);
  });
  await t.test("a booking cutoff closes reservations before the activity starts", async () => {
    const startsAt = new Date(Date.now() + 30 * 60_000);
    const cutoffOffer = await offer({
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      cancellationDeadline: new Date(startsAt.getTime() - 15 * 60_000),
      bookingCutoffMinutes: 60,
    });
    await rejects(() => createReservation(alice, input(cutoffOffer)), 409);
  });
  await t.test("live booking requires a verified paid grant while trial access remains unpaid", async () => {
    const livePartner = `${prefix}-payment-partner`;
    partnerIds.push(livePartner);
    await db.insert(partners).values({
      id: livePartner, name: "Payment test partner", groupId: `${prefix}-payment-group`,
      ownerUserId: `${prefix}-payment-owner`, approved: true,
    });
    const paidOffering = await offer({ scope: "live", partnerId: livePartner, accessType: "physical" });
    const secondOffering = await offer({ scope: "live", partnerId: livePartner, accessType: "physical" });
    await db.insert(memberships).values({
      userId: alice, scope: "live", status: "active", source: "paid", paymentStatus: "paid", tier: "M",
      startsAt: new Date(now - 86400000), endsAt: new Date(now + 10 * 86400000),
      rules: { quota: 2, dailyLimit: 10, trialAllowedTypes: ["physical"] },
    });
    assert.equal((await createReservation(alice, input(paidOffering))).status, "reserved");

    const freeEvent = await offer({
      kind: "event", scope: "live", partnerId: livePartner, accessType: "physical",
      additionalPayment: false,
    });
    const quotaOffering = await offer({ scope: "live", partnerId: livePartner, accessType: "physical" });
    const eventInput = { kind: "event", targetId: freeEvent, slot: "" };
    const eventReservation = await createReservation(alice, eventInput);
    assert.equal(eventReservation.status, "reserved");
    const savedEvent = (await memberState(alice)).bookings.find(booking => booking.id === eventReservation.id);
    assert.equal(savedEvent?.kind, "event");
    assert.equal(savedEvent?.city, "baghdad");
    assert.equal(savedEvent?.facility, "test");
    await rejects(() => createReservation(`${prefix}-event-outsider`, eventInput), 403);
    await rejects(() => createReservation(alice, input(quotaOffering)), 403);
    await cancelReservation(alice, eventReservation.id);
    const quotaReservation = await createReservation(alice, input(quotaOffering));
    assert.equal(quotaReservation.status, "reserved");
    await cancelReservation(alice, quotaReservation.id);

    const paidEvent = await offer({
      kind: "event", scope: "live", partnerId: livePartner, accessType: "physical",
      additionalPayment: true,
    });
    await rejects(() => createReservation(alice, { kind: "event", targetId: paidEvent, slot: "" }), 403);

    await db.update(memberships).set({ paymentStatus: "not_required" })
      .where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
    await rejects(() => createReservation(alice, input(secondOffering)), 403);

    await db.update(memberships).set({ source: "trial", paymentStatus: "paid" })
      .where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
    await rejects(() => createReservation(alice, input(secondOffering)), 403);
    await db.update(memberships).set({ paymentStatus: "not_required" })
      .where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
    assert.equal((await createReservation(alice, input(secondOffering))).status, "reserved");
    await db.delete(reservations).where(inArray(reservations.offeringId, [paidOffering, secondOffering]));
    await db.delete(memberships).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
  });

  await t.test("coaching is requested, never confirmed or attended", async () => {
    const coach = await offer({ kind: "coach", slot: "slot-1" });
    const row = await createReservation(alice, { kind: "coach", targetId: coach, slot: "slot-1" });
    assert.equal(row.status, "requested");
  });
});
test("live session waitlists preserve order, offer cancelled places, and hand off expired offers", async () => {
  const owner = `${prefix}-wait-owner`, first = `${prefix}-wait-first`, second = `${prefix}-wait-second`, third = `${prefix}-wait-third`;
  const partnerId = `${prefix}-wait-partner`;
  waitlistUsers.push(owner, first, second, third);
  partnerIds.push(partnerId);
  await db.insert(partners).values({ id: partnerId, name: "Waitlist test partner", groupId: prefix, ownerUserId: owner, approved: true });
  for (const userId of waitlistUsers) await db.insert(memberships).values({
    userId, scope: "live", status: "active", source: "paid", paymentStatus: "paid", tier: "M",
    startsAt: new Date(now - 86400000), endsAt: new Date(now + 10 * 86400000),
    rules: { quota: 10, dailyLimit: 10 },
  });
  await db.insert(memberConsentEvents).values(waitlistUsers.flatMap(userId =>
    (["terms_of_use", "privacy_policy"] as const).map(purpose => ({
      id: `${prefix}-${userId}-${purpose}`,
      userId,
      purpose,
      policyVersion: "v1-draft",
      choice: "accepted" as const,
    })),
  ));

  const liveOffer = (overrides: Partial<typeof offerings.$inferInsert> = {}) => offer({
    scope: "live", partnerId, capacity: 1, ...overrides,
  });
  const firstOffering = await liveOffer();
  const original = await createReservation(owner, input(firstOffering));
  const firstEntry = await joinWaitlist(first, firstOffering);
  const secondEntry = await joinWaitlist(second, firstOffering);
  const thirdEntry = await joinWaitlist(third, firstOffering);
  assert.equal(firstEntry.queuePosition, 1);
  assert.equal(secondEntry.queuePosition, 2);
  assert.equal(thirdEntry.queuePosition, 3);
  await cancelReservation(owner, original.id);
  assert.equal((await memberState(first)).waitlists.find(row => row.id === firstEntry.id)?.status, "offered");
  assert.equal((await memberState(second)).waitlists.find(row => row.id === secondEntry.id)?.status, "waiting");
  assert.equal((await memberState(third)).waitlists.find(row => row.id === thirdEntry.id)?.status, "waiting");
  await rejects(() => createReservation(third, input(firstOffering)), 409);
  assert.equal(await acceptWaitlistOffer(first, firstEntry.id), true);
  assert.equal((await memberState(first)).waitlists.find(row => row.id === firstEntry.id)?.status, "booked");
  assert.ok((await memberState(first)).bookings.some(row => row.targetId === firstOffering && row.status === "reserved"));

  const secondOffering = await liveOffer();
  const secondOriginal = await createReservation(owner, input(secondOffering));
  const expiring = await joinWaitlist(first, secondOffering);
  const next = await joinWaitlist(second, secondOffering);
  await cancelReservation(owner, secondOriginal.id);
  await db.update(waitlistEntries).set({ offerExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(waitlistEntries.id, expiring.id));
  await processWaitlistQueue(new Date(), [secondOffering]);
  assert.equal((await memberState(first)).waitlists.find(row => row.id === expiring.id)?.status, "expired");
  assert.equal((await memberState(second)).waitlists.find(row => row.id === next.id)?.status, "offered");
  assert.equal(await leaveWaitlist(second, next.id), true);
  assert.equal((await memberState(second)).waitlists.find(row => row.id === next.id)?.status, "left");
});
test("HTTP endpoints reject unauthenticated access and forged bearer tokens", async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  try {
    for (const headers of [{}, { authorization: "Bearer invalid-forged-token" }]) {
      for (const path of ["/api/member", "/api/member/account"]) {
        const res = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers });
        assert.equal(res.status, 401);
      }
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("web account summary is authenticated but does not require a registered mobile device", async () => {
  const harness = express();
  harness.use((req, _res, next) => {
    Object.assign(req, { auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ) });
    next();
  });
  harness.use("/api/member", memberRouter);
  const server = harness.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const staleUser = `${prefix}-stale-consent`;
  const noConsentUser = `${prefix}-no-consent-http`;
  try {
    for (const path of ["/account", "/allowances"]) {
      const blocked = await fetch(`http://127.0.0.1:${address.port}/api/member${path}`, {
        headers: { "x-test-user": noConsentUser },
      });
      assert.equal(blocked.status, 403);
      assert.equal((await blocked.json() as { code: string }).code, MEMBER_CONSENT_REQUIRED_CODE);
    }
    const consentChoices = await fetch(`http://127.0.0.1:${address.port}/api/member/consents`, {
      headers: { "x-test-user": noConsentUser },
    });
    assert.equal(consentChoices.status, 200);
    assert.equal((await consentChoices.json() as { requiredAccepted: boolean }).requiredAccepted, false);
    const privacyRequests = await fetch(`http://127.0.0.1:${address.port}/api/member/privacy-requests`, {
      headers: { "x-test-user": noConsentUser },
    });
    assert.equal(privacyRequests.status, 200);
    const unavailableExport = await fetch(`http://127.0.0.1:${address.port}/api/member/privacy-requests/not-found/export`, {
      headers: { "x-test-user": noConsentUser },
    });
    assert.equal(unavailableExport.status, 404);

    await db.insert(memberConsentEvents).values(["terms_of_use", "privacy_policy"].map(purpose => ({
      id: `${staleUser}-${purpose}`,
      userId: staleUser,
      purpose: purpose as "terms_of_use" | "privacy_policy",
      policyVersion: "expired-v0",
      choice: "accepted" as const,
    })));
    const outdatedAccount = await fetch(`http://127.0.0.1:${address.port}/api/member/account`, {
      headers: { "x-test-user": staleUser },
    });
    assert.equal(outdatedAccount.status, 403);
    assert.equal((await outdatedAccount.json() as { code: string }).code, MEMBER_CONSENT_REQUIRED_CODE);

    const accountResponse = await fetch(`http://127.0.0.1:${address.port}/api/member/account`, {
      headers: { "x-test-user": alice },
    });
    assert.equal(accountResponse.status, 200);
    const account = await accountResponse.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(account).sort(), ["accessRestricted", "bookings", "memberships"]);
    assert.equal(account.accessRestricted, false);

    const internalReason = "internal administrator review note";
    await db.insert(accountAccessRestrictions).values({
      entityType: "member",
      entityId: alice,
      status: "suspended",
      reason: internalReason,
      updatedBy: `${prefix}-admin`,
    });
    const suspendedResponse = await fetch(`http://127.0.0.1:${address.port}/api/member/account`, {
      headers: { "x-test-user": alice },
    });
    assert.equal(suspendedResponse.status, 200);
    const suspendedAccount = await suspendedResponse.json() as Record<string, unknown>;
    assert.equal(suspendedAccount.accessRestricted, true);
    assert.equal(JSON.stringify(suspendedAccount).includes(internalReason), false);
  } finally {
    await db.delete(memberConsentEvents).where(eq(memberConsentEvents.userId, staleUser));
    await db.delete(accountAccessRestrictions).where(eq(accountAccessRestrictions.entityId, alice));
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
test("live operations: staff scope, approved inventory, server grants and quota models", async t => {
  const adminId = `${prefix}-partner-ops-admin`, partnerUser = `${prefix}-partner`;
  const supportAdminId = `${prefix}-support-admin`;
  const financeAdminId = `${prefix}-finance-admin`;
  const contentAdminId = `${prefix}-content-admin`;
  const complianceAdminId = `${prefix}-compliance-admin`;
  const legacyAdminId = `${prefix}-legacy-admin`;
  const harness = express();
  harness.use(express.json());
  // Isolated in-process harness only. Production app still verifies Clerk bearer tokens.
  harness.use((req, _res, next) => {
    Object.assign(req, { auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ) });
    next();
  });
  harness.use("/operations", operationsRouter); harness.use("/member", memberRouter); harness.use("/public", publicRouter);
  const server = harness.listen(0);
  await new Promise<void>(r => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const call = async (path: string, user = adminId, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method,
      headers: { "Content-Type": "application/json", "x-test-user": user },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  };
    const publishOffering = async (offeringId: string) => {
      const submitted = await call(`/operations/offerings/${offeringId}/submit`, partnerUser, "POST");
      assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
      for (const status of ["under_review", "approved", "published"] as const) {
        const reviewed = await call(`/operations/offerings/${offeringId}/review`, adminId, "PATCH", { status });
        assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
      }
    };
  await db.insert(operators).values([
    { userId: adminId, role: "partner_operations_admin" },
    { userId: supportAdminId, role: "customer_support_admin" },
    { userId: financeAdminId, role: "finance_admin" },
    { userId: contentAdminId, role: "content_admin" },
    { userId: complianceAdminId, role: "fraud_compliance_admin" },
    { userId: legacyAdminId, role: "admin" },
  ]);
  try {
    assert.equal((await call("/operations", alice)).status, 403);
    assert.equal((await call("/operations/partners", legacyAdminId, "POST", {
      name: "Legacy administrator must not inherit access", groupId: prefix, ownerUserId: partnerUser,
    })).status, 403);
    const p = await call("/operations/partners", adminId, "POST", { name: "Isolated test partner", groupId: prefix, ownerUserId: partnerUser });
    assert.equal(p.status, 201); partnerIds.push(p.data.id);
    const offerBody = { partnerId: p.data.id, title: "Isolated live test", kind: "session", city: "baghdad", facility: prefix,
      category: "fitness", accessType: "physical", tiers: ["M"], startsAt: new Date(now + 86400000).toISOString(),
      endsAt: new Date(now + 90000000).toISOString(), cancellationDeadline: new Date(now + 80000000).toISOString(), capacity: 2, active: false };
    await t.test("partner cannot self-approve, manage plans, or publish unapproved inventory", async () => {
      assert.equal((await call(`/operations/partners/${p.data.id}`, partnerUser, "PATCH", { approved: true })).status, 403);
      assert.equal((await call("/operations/plans", partnerUser, "POST", {})).status, 403);
      assert.equal((await call("/operations/offerings", partnerUser, "POST", { ...offerBody, active: true })).status, 403);
      assert.equal((await call("/operations/offerings", partnerUser, "POST", { ...offerBody, partnerId: "other" })).status, 403);
      const approval = await call(`/operations/partners/${p.data.id}`, adminId, "PATCH", { approved: true });
      assert.equal(approval.status, 200, JSON.stringify(approval.data));
      assert.equal(approval.data.approved, true);
    });
    await db.insert(facilityProfiles).values({
      id: `${prefix}-facility-profile`,
      partnerId: p.data.id,
      city: offerBody.city,
      facility: offerBody.facility,
      localizedName: { en: "Isolated test facility", ar: "مرفق تجريبي", ku: "شوێنی تاقیکردنەوە" },
      localizedDistrict: { en: "Central", ar: "الوسط", ku: "ناوەند" },
      localizedAddress: { en: "Test address", ar: "عنوان تجريبي", ku: "ناونیشانی تاقیکردنەوە" },
      localizedDescription: { en: "Test facility", ar: "مرفق تجريبي", ku: "شوێنی تاقیکردنەوە" },
      activities: [{ en: "fitness", ar: "لياقة", ku: "وەرزش" }], amenities: [], accessibility: [],
      openingHours: Array.from({ length: 7 }, (_, day) => ({ day, closed: false, opensAt: "08:00", closesAt: "20:00" })),
      contactPhone: null, websiteUrl: null, latitude: null, longitude: null,
    });
    const o = await call("/operations/offerings", partnerUser, "POST", offerBody);
    assert.equal(o.status, 201, JSON.stringify(o.data)); ids.push(o.data.id);
    assert.equal(o.data.approvalStatus, "draft");
    assert.equal((await call(`/operations/offerings/${o.data.id}`, adminId, "PATCH", { capacity: 2, active: true })).status, 400);
    await publishOffering(o.data.id);
    const freeEventOffer = await call("/operations/offerings", partnerUser, "POST", {
      ...offerBody, title: "Isolated free event", kind: "event", additionalPayment: false,
      localizedTitle: { en: "Isolated free event", ar: "فعالية مجانية", ku: "بۆنەی بێبەرامبەر" },
      localizedDescription: { en: "A free RSVP test.", ar: "اختبار حجز مجاني.", ku: "تاقیکردنەوەی حجزکردنی بێبەرامبەر." },
    });
    assert.equal(freeEventOffer.status, 201, JSON.stringify(freeEventOffer.data));
    ids.push(freeEventOffer.data.id);
    assert.equal(freeEventOffer.data.approvalStatus, "draft");
    assert.equal((await call(`/operations/offerings/${freeEventOffer.data.id}`, adminId, "PATCH", { capacity: 2, active: true })).status, 400);
    await publishOffering(freeEventOffer.data.id);
    const paidEventOffer = await call("/operations/offerings", partnerUser, "POST", {
      ...offerBody, title: "Isolated paid event", kind: "event", additionalPayment: true,
    });
    assert.equal(paidEventOffer.status, 201, JSON.stringify(paidEventOffer.data));
    ids.push(paidEventOffer.data.id);
    assert.equal(paidEventOffer.data.approvalStatus, "draft");
    assert.equal((await call(`/operations/offerings/${paidEventOffer.data.id}`, adminId, "PATCH", { capacity: 2, active: true })).status, 400);
    await publishOffering(paidEventOffer.data.id);
    await t.test("weekly schedules create an atomic, partner-scoped set of individual offerings", async () => {
      const startDay = new Date(Date.now() + 10 * 86400000);
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(startDay).map(part => [part.type, part.value]));
      const localDate = `${parts.year}-${parts.month}-${parts.day}`;
      const weekday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
      const repeatUntil = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 14))
        .toISOString().slice(0, 10);
      const recurringTemplate = {
        ...offerBody,
        startsAt: `${localDate}T09:00:00+03:00`,
        endsAt: `${localDate}T10:00:00+03:00`,
        cancellationDeadline: `${localDate}T08:00:00+03:00`,
      };
      const body = { template: recurringTemplate, schedule: { repeatUntil, weekdays: [weekday] } };
      const partnerPublishAttempt = await call("/operations/offerings/recurring", partnerUser, "POST", {
        ...body, template: { ...recurringTemplate, active: true },
      });
      assert.equal(partnerPublishAttempt.status, 403);
      const created = await call("/operations/offerings/recurring", partnerUser, "POST", body);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.length, 3);
      assert.ok(created.data.every((row: any) => row.partnerId === p.data.id));
      ids.push(...created.data.map((row: any) => row.id));

      const beforeDuplicate = await db.select().from(offerings).where(and(
        eq(offerings.partnerId, p.data.id), eq(offerings.city, recurringTemplate.city),
        eq(offerings.facility, recurringTemplate.facility),
      ));
      const duplicate = await call("/operations/offerings/recurring", partnerUser, "POST", body);
      assert.equal(duplicate.status, 409);
      const afterDuplicate = await db.select().from(offerings).where(and(
        eq(offerings.partnerId, p.data.id), eq(offerings.city, recurringTemplate.city),
        eq(offerings.facility, recurringTemplate.facility),
      ));
      assert.equal(afterDuplicate.length, beforeDuplicate.length);

      const otherPartner = await call("/operations/offerings/recurring", partnerUser, "POST", {
        ...body, template: { ...recurringTemplate, partnerId: "another-partner" },
      });
      assert.equal(otherPartner.status, 403);
    });
    const rules = { quota: 1, dailyLimit: 10, quotaMode: "separate", physicalQuota: 1, premiumQuota: 1, liveQuota: 1, trialAllowedTypes: ["physical", "premium", "live"] };
    const planTerms = {
      description: { en: "Isolated trial", ar: "تجربة معزولة", ku: "تاقیکردنەوەی جیاواز" },
      trialPeriodDays: 7, minimumContractMonths: 0, renewalPeriodDays: 30, cancellationPeriodDays: 0,
      automaticRenewal: false, pauseAllowanceDays: 3, priceProtectionMonths: 0,
      promotionalPriceIqd: null, corporatePriceIqd: null, digitalContentAccess: true,
      guestPasses: 0, eventAccess: true, additionalPaymentAllowed: false,
    };
    const planBody = { name: "Isolated trial", tier: "M", kind: "trial", durationDays: 7, active: true, priceIqd: null, rules: { ...rules, planTerms } };
    const plan = await call("/operations/plans", adminId, "POST", planBody);
    assert.equal(plan.status, 201); planIds.push(plan.data.id);
    assert.deepEqual(plan.data.rules.planTerms, planTerms);
    await t.test("public catalog and plans expose only approved live summaries without authentication", async () => {
      const catalogResponse = await fetch(`http://127.0.0.1:${port}/public/catalog`);
      assert.equal(catalogResponse.status, 200);
      const catalog = await catalogResponse.json() as any[];
      const publicOffering = catalog.find((x: any) => x.id === o.data.id);
      assert.equal(publicOffering?.partnerName, "Isolated test partner");
      assert.equal(publicOffering?.remaining, 2);
      assert.equal(publicOffering?.scope, undefined);
      assert.equal(publicOffering?.capacity, undefined);
      const publicEvent = catalog.find((x: any) => x.id === freeEventOffer.data.id);
      assert.equal(publicEvent?.kind, "event");
      assert.equal(publicEvent?.targetId, freeEventOffer.data.targetId);
      assert.equal(publicEvent?.slot, freeEventOffer.data.slot);
      assert.equal(publicEvent?.localizedTitle.ku, "بۆنەی بێبەرامبەر");
      assert.deepEqual(publicEvent?.tiers, ["M"]);
      assert.equal(publicEvent?.gender, "all");
      assert.equal(publicEvent?.minAge, 0);
      assert.equal(publicEvent?.maxAge, null);
      assert.equal(publicEvent?.additionalPayment, false);
      assert.ok(!catalog.some((x: any) => x.id === paidEventOffer.data.id));

      const plansResponse = await fetch(`http://127.0.0.1:${port}/public/plans`);
      assert.equal(plansResponse.status, 200);
      const plans = await plansResponse.json() as any[];
      const publicPlan = plans.find((x: any) => x.id === plan.data.id);
      assert.deepEqual(publicPlan, {
        id: plan.data.id, name: "Isolated trial", tier: "M", kind: "trial", durationDays: 7,
        access: {
          quotaMode: "separate",
          dailyLimit: 10,
          sharedVisits: null,
          physicalVisits: 1,
          premiumVisits: 1,
          liveClassVisits: 1,
          physicalAccess: true,
          premiumAccess: true,
          liveClassAccess: true,
          digitalCourseAccess: true,
          eventAccess: true,
          cancellationPeriodDays: 0,
          localizedDescription: planTerms.description,
        },
      });
      assert.equal(Object.hasOwn(publicPlan, "priceIqd"), false, "draft prices stay unpublished until payment is ready");
      assert.equal(Object.hasOwn(publicPlan, "rules"), false, "internal membership rules are not exposed publicly");
    });
    await t.test("sample access cannot book live; approved future offerings are discoverable", async () => {
      await call("/member/preview-membership", alice, "POST", { acknowledgeSampleData: true });
      assert.equal((await call("/member/bookings", alice, "POST", input(o.data.id))).status, 403);
      const catalog = await call("/member/live-catalog", alice);
      assert.ok(catalog.data.some((x: any) => x.id === o.data.id));
      assert.ok(catalog.data.some((x: any) => x.id === freeEventOffer.data.id));
      assert.ok(!catalog.data.some((x: any) => x.id === paidEventOffer.data.id));
      assert.ok(!(await call("/member/catalog", alice)).data.some((x: any) => x.id === o.data.id));
      assert.deepEqual((await call(`/operations/offerings/${o.data.id}/waitlist`, partnerUser)).data, []);
      assert.equal((await call(`/operations/offerings/${o.data.id}/waitlist`, alice)).status, 403);
    });
    await t.test("partner staff can inspect queue order without receiving member identities", async () => {
      await db.insert(waitlistEntries).values({
        id: `${prefix}-staff-waitlist`, userId: bob, offeringId: o.data.id, queuePosition: 1,
        status: "offered", offerExpiresAt: new Date(Date.now() + 60_000),
      });
      const result = await call(`/operations/offerings/${o.data.id}/waitlist`, partnerUser);
      assert.equal(result.status, 200);
      assert.equal(result.data[0].queuePosition, 1);
      assert.equal(result.data[0].status, "offered");
      assert.equal(result.data[0].userId, undefined);
      assert.equal((await call(`/operations/offerings/${o.data.id}/waitlist`, alice)).status, 403);
    });
    await t.test("admin grant snapshots rules; client tier spoofing and repeated trials are rejected", async () => {
      assert.equal((await call("/operations/grants", partnerUser, "POST", { userId: alice, planId: plan.data.id, reason: "Test grant" })).status, 403);
      assert.equal((await call("/operations/grants", supportAdminId, "POST", { userId: alice, planId: plan.data.id, reason: "Test grant" })).status, 201);
      assert.equal((await call("/member/bookings", alice, "POST", { ...input(o.data.id), tier: "XL" })).status, 400);
      const [aliceMembership] = await db.select().from(memberships).where(and(
        eq(memberships.userId, alice), eq(memberships.scope, "live"),
      ));
      assert.ok(aliceMembership);
      assert.ok(aliceMembership?.rules.planTerms);
      const originalRules = aliceMembership.rules;
      const originalPlanTerms = aliceMembership.rules.planTerms!;
      const expandedRules = {
        ...originalRules,
        quota: 8,
        physicalQuota: 8,
        premiumQuota: 8,
        liveQuota: 8,
      };
      const eventInput = {
        kind: "event",
        targetId: freeEventOffer.data.targetId,
        slot: freeEventOffer.data.slot,
      };
      await db.update(memberships).set({
        rules: { ...expandedRules, planTerms: { ...originalPlanTerms, eventAccess: false } },
      }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", eventInput)).status, 403);
      await db.update(memberships).set({
        rules: { ...expandedRules, planTerms: { ...originalPlanTerms, eventAccess: true } },
      }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      const eventBooking = await call("/member/bookings", alice, "POST", eventInput);
      assert.equal(eventBooking.status, 201);
      const [savedEventBooking] = await db.select().from(reservations).where(and(
        eq(reservations.userId, alice), eq(reservations.offeringId, freeEventOffer.data.id),
      ));
      assert.ok(savedEventBooking);
      await db.update(reservations).set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(reservations.id, savedEventBooking.id));
      await db.update(memberships).set({ rules: originalRules })
        .where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(o.data.id))).status, 201);
      assert.equal((await call(`/operations/offerings/${o.data.id}`, partnerUser, "PATCH", { capacity: 0 })).status, 400);
    });
    await t.test("membership schedule, pause, cancellation, reactivation, and termination follow lifecycle rules", async () => {
      const lifecycleOffering = await call("/operations/offerings", partnerUser, "POST", { ...offerBody, capacity: 20 });
      assert.equal(lifecycleOffering.status, 201, JSON.stringify(lifecycleOffering.data));
      ids.push(lifecycleOffering.data.id);
      await publishOffering(lifecycleOffering.data.id);
      const iraqToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
      const futureDate = new Date(`${iraqToday}T00:00:00Z`);
      futureDate.setUTCDate(futureDate.getUTCDate() + 1);
      const startsOn = futureDate.toISOString().slice(0, 10);
      await db.insert(memberConsentEvents).values((["terms_of_use", "privacy_policy"] as const).map(purpose => ({
        id: `${prefix}-${charlie}-${purpose}`,
        userId: charlie,
        purpose,
        policyVersion: "v1-draft",
        choice: "accepted" as const,
      }))).onConflictDoNothing();
      const grant = await call("/operations/grants", supportAdminId, "POST", {
        userId: charlie, planId: plan.data.id, startsOn, reason: "Schedule trial access",
      });
      assert.equal(grant.status, 201);
      const [scheduled] = await db.select().from(memberships).where(and(eq(memberships.userId, charlie), eq(memberships.scope, "live")));
      assert.equal(scheduled?.status, "scheduled");
      assert.equal((await call("/member/bookings", charlie, "POST", input(lifecycleOffering.data.id))).status, 403);

      await db.update(memberships).set({ startsAt: new Date(Date.now() - 1000) })
        .where(and(eq(memberships.userId, charlie), eq(memberships.scope, "live")));
      assert.equal((await memberState(charlie)).memberships[0]?.status, "trial");
      assert.equal((await call("/operations/memberships/lifecycle", partnerUser, "POST", {
        userId: charlie, action: "schedule_cancel", reason: "Test unauthorized action",
      })).status, 403);
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "schedule_cancel", reason: "Member requested end of term",
      })).status, 200);
      assert.equal((await db.select().from(memberships).where(eq(memberships.userId, charlie)))[0]?.status, "scheduled_cancellation");

      const booking = await call("/member/bookings", charlie, "POST", input(lifecycleOffering.data.id));
      assert.equal(booking.status, 201, JSON.stringify(booking.data));
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "pause", reason: "Member requested a pause",
      })).status, 409, "scheduled cancellation must be reactivated before pausing");
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "reactivate", reason: "Member changed their mind",
      })).status, 200);
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "pause", reason: "Member requested a pause",
      })).status, 200);
      const [paused] = await db.select().from(memberships).where(eq(memberships.userId, charlie));
      assert.equal(paused?.status, "paused");
      assert.ok((await db.select().from(operationAudit).where(and(
        eq(operationAudit.targetId, charlie), eq(operationAudit.action, "membership.pause"),
      ))).length);
      const pausedBookings = await db.select().from(reservations).where(and(
        eq(reservations.userId, charlie), eq(reservations.offeringId, lifecycleOffering.data.id),
      ));
      assert.ok(pausedBookings.some(item => item.status === "cancelled"));
      assert.equal((await call("/member/bookings", charlie, "POST", input(lifecycleOffering.data.id))).status, 403);
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "resume", reason: "Member resumed training",
      })).status, 200);
      const [resumed] = await db.select().from(memberships).where(eq(memberships.userId, charlie));
      assert.equal(resumed?.status, "trial");
      assert.ok(resumed?.endsAt && resumed.endsAt >= paused!.endsAt);

      const resumedBooking = await call("/member/bookings", charlie, "POST", input(lifecycleOffering.data.id));
      assert.equal(resumedBooking.status, 201);
      assert.equal((await call("/operations/memberships/lifecycle", complianceAdminId, "POST", {
        userId: charlie, action: "suspend", reason: "Misuse review requires suspension",
      })).status, 200);
      assert.equal((await call("/member/bookings", charlie, "POST", input(lifecycleOffering.data.id))).status, 403);
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "reactivate", reason: "Misuse review cleared",
      })).status, 200);
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "cancel_now", reason: "Member requested immediate cancellation",
      })).status, 200);
      assert.equal((await db.select().from(memberships).where(eq(memberships.userId, charlie)))[0]?.status, "cancelled");
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "reactivate", reason: "Member renewed request",
      })).status, 200);
      assert.equal((await call("/operations/memberships/lifecycle", complianceAdminId, "POST", {
        userId: charlie, action: "terminate", reason: "Administrator closed membership",
      })).status, 200);
      assert.equal((await db.select().from(memberships).where(eq(memberships.userId, charlie)))[0]?.status, "terminated");
      assert.equal((await call("/operations/memberships/lifecycle", supportAdminId, "POST", {
        userId: charlie, action: "reactivate", reason: "Should not reactivate terminated",
      })).status, 409);
    });
    await t.test("localized courses keep lessons and progress on the owning account", async () => {
      const content = (en: string, ar: string, ku: string) => ({ en, ar, ku });
      const created = await call("/operations/courses", contentAdminId, "POST", {
        localizedTitle: content("Strength at home", "القوة في المنزل", "هێز لە ماڵەوە"),
        localizedSummary: content("A short beginner course.", "دورة قصيرة للمبتدئين.", "کۆرسێکی کورت بۆ دەستپێکەران."),
        localizedInstructor: content("MaydanGo team", "فريق MaydanGo", "تیمی MaydanGo"),
        category: "fitness", level: "beginner", durationMinutes: 12, thumbnailUrl: null, published: true,
        lessons: [{
          position: 1, localizedTitle: content("First steps", "الخطوات الأولى", "هەنگاوەکانی سەرەتا"),
          localizedContent: content("Move at your own pace.", "تحرك حسب وتيرتك.", "بە خێرایی خۆت بجوڵێ."),
          durationMinutes: 12, mediaUrl: "/objects/course-recordings/lesson-1.mp4",
        }],
      });
      assert.equal(created.status, 201, JSON.stringify(created.data)); courseIds.push(created.data.id);

      const bobPreview = await call("/member/preview-membership", bob, "POST", { acknowledgeSampleData: true });
      assert.equal(bobPreview.status, 200);
      const restricted = await call(`/member/courses/${created.data.id}`, bob);
      assert.equal(restricted.status, 200);
      assert.equal(restricted.data.accessState, "membership_required");
      assert.equal(restricted.data.lessons[0].mediaUrl, null);
      assert.equal(restricted.data.lessons[0].localizedContent, null);

      const enrolled = await call(`/member/courses/${created.data.id}/enroll`, alice, "POST", {});
      assert.equal(enrolled.status, 200);
      assert.equal(enrolled.data.accessState, "ready");
      assert.equal(enrolled.data.lessons[0].mediaUrl, null, "private recordings do not expose storage URLs");
      assert.equal(enrolled.data.lessons[0].hasRecording, true);
      assert.equal(enrolled.data.lessons[0].localizedContent.ku, "بە خێرایی خۆت بجوڵێ.");
      const progress = await call(`/member/courses/${created.data.id}/progress`, alice, "PUT", {
        lessonId: enrolled.data.lessons[0].id, completed: true,
      });
      assert.equal(progress.status, 200);
      assert.equal(progress.data.completedLessons, 1);
      const restored = await call("/member/courses", alice);
      assert.equal(restored.data.find((row: any) => row.id === created.data.id).completedLessons, 1);
      const otherAccount = await call("/member/courses", bob);
      assert.equal(otherAccount.data.find((row: any) => row.id === created.data.id).completedLessons, 0);
      assert.equal((await call(`/member/courses/${created.data.id}/progress`, bob, "PUT", {
        lessonId: enrolled.data.lessons[0].id, completed: true,
      })).status, 403);
    });
    await t.test("live class details are localized and join links stay private until eligibility checks pass", async () => {
      const start = new Date(Date.now() + 10 * 60_000);
      const liveBody = {
        ...offerBody, title: "Online mobility", accessType: "live",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
        cancellationDeadline: new Date(start.getTime() - 5 * 60_000).toISOString(),
        localizedTitle: { en: "Online mobility", ar: "حركة أونلاين", ku: "جووڵەی ئۆنلاین" },
        localizedDescription: { en: "Move from home.", ar: "تمرّن من المنزل.", ku: "لە ماڵەوە ڕاهێنان بکە." },
        localizedInstructor: { en: "Rana Ahmed", ar: "رنا أحمد", ku: "ڕەنا ئەحمەد" },
        difficultyLevel: "beginner",
        instructionLanguage: "ar",
        requiredEquipment: { en: "A yoga mat", ar: "بساط يوغا", ku: "بەرگێکی یۆگا" },
        joinUrl: "https://example.test/private-class-room",
      };
      const incomplete = await call("/operations/offerings", adminId, "POST", {
        ...liveBody, active: true, requiredEquipment: null,
      });
      assert.equal(incomplete.status, 400);
      const created = await call("/operations/offerings", partnerUser, "POST", liveBody);
      assert.equal(created.status, 201); ids.push(created.data.id);
      await publishOffering(created.data.id);
      const catalog = await call("/member/live-catalog", alice);
      const card = catalog.data.find((row: any) => row.id === created.data.id);
      assert.equal(card.localizedTitle.ku, "جووڵەی ئۆنلاین");
      assert.equal(card.joinUrl, undefined);
      const beforeBooking = await call("/member/live-classes", alice);
      const session = beforeBooking.data.find((row: any) => row.id === created.data.id);
      assert.equal(session.canJoin, false);
      assert.equal(session.joinUrl, undefined);
      assert.equal(session.localizedInstructor.ku, liveBody.localizedInstructor.ku);
      assert.equal(session.difficultyLevel, "beginner");
      assert.equal(session.instructionLanguage, "ar");
      assert.equal(session.requiredEquipment.en, "A yoga mat");
      assert.equal(session.capacity, 2);
      assert.equal(session.remaining, 2);
      assert.deepEqual(session.tiers, ["M"]);
      assert.equal(Date.parse(session.cancellationDeadline), Date.parse(liveBody.cancellationDeadline));
      assert.equal((await call(`/member/live-classes/${created.data.id}/join`, alice, "POST", {})).status, 403);
      assert.equal((await call("/member/bookings", alice, "POST", input(created.data.id))).status, 201);
      const afterBooking = await call("/member/live-classes", alice);
      assert.equal(afterBooking.data.find((row: any) => row.id === created.data.id).canJoin, true);
      assert.equal(afterBooking.data.find((row: any) => row.id === created.data.id).remaining, 1);

      const joinResponse = await fetch(`http://127.0.0.1:${port}/member/live-classes/${created.data.id}/join`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-test-user": alice }, body: "{}",
      });
      assert.equal(joinResponse.status, 200);
      assert.equal(joinResponse.headers.get("cache-control"), "no-store");
      assert.equal((await joinResponse.json() as any).url, liveBody.joinUrl);
      assert.equal((await call(`/member/live-classes/${created.data.id}/join`, bob, "POST", {})).status, 403);
      await db.update(offerings).set({ additionalPayment: true }).where(eq(offerings.id, created.data.id));
      const paymentBlocked = await call("/member/live-classes", alice);
      assert.equal(paymentBlocked.data.find((row: any) => row.id === created.data.id).canJoin, false);
      assert.equal((await call(`/member/live-classes/${created.data.id}/join`, alice, "POST", {})).status, 403);
      const publicCatalog = await fetch(`http://127.0.0.1:${port}/public/catalog`).then(response => response.json()) as any[];
      assert.equal(publicCatalog.find((row: any) => row.id === created.data.id)?.joinUrl, undefined);
    });
    await t.test("separate quotas allow premium independently; shared and partner-group limits deny", async () => {
      const premium = await call("/operations/offerings", partnerUser, "POST", { ...offerBody, accessType: "premium" });
      assert.equal(premium.status, 201); ids.push(premium.data.id);
      await publishOffering(premium.data.id);
      const physical = await call("/operations/offerings", partnerUser, "POST", offerBody);
      assert.equal(physical.status, 201); ids.push(physical.data.id);
      await publishOffering(physical.data.id);
      assert.equal((await call("/member/bookings", alice, "POST", input(physical.data.id))).status, 403);
      await db.update(memberships).set({ rules: { ...rules, quotaMode: "shared" } }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(premium.data.id))).status, 403);
      await db.update(memberships).set({ rules: { ...rules, quotaMode: "separate", partnerGroupLimits: { [prefix]: 1 } } }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(premium.data.id))).status, 403);
      await db.update(memberships).set({ rules: { ...rules, quotaMode: "separate" } }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(premium.data.id))).status, 201);
      assert.equal((await call(`/operations/offerings/${o.data.id}/cancel`, partnerUser, "POST", {})).status, 200);
      // Cancellation is terminal, unlike a temporary unpublish.
      assert.equal((await call(`/operations/offerings/${o.data.id}`, adminId, "PATCH", { capacity: 3 })).status, 409);
      assert.equal((await call(`/operations/offerings/${o.data.id}/cancel`, partnerUser, "POST", {})).status, 200);
      assert.ok(!(await call("/member/live-catalog", alice)).data.some((x: any) => x.id === o.data.id));
      assert.equal((await call("/member/bookings", alice, "POST", input(o.data.id))).status, 404);
      // Published activity changes remain restricted to the audited administrator review flow.
      assert.equal((await call(`/operations/offerings/${physical.data.id}`, partnerUser, "PATCH", { capacity: 2, active: false })).status, 400);
      const archived = await call(`/operations/offerings/${physical.data.id}/review`, adminId, "PATCH", {
        status: "archived", reason: "Temporary facility pause",
      });
      assert.equal(archived.status, 200, JSON.stringify(archived.data));
      assert.equal(archived.data.approvalStatus, "archived");
      assert.ok(!(await call("/member/live-catalog", alice)).data.some((x: any) => x.id === physical.data.id));
      assert.equal((await call("/member/bookings", alice, "POST", input(physical.data.id))).status, 404);
      assert.equal((await memberState(alice)).bookings.find(b => b.targetId === o.data.id)?.status, "partner_cancelled");
    });
    await t.test("revocation cancels active bookings, repeat trials and paid grants remain blocked", async () => {
      assert.equal((await call("/operations/revoke", financeAdminId, "POST", { userId: alice, reason: "Test revoke" })).status, 200);
      assert.equal((await call("/operations/grants", supportAdminId, "POST", { userId: alice, planId: plan.data.id, reason: "Test grant" })).status, 409);
      const paidPlanUpdate = await call(`/operations/plans/${plan.data.id}`, adminId, "PUT", { ...planBody, kind: "paid", priceIqd: 5000 });
      assert.equal(paidPlanUpdate.status, 200, JSON.stringify(paidPlanUpdate.data));
      const paidGrant = await call("/operations/grants", supportAdminId, "POST", { userId: bob, planId: plan.data.id, reason: "Test paid" });
      assert.equal(paidGrant.status, 403, JSON.stringify(paidGrant.data));
      const corporatePlanUpdate = await call(`/operations/plans/${plan.data.id}`, adminId, "PUT", { ...planBody, kind: "corporate", rules: { ...rules, corporateId: "test-company" } });
      assert.equal(corporatePlanUpdate.status, 200, JSON.stringify(corporatePlanUpdate.data));
      const wrongCorporateGrant = await call("/operations/grants", supportAdminId, "POST", { userId: bob, planId: plan.data.id, reason: "Test corp", corporateId: "wrong" });
      assert.equal(wrongCorporateGrant.status, 403, JSON.stringify(wrongCorporateGrant.data));
      assert.equal((await call("/operations/grants", supportAdminId, "POST", { userId: bob, planId: plan.data.id, reason: "Test corp", corporateId: "test-company" })).status, 201);
      await call(`/operations/partners/${p.data.id}`, adminId, "PATCH", { approved: false });
      assert.ok(!(await call("/member/live-catalog", bob)).data.some((x: any) => x.partnerId === p.data.id));
      const publicCatalog = await fetch(`http://127.0.0.1:${port}/public/catalog`).then(r => r.json()) as any[];
      assert.ok(!publicCatalog.some((x: any) => x.id === o.data.id));
      const activeId = ids.at(-1)!;
      assert.equal((await call("/member/bookings", bob, "POST", input(activeId))).status, 404);
    });
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.delete(operators).where(inArray(operators.userId, [
      adminId, partnerUser, supportAdminId, financeAdminId, contentAdminId, complianceAdminId, legacyAdminId,
    ]));
    // operation_audit is append-only; randomized test records are intentionally retained.
  }
});
after(async () => {
  const users = [alice, bob, charlie, consentless, ...waitlistUsers];
  await db.delete(reservations).where(inArray(reservations.userId, users));
  await db.delete(memberships).where(inArray(memberships.userId, users));
  await db.delete(memberConsentEvents).where(inArray(memberConsentEvents.userId, users));
  await db.delete(memberProfiles).where(inArray(memberProfiles.userId, [alice, bob]));
  if (ids.length) await db.delete(waitlistEntries).where(inArray(waitlistEntries.offeringId, ids));
  if (ids.length) await db.delete(offerings).where(inArray(offerings.id, ids));
  if (courseIds.length) {
    const enrollments = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(inArray(courseEnrollments.courseId, courseIds));
    if (enrollments.length) {
      await db.delete(lessonProgress).where(inArray(lessonProgress.enrollmentId, enrollments.map(row => row.id)));
      await db.delete(courseEnrollments).where(inArray(courseEnrollments.id, enrollments.map(row => row.id)));
    }
    await db.delete(learningLessons).where(inArray(learningLessons.courseId, courseIds));
    await db.delete(learningCourses).where(inArray(learningCourses.id, courseIds));
  }
  await db.delete(accessGrants).where(inArray(accessGrants.userId, users));
  if (planIds.length) await db.delete(membershipPlans).where(inArray(membershipPlans.id, planIds));
  if (partnerIds.length) await db.delete(facilityProfiles).where(inArray(facilityProfiles.partnerId, partnerIds));
  if (partnerIds.length) await db.delete(partners).where(inArray(partners.id, partnerIds));
  await pool.end();
});
