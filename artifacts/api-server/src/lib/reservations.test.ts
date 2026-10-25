import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, offerings, memberships, reservations, attendance, memberProfiles, partners, operators, membershipPlans, accessGrants, operationAudit } from "@workspace/db";
import express from "express";
import operationsRouter from "../routes/operations";
import memberRouter from "../routes/member";
import { createReservation, cancelReservation, memberState, BookingError } from "./reservations";
import app from "../app";

const prefix = `test-${randomUUID()}`;
const alice = `${prefix}-a`, bob = `${prefix}-b`;
const ids: string[] = [];
const partnerIds: string[] = [], planIds: string[] = [];
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
    const again = await memberState(alice);
    assert.deepEqual(again.bookings, state.bookings);
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
  await t.test("coaching is requested, never confirmed or attended", async () => {
    const coach = await offer({ kind: "coach", slot: "slot-1" });
    const row = await createReservation(alice, { kind: "coach", targetId: coach, slot: "slot-1" });
    assert.equal(row.status, "requested");
  });
});
test("HTTP endpoints reject unauthenticated access and forged bearer tokens", async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  try {
    for (const headers of [{}, { authorization: "Bearer invalid-forged-token" }]) {
      const res = await fetch(`http://127.0.0.1:${address.port}/api/member`, { headers });
      assert.equal(res.status, 401);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("live operations: staff scope, approved inventory, server grants and quota models", async t => {
  const adminId = `${prefix}-admin`, partnerUser = `${prefix}-partner`;
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
  harness.use("/operations", operationsRouter); harness.use("/member", memberRouter);
  const server = harness.listen(0);
  await new Promise<void>(r => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const call = async (path: string, user = adminId, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method,
      headers: { "Content-Type": "application/json", "x-test-user": user },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  };
  await db.insert(operators).values({ userId: adminId, role: "admin" });
  try {
    assert.equal((await call("/operations", alice)).status, 403);
    const p = await call("/operations/partners", adminId, "POST", { name: "Isolated test partner", groupId: prefix, ownerUserId: partnerUser });
    assert.equal(p.status, 201); partnerIds.push(p.data.id);
    const offerBody = { partnerId: p.data.id, title: "Isolated live test", kind: "session", city: "baghdad", facility: prefix,
      category: "fitness", accessType: "physical", tiers: ["M"], startsAt: new Date(now + 86400000).toISOString(),
      endsAt: new Date(now + 90000000).toISOString(), cancellationDeadline: new Date(now + 80000000).toISOString(), capacity: 2, active: true };
    await t.test("partner cannot self-approve, manage plans, or publish unapproved inventory", async () => {
      assert.equal((await call(`/operations/partners/${p.data.id}`, partnerUser, "PATCH", { approved: true })).status, 403);
      assert.equal((await call("/operations/plans", partnerUser, "POST", {})).status, 403);
      assert.equal((await call("/operations/offerings", partnerUser, "POST", offerBody)).status, 403);
      assert.equal((await call("/operations/offerings", partnerUser, "POST", { ...offerBody, partnerId: "other" })).status, 403);
      assert.equal((await call(`/operations/partners/${p.data.id}`, adminId, "PATCH", { approved: true })).status, 200);
    });
    const o = await call("/operations/offerings", partnerUser, "POST", offerBody);
    assert.equal(o.status, 201); ids.push(o.data.id);
    const rules = { quota: 1, dailyLimit: 10, quotaMode: "separate", physicalQuota: 1, premiumQuota: 1, liveQuota: 1, trialAllowedTypes: ["physical", "premium", "live"] };
    const planBody = { name: "Isolated trial", tier: "M", kind: "trial", durationDays: 7, active: true, rules };
    const plan = await call("/operations/plans", adminId, "POST", planBody);
    assert.equal(plan.status, 201); planIds.push(plan.data.id);
    await t.test("sample access cannot book live; approved future offerings are discoverable", async () => {
      await call("/member/preview-membership", alice, "POST", { acknowledgeSampleData: true });
      assert.equal((await call("/member/bookings", alice, "POST", input(o.data.id))).status, 403);
      const catalog = await call("/member/live-catalog", alice);
      assert.ok(catalog.data.some((x: any) => x.id === o.data.id));
      assert.ok(!(await call("/member/catalog", alice)).data.some((x: any) => x.id === o.data.id));
    });
    await t.test("admin grant snapshots rules; client tier spoofing and repeated trials are rejected", async () => {
      assert.equal((await call("/operations/grants", partnerUser, "POST", { userId: alice, planId: plan.data.id, reason: "Test grant" })).status, 403);
      assert.equal((await call("/operations/grants", adminId, "POST", { userId: alice, planId: plan.data.id, reason: "Test grant" })).status, 201);
      assert.equal((await call("/member/bookings", alice, "POST", { ...input(o.data.id), tier: "XL" })).status, 400);
      assert.equal((await call("/member/bookings", alice, "POST", input(o.data.id))).status, 201);
      assert.equal((await call(`/operations/offerings/${o.data.id}`, partnerUser, "PATCH", { capacity: 0 })).status, 400);
    });
    await t.test("separate quotas allow premium independently; shared and partner-group limits deny", async () => {
      const premium = await call("/operations/offerings", partnerUser, "POST", { ...offerBody, accessType: "premium" });
      assert.equal(premium.status, 201); ids.push(premium.data.id);
      const physical = await call("/operations/offerings", partnerUser, "POST", offerBody);
      assert.equal(physical.status, 201); ids.push(physical.data.id);
      assert.equal((await call("/member/bookings", alice, "POST", input(physical.data.id))).status, 403);
      await db.update(memberships).set({ rules: { ...rules, quotaMode: "shared" } }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(premium.data.id))).status, 403);
      await db.update(memberships).set({ rules: { ...rules, quotaMode: "separate", partnerGroupLimits: { [prefix]: 1 } } }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(premium.data.id))).status, 403);
      await db.update(memberships).set({ rules: { ...rules, quotaMode: "separate" } }).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
      assert.equal((await call("/member/bookings", alice, "POST", input(premium.data.id))).status, 201);
      assert.equal((await call(`/operations/offerings/${o.data.id}/cancel`, partnerUser, "POST", {})).status, 200);
      // Cancellation is terminal, unlike a temporary unpublish.
      assert.equal((await call(`/operations/offerings/${o.data.id}`, partnerUser, "PATCH", { capacity: 2, active: true })).status, 409);
      assert.equal((await call(`/operations/offerings/${o.data.id}`, adminId, "PATCH", { capacity: 3 })).status, 409);
      assert.equal((await call(`/operations/offerings/${o.data.id}/cancel`, partnerUser, "POST", {})).status, 200);
      assert.ok(!(await call("/member/live-catalog", alice)).data.some((x: any) => x.id === o.data.id));
      assert.equal((await call("/member/bookings", alice, "POST", input(o.data.id))).status, 404);
      // Non-cancelled offerings can still be temporarily hidden and republished.
      assert.equal((await call(`/operations/offerings/${physical.data.id}`, partnerUser, "PATCH", { capacity: 2, active: false })).status, 200);
      assert.equal((await call(`/operations/offerings/${physical.data.id}`, partnerUser, "PATCH", { capacity: 2, active: true })).status, 200);
      assert.equal((await call("/member/bookings", alice, "POST", input(physical.data.id))).status, 201);
      assert.equal((await memberState(alice)).bookings.find(b => b.targetId === o.data.id)?.status, "partner_cancelled");
    });
    await t.test("revocation cancels active bookings, repeat trials and paid grants remain blocked", async () => {
      assert.equal((await call("/operations/revoke", adminId, "POST", { userId: alice, reason: "Test revoke" })).status, 200);
      assert.equal((await call("/operations/grants", adminId, "POST", { userId: alice, planId: plan.data.id, reason: "Test grant" })).status, 409);
      await call(`/operations/plans/${plan.data.id}`, adminId, "PUT", { ...planBody, kind: "paid" });
      assert.equal((await call("/operations/grants", adminId, "POST", { userId: bob, planId: plan.data.id, reason: "Test paid" })).status, 403);
      await call(`/operations/plans/${plan.data.id}`, adminId, "PUT", { ...planBody, kind: "corporate", rules: { ...rules, corporateId: "test-company" } });
      assert.equal((await call("/operations/grants", adminId, "POST", { userId: bob, planId: plan.data.id, reason: "Test corp", corporateId: "wrong" })).status, 403);
      assert.equal((await call("/operations/grants", adminId, "POST", { userId: bob, planId: plan.data.id, reason: "Test corp", corporateId: "test-company" })).status, 201);
      await call(`/operations/partners/${p.data.id}`, adminId, "PATCH", { approved: false });
      assert.ok(!(await call("/member/live-catalog", bob)).data.some((x: any) => x.partnerId === p.data.id));
      const activeId = ids.at(-1)!;
      assert.equal((await call("/member/bookings", bob, "POST", input(activeId))).status, 403);
    });
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.delete(operators).where(inArray(operators.userId, [adminId, partnerUser]));
    await db.delete(operationAudit).where(inArray(operationAudit.actorId, [adminId, partnerUser]));
  }
});
after(async () => {
  await db.delete(reservations).where(inArray(reservations.userId, [alice, bob]));
  await db.delete(memberships).where(inArray(memberships.userId, [alice, bob]));
  await db.delete(memberProfiles).where(inArray(memberProfiles.userId, [alice, bob]));
  if (ids.length) await db.delete(offerings).where(inArray(offerings.id, ids));
  await db.delete(accessGrants).where(inArray(accessGrants.userId, [alice, bob]));
  if (planIds.length) await db.delete(membershipPlans).where(inArray(membershipPlans.id, planIds));
  if (partnerIds.length) await db.delete(partners).where(inArray(partners.id, partnerIds));
  await pool.end();
});
