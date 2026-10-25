import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, offerings, memberships, reservations, attendance, memberProfiles } from "@workspace/db";
import { createReservation, cancelReservation, memberState, BookingError } from "./reservations";
import app from "../app";

const prefix = `test-${randomUUID()}`;
const alice = `${prefix}-a`, bob = `${prefix}-b`;
const ids: string[] = [];
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
after(async () => {
  await db.delete(reservations).where(inArray(reservations.userId, [alice, bob]));
  await db.delete(memberships).where(inArray(memberships.userId, [alice, bob]));
  await db.delete(memberProfiles).where(inArray(memberProfiles.userId, [alice, bob]));
  if (ids.length) await db.delete(offerings).where(inArray(offerings.id, ids));
  await pool.end();
});
