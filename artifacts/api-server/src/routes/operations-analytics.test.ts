import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import { attendance, db, offerings, operators, partners, pool, reservations } from "@workspace/db";
import operationsAnalyticsRouter from "./operations-analytics";

const prefix = `analytics-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const otherPartnerId = `${prefix}-other`;
const partnerUser = `${prefix}-partner-user`;
const otherPartnerUser = `${prefix}-other-user`;
const adminUser = `${prefix}-admin`;
const financeUser = `${prefix}-finance`;
const userId = `${prefix}-member`;
const offeringIds = [1, 2, 3].map(() => randomUUID());
const reservationIds = offeringIds.map(() => randomUUID());
let server: Server | null = null;

const app = express();
app.use((req, _res, next) => {
  Object.assign(req, {
    auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ),
  });
  next();
});
app.use("/operations", operationsAnalyticsRouter);

function iraqToday(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function call(user: string | undefined, date = iraqToday()) {
  const response = await fetch(
    `http://127.0.0.1:${(server!.address() as { port: number }).port}/operations/analytics?from=${date}&to=${date}`,
    { headers: user ? { "x-test-user": user } : {} },
  );
  return { status: response.status, data: await response.json() as Record<string, any> };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(attendance).where(inArray(attendance.offeringId, offeringIds));
  await db.delete(reservations).where(inArray(reservations.offeringId, offeringIds));
  await db.delete(offerings).where(inArray(offerings.id, offeringIds));
  await db.delete(operators).where(inArray(operators.userId, [partnerUser, otherPartnerUser, adminUser, financeUser]));
  await db.delete(partners).where(inArray(partners.id, [partnerId, otherPartnerId]));
  await pool.end();
});

test("analytics are aggregated, date-bounded, and scoped to each approved partner", async () => {
  await db.insert(partners).values([
    { id: partnerId, name: `${prefix} Partner`, groupId: prefix, ownerUserId: partnerUser, approved: true },
    { id: otherPartnerId, name: `${prefix} Other`, groupId: `${prefix}-other`, ownerUserId: otherPartnerUser, approved: true },
  ]);
  await db.insert(operators).values([
    { userId: partnerUser, role: "partner", partnerId },
    { userId: otherPartnerUser, role: "partner", partnerId: otherPartnerId },
    { userId: adminUser, role: "admin", partnerId: null },
    { userId: financeUser, role: "finance", partnerId: null },
  ]);

  const now = new Date();
  const endsAt = new Date(now.getTime() + 60 * 60_000);
  const cancellationDeadline = new Date(now.getTime() - 60_000);
  await db.insert(offerings).values(offeringIds.map((id, index) => ({
    id,
    kind: "facility",
    targetId: `${prefix}-target-${index}`,
    slot: `${prefix}-slot-${index}`,
    title: `${prefix} test class`,
    localizedTitle: { en: "Test class", ar: "حصة اختبار", ku: "پۆلی تاقیکردنەوە" },
    scope: "live",
    partnerId: index === 2 ? otherPartnerId : partnerId,
    accessType: "physical",
    active: true,
    approvalStatus: "published" as const,
    city: "Erbil",
    facility: `${prefix} studio`,
    category: "fitness",
    tiers: [],
    startsAt: now,
    endsAt,
    cancellationDeadline,
    capacity: 10,
  })));
  await db.insert(reservations).values(reservationIds.map((id, index) => ({
    id,
    userId: index === 2 ? `${prefix}-other-member` : userId,
    offeringId: offeringIds[index],
    status: "reserved",
    createdAt: now,
  })));
  await db.insert(attendance).values(reservationIds.map((id, index) => ({
    id: randomUUID(),
    userId: index === 2 ? `${prefix}-other-member` : userId,
    offeringId: offeringIds[index],
    reservationId: id,
    checkedInAt: now,
    verifiedBy: partnerUser,
    status: "confirmed",
    settlementEligible: true,
  })));

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  assert.equal((await call(undefined)).status, 401);
  assert.equal((await call(financeUser)).status, 403);

  const partnerResult = await call(partnerUser);
  assert.equal(partnerResult.status, 200);
  assert.equal(partnerResult.data.role, "partner");
  assert.equal(partnerResult.data.summary.visits, 2);
  assert.equal(partnerResult.data.summary.uniqueCustomers, 1);
  assert.equal(partnerResult.data.summary.repeatCustomers, 1);
  assert.equal(partnerResult.data.summary.retentionRate, 100);
  assert.equal(partnerResult.data.summary.courseEnrollments, null);
  assert.equal(partnerResult.data.partnerPerformance.length, 0);
  assert.ok(!JSON.stringify(partnerResult.data).includes(userId));

  const adminResult = await call(adminUser);
  assert.equal(adminResult.status, 200);
  assert.equal(adminResult.data.role, "admin");
  assert.equal(adminResult.data.summary.visits, 3);
  assert.equal(adminResult.data.summary.activeSubscriptions >= 0, true);
  assert.ok(adminResult.data.unavailableMetrics.includes("revenue"));
  assert.equal(adminResult.data.partnerPerformance.length, 2);
  assert.ok(!JSON.stringify(adminResult.data).includes(userId));

  const invalidRange = await call(adminUser, "2026-02-31");
  assert.equal(invalidRange.status, 400);
});
