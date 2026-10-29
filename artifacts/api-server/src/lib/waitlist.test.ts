import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import { db, pool, memberships, offerings, partners, reservations, waitlistEntries } from "@workspace/db";
import memberRouter from "../routes/member";
import { createReservation } from "./reservations";

const prefix = `waitlist-test-${randomUUID()}`;
const owner = `${prefix}-owner`;
const first = `${prefix}-first`;
const second = `${prefix}-second`;
const third = `${prefix}-third`;
const users = [owner, first, second, third];
const partnerId = `${prefix}-partner`;
const offeringId = `${prefix}-class`;
const reservationIds: string[] = [];
const waitlistIds: string[] = [];
let server: Server | null = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { auth: Object.assign(
    () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true },
  ) });
  next();
});
app.use("/member", memberRouter);

const call = async (path: string, user: string, method = "GET", body?: unknown) => {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as any };
};

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (waitlistIds.length) await db.delete(waitlistEntries).where(inArray(waitlistEntries.id, waitlistIds));
  await db.delete(reservations).where(eq(reservations.offeringId, offeringId));
  await db.delete(memberships).where(inArray(memberships.userId, users));
  await db.delete(offerings).where(eq(offerings.id, offeringId));
  await db.delete(partners).where(eq(partners.id, partnerId));
  await pool.end();
});

test("full live classes promote the first eligible member after a cancellation", async () => {
  const startsAt = new Date(Date.now() + 86400000);
  await db.insert(partners).values({
    id: partnerId, name: "Waitlist test partner", groupId: prefix, ownerUserId: `${prefix}-staff`, approved: true,
  });
  await db.insert(offerings).values({
    id: offeringId, targetId: offeringId, kind: "session", slot: "", title: "Waitlist test class",
    scope: "live", partnerId, partnerGroup: prefix, accessType: "physical", active: true,
    city: "baghdad", facility: "waitlist-test", category: "fitness", tiers: ["M"],
    startsAt, endsAt: new Date(startsAt.getTime() + 3600000),
    cancellationDeadline: new Date(startsAt.getTime() - 3600000), capacity: 1,
  });
  await db.insert(memberships).values(users.map(userId => ({
    userId, scope: "live", status: "trial", paymentStatus: "not_required", source: "trial", tier: "M",
    startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 7 * 86400000),
    rules: { quota: 10, dailyLimit: 10, trialAllowedTypes: ["physical"] },
  })));
  const booking = await createReservation(owner, { kind: "session", targetId: offeringId, slot: "" });
  reservationIds.push(booking.id);

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const firstJoin = await call("/member/waitlist", first, "POST", { offeringId });
  const secondJoin = await call("/member/waitlist", second, "POST", { offeringId });
  const thirdJoin = await call("/member/waitlist", third, "POST", { offeringId });
  assert.equal(firstJoin.status, 201);
  assert.equal(secondJoin.status, 201);
  assert.equal(thirdJoin.status, 201);
  waitlistIds.push(firstJoin.data.id, secondJoin.data.id, thirdJoin.data.id);
  assert.equal(firstJoin.data.position, 1);
  assert.equal(secondJoin.data.position, 2);
  assert.equal(thirdJoin.data.position, 3);

  const repeated = await call("/member/waitlist", second, "POST", { offeringId });
  assert.equal(repeated.data.id, secondJoin.data.id);
  assert.equal(repeated.data.position, 2);
  assert.equal((await call(`/member/waitlist/${thirdJoin.data.id}`, second, "DELETE")).status, 404);
  assert.equal((await call(`/member/waitlist/${thirdJoin.data.id}`, third, "DELETE")).status, 200);
  const afterLeave = await call("/member/waitlist", second);
  assert.equal(afterLeave.data[0].position, 2);

  await db.update(memberships).set({ status: "expired" })
    .where(and(eq(memberships.userId, first), eq(memberships.scope, "live")));
  const canceled = await call(`/member/bookings/${booking.id}`, owner, "DELETE");
  assert.equal(canceled.status, 200);

  const promoted = await call("/member/waitlist", second);
  assert.equal(promoted.status, 200);
  assert.equal(promoted.data[0].status, "promoted");
  assert.equal(promoted.data[0].position, null);
  const skipped = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, firstJoin.data.id));
  assert.equal(skipped[0]?.status, "skipped");
  const secondState = await call("/member", second);
  assert.ok(secondState.data.bookings.some((item: { targetId: string; status: string }) =>
    item.targetId === offeringId && item.status === "reserved"));

  const activePlaces = await db.select().from(reservations).where(and(
    eq(reservations.offeringId, offeringId), inArray(reservations.status, ["reserved", "requested"]),
  ));
  assert.equal(activePlaces.length, 1);
  const trial = await db.select().from(memberships).where(and(
    eq(memberships.userId, second), eq(memberships.scope, "live"),
  ));
  assert.equal(trial[0]?.paymentStatus, "not_required");
});
