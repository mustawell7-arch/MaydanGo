import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import { db, pool, memberships, offerings, operators, partners, reservations, waitlistEntries } from "@workspace/db";
import memberRouter from "../routes/member";
import operationsRouter from "../routes/operations";
import { createReservation } from "./reservations";

const prefix = `waitlist-test-${randomUUID()}`;
const owner = `${prefix}-owner`;
const first = `${prefix}-first`;
const second = `${prefix}-second`;
const third = `${prefix}-third`;
const otherMember = `${prefix}-other-member`;
const users = [owner, first, second, third, otherMember];
const partnerId = `${prefix}-partner`;
const offeringId = `${prefix}-class`;
const otherPartnerId = `${prefix}-other-partner`;
const otherOfferingId = `${prefix}-other-class`;
const otherWaitlistId = `${prefix}-other-entry`;
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
app.use("/operations", operationsRouter);

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
  await db.delete(operators).where(eq(operators.userId, owner));
  await db.delete(memberships).where(inArray(memberships.userId, users));
  await db.delete(offerings).where(eq(offerings.id, offeringId));
  await db.delete(offerings).where(eq(offerings.id, otherOfferingId));
  await db.delete(partners).where(eq(partners.id, partnerId));
  await db.delete(partners).where(eq(partners.id, otherPartnerId));
  await pool.end();
});

test("full live classes promote the first eligible member after a cancellation", async () => {
  const startsAt = new Date(Date.now() + 86400000);
  await db.insert(partners).values({
    id: partnerId, name: "Waitlist test partner", groupId: prefix, ownerUserId: `${prefix}-staff`, approved: true,
  });
  await db.insert(partners).values({
    id: otherPartnerId, name: "Other waitlist partner", groupId: `${prefix}-other`, ownerUserId: `${prefix}-other-staff`, approved: true,
  });
  await db.insert(operators).values({ userId: owner, role: "partner", partnerId });
  await db.insert(offerings).values({
    id: offeringId, targetId: offeringId, kind: "session", slot: "", title: "Waitlist test class",
    scope: "live", partnerId, partnerGroup: prefix, accessType: "physical", active: true,
    city: "baghdad", facility: "waitlist-test", category: "fitness", tiers: ["M"],
    startsAt, endsAt: new Date(startsAt.getTime() + 3600000),
    cancellationDeadline: new Date(startsAt.getTime() - 3600000), capacity: 1,
  });
  await db.insert(offerings).values({
    id: otherOfferingId, targetId: otherOfferingId, kind: "session", slot: "", title: "Other partner class",
    scope: "live", partnerId: otherPartnerId, partnerGroup: `${prefix}-other`, accessType: "physical", active: true,
    city: "erbil", facility: "other-waitlist-test", category: "fitness", tiers: ["M"],
    startsAt, endsAt: new Date(startsAt.getTime() + 3600000),
    cancellationDeadline: new Date(startsAt.getTime() - 3600000), capacity: 1,
  });
  await db.insert(waitlistEntries).values({
    id: otherWaitlistId, userId: otherMember, offeringId: otherOfferingId, queuePosition: 1, status: "waiting",
    createdAt: new Date(Date.now() - 60000),
  });
  waitlistIds.push(otherWaitlistId);
  await db.insert(memberships).values(users.map(userId => ({
    userId, scope: "live", status: "trial", paymentStatus: "not_required", source: "trial", tier: "M",
    startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 7 * 86400000),
    rules: { quota: 10, dailyLimit: 10, trialAllowedTypes: ["physical"] },
  })));
  const booking = await createReservation(owner, { kind: "session", targetId: offeringId, slot: "" });
  reservationIds.push(booking.id);

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const joinPath = `/member/offerings/${offeringId}/waitlist`;
  const firstJoin = await call(joinPath, first, "POST");
  const secondJoin = await call(joinPath, second, "POST");
  const thirdJoin = await call(joinPath, third, "POST");
  assert.equal(firstJoin.status, 200);
  assert.equal(secondJoin.status, 200);
  assert.equal(thirdJoin.status, 200);
  const memberEntry = (state: any) => state.waitlists.find((entry: { offeringId: string }) => entry.offeringId === offeringId);
  const firstEntry = memberEntry(firstJoin.data);
  const secondEntry = memberEntry(secondJoin.data);
  const thirdEntry = memberEntry(thirdJoin.data);
  assert.ok(firstEntry && secondEntry && thirdEntry);
  waitlistIds.push(firstEntry.id, secondEntry.id, thirdEntry.id);
  assert.equal(firstEntry.queuePosition, 1);
  assert.equal(secondEntry.queuePosition, 2);
  assert.equal(thirdEntry.queuePosition, 3);
  const partnerQueue = await call("/operations", owner);
  assert.equal(partnerQueue.status, 200);
  assert.deepEqual(partnerQueue.data.waitlist.map((entry: { id: string; position: number }) => entry.id), [
    firstEntry.id, secondEntry.id, thirdEntry.id,
  ]);
  assert.deepEqual(partnerQueue.data.waitlist.map((entry: { position: number }) => entry.position), [1, 2, 3]);
  assert.ok(partnerQueue.data.waitlist.every((entry: Record<string, unknown>) => !("userId" in entry)));
  assert.ok(partnerQueue.data.waitlist.every((entry: { offeringId: string }) => entry.offeringId === offeringId));
  assert.ok(partnerQueue.data.waitlist.every((entry: { joinedAt: string }) => typeof entry.joinedAt === "string"));

  const repeated = await call(joinPath, second, "POST");
  assert.equal(memberEntry(repeated.data).id, secondEntry.id);
  assert.equal(memberEntry(repeated.data).queuePosition, 2);
  assert.equal((await call(`/member/waitlist/${thirdEntry.id}`, second, "DELETE")).status, 404);
  assert.equal((await call(`/member/waitlist/${thirdEntry.id}`, third, "DELETE")).status, 200);
  const afterLeave = await call("/member", second);
  assert.equal(memberEntry(afterLeave.data).queuePosition, 2);

  await db.update(memberships).set({ status: "expired" })
    .where(and(eq(memberships.userId, first), eq(memberships.scope, "live")));
  const canceled = await call(`/member/bookings/${booking.id}`, owner, "DELETE");
  assert.equal(canceled.status, 200);

  const firstState = await call("/member", first);
  assert.equal(memberEntry(firstState.data).status, "ineligible");
  const offeredState = await call("/member", second);
  assert.equal(memberEntry(offeredState.data).status, "offered");
  assert.ok(memberEntry(offeredState.data).offerExpiresAt);
  const accepted = await call(`/member/waitlist/${secondEntry.id}/accept`, second, "POST");
  assert.equal(accepted.status, 200);
  assert.equal(memberEntry(accepted.data).status, "booked");
  assert.ok(accepted.data.bookings.some((item: { targetId: string; status: string }) =>
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
