import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  attendance, db, financeReviewEvents, financeReviewItems, membershipBilling,
  membershipPlans, offerings, operationAudit, operators, partners, pool, reservations,
} from "@workspace/db";
import operationsRouter from "./operations";

const prefix = `finance-test-${randomUUID()}`;
const requesterId = `${prefix}-requester`;
const reviewerId = `${prefix}-reviewer`;
const adminId = `${prefix}-admin`;
const partnerUserId = `${prefix}-partner`;
const partnerId = `${prefix}-partner-record`;
const billingId = randomUUID();
const planId = randomUUID();
const offeringId = randomUUID();
const reservationId = randomUUID();
const attendanceId = randomUUID();
const reviewIds: string[] = [];
const paymentEnvKeys = [
  "MAYDANGO_PAYMENTS_ENABLED", "MAYDANGO_PAYTABS_TEST_MODE", "MAYDANGO_PAYOUTS_VERIFIED",
  "MAYDANGO_PAYTABS_RECURRING_VERIFIED", "PAYTABS_PROFILE_ID", "PAYTABS_SERVER_KEY",
  "PAYTABS_CALLBACK_URL", "PAYTABS_RETURN_URL",
];
const paymentEnv = Object.fromEntries(paymentEnvKeys.map(key => [key, process.env[key]]));
let server: Server | null = null;

process.env.MAYDANGO_PAYMENTS_ENABLED = "false";
process.env.MAYDANGO_PAYTABS_TEST_MODE = "false";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, {
    auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ),
  });
  next();
});
app.use("/operations", operationsRouter);

const call = async (path: string, userId: string, method = "GET", body?: unknown) => {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json() as Record<string, unknown>;
  return { status: response.status, data };
};

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (reviewIds.length) {
    await db.delete(financeReviewEvents).where(inArray(financeReviewEvents.reviewItemId, reviewIds));
    await db.delete(financeReviewItems).where(inArray(financeReviewItems.id, reviewIds));
  }
  await db.delete(operationAudit).where(inArray(operationAudit.actorId, [requesterId, reviewerId, adminId]));
  await db.delete(attendance).where(eq(attendance.id, attendanceId));
  await db.delete(membershipBilling).where(eq(membershipBilling.id, billingId));
  await db.delete(membershipPlans).where(eq(membershipPlans.id, planId));
  await db.delete(reservations).where(eq(reservations.id, reservationId));
  await db.delete(offerings).where(eq(offerings.id, offeringId));
  await db.delete(operators).where(inArray(operators.userId, [requesterId, reviewerId, adminId, partnerUserId]));
  await db.delete(partners).where(eq(partners.id, partnerId));
  for (const key of paymentEnvKeys) {
    if (paymentEnv[key] === undefined) delete process.env[key];
    else process.env[key] = paymentEnv[key];
  }
  await pool.end();
});

test("finance access is role-restricted and refund reviews enforce replay, separation, and disabled gates", async () => {
  await db.insert(partners).values({
    id: partnerId, name: "Finance test partner", groupId: prefix, ownerUserId: partnerUserId, approved: true,
  });
  await db.insert(operators).values([
    { userId: requesterId, role: "finance", partnerId: null },
    { userId: reviewerId, role: "finance", partnerId: null },
    { userId: adminId, role: "admin", partnerId: null },
    { userId: partnerUserId, role: "partner", partnerId },
  ]);
  await db.insert(membershipPlans).values({
    id: planId, name: "Finance test plan", tier: "M", kind: "paid", durationDays: 30,
    priceIqd: 12000, active: false, rules: { quota: 1, dailyLimit: 1 },
  });
  await db.insert(membershipBilling).values({
    id: billingId, userId: `${prefix}-customer`, planId, status: "active",
    paymentStatus: "paid", amountIqd: 12000, refundStatus: "none",
  });
  const startsAt = new Date(Date.now() + 86_400_000);
  await db.insert(offerings).values({
    id: offeringId, targetId: offeringId, kind: "session", slot: "", title: "Finance test booking",
    scope: "live", partnerId, partnerGroup: prefix, accessType: "physical", active: true,
    city: "baghdad", facility: "Finance test facility", category: "fitness", tiers: ["M"],
    startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000),
    cancellationDeadline: new Date(startsAt.getTime() - 3_600_000), capacity: 2,
  });
  await db.insert(reservations).values({
    id: reservationId, userId: `${prefix}-customer`, offeringId, status: "reserved",
  });
  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/finance", requesterId)).status, 200);
  assert.equal((await call("/operations/finance", partnerUserId)).status, 403);
  assert.equal((await call("/operations/grants", requesterId, "POST", {
    userId: `${prefix}-customer`, planId, reason: "Unauthorized finance role",
  })).status, 403);
  assert.equal((await call(`/operations/bookings/${reservationId}/cancel`, requesterId, "POST", {
    reason: "Finance role may not cancel bookings",
  })).status, 403);
  assert.equal((await call(`/operations/bookings/${reservationId}/cancel`, adminId, "POST", {
    reason: "Duplicate reservation confirmed by customer",
  })).status, 200);
  const [cancelledBooking] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  assert.equal(cancelledBooking.status, "admin_cancelled");
  const bookingAudit = await db.select().from(operationAudit)
    .where(and(eq(operationAudit.actorId, adminId), eq(operationAudit.targetId, reservationId)));
  assert.ok(bookingAudit.some(row => row.action === "booking.admin_cancel"));

  const idempotencyKey = randomUUID();
  const refundBody = { reason: "Customer refund request", idempotencyKey };
  const createdRefund = await call(`/operations/finance/refunds/${billingId}`, requesterId, "POST", refundBody);
  assert.equal(createdRefund.status, 201);
  assert.equal(createdRefund.data.status, "pending");
  const refundId = String(createdRefund.data.id);
  reviewIds.push(refundId);

  const replayedRefund = await call(`/operations/finance/refunds/${billingId}`, requesterId, "POST", refundBody);
  assert.equal(replayedRefund.status, 201);
  assert.equal(replayedRefund.data.id, refundId);
  assert.equal((await call(`/operations/finance/refunds/${billingId}`, reviewerId, "POST", refundBody)).status, 409);

  assert.equal((await call(`/operations/finance/reviews/${refundId}/decision`, requesterId, "POST", {
    decision: "approve", reason: "Self approval attempt",
  })).status, 403);
  assert.equal((await call(`/operations/finance/reviews/${refundId}/decision`, reviewerId, "POST", {
    decision: "approve", reason: "Gate disabled approval attempt",
  })).status, 503);
  const rejectedRefund = await call(`/operations/finance/reviews/${refundId}/decision`, reviewerId, "POST", {
    decision: "reject", reason: "Rejected during controlled test",
  });
  assert.equal(rejectedRefund.status, 200);
  assert.equal(rejectedRefund.data.status, "rejected");
  assert.equal((await call(`/operations/finance/reviews/${refundId}/decision`, reviewerId, "POST", {
    decision: "reject", reason: "Replay the decision",
  })).status, 409);

  const payoutKey = randomUUID();
  const payoutBody = {
    partnerId, periodStart: "2026-10-01", periodEnd: "2026-10-31",
    amountIqd: 25000, reason: "Approved invoice tracking", idempotencyKey: payoutKey,
  };
  const createdPayout = await call("/operations/finance/payouts", requesterId, "POST", payoutBody);
  assert.equal(createdPayout.status, 201);
  assert.equal(createdPayout.data.status, "pending");
  const payoutId = String(createdPayout.data.id);
  reviewIds.push(payoutId);
  const replayedPayout = await call("/operations/finance/payouts", requesterId, "POST", payoutBody);
  assert.equal(replayedPayout.status, 201);
  assert.equal(replayedPayout.data.id, payoutId);
  assert.equal((await call(`/operations/finance/reviews/${payoutId}/decision`, reviewerId, "POST", {
    decision: "approve", reason: "Payout gate is disabled",
  })).status, 503);
  const [stillPending] = await db.select().from(financeReviewItems)
    .where(and(eq(financeReviewItems.id, payoutId), eq(financeReviewItems.status, "pending")));
  assert.ok(stillPending, "payout remains pending; no transfer is performed");

  process.env.MAYDANGO_PAYMENTS_ENABLED = "true";
  process.env.MAYDANGO_PAYTABS_TEST_MODE = "false";
  process.env.MAYDANGO_PAYOUTS_VERIFIED = "true";
  process.env.MAYDANGO_PAYTABS_RECURRING_VERIFIED = "true";
  process.env.PAYTABS_PROFILE_ID = "123456";
  process.env.PAYTABS_SERVER_KEY = "test-only-placeholder";
  process.env.PAYTABS_CALLBACK_URL = "https://finance-test.invalid/callback";
  process.env.PAYTABS_RETURN_URL = "https://finance-test.invalid/return";
  await db.insert(attendance).values({
    id: attendanceId, userId: `${prefix}-attendee`, offeringId, checkedInAt: startsAt,
    verifiedBy: adminId, reservationId: null, status: "disputed", settlementEligible: false,
  });
  assert.equal((await call(`/operations/finance/reviews/${payoutId}/decision`, reviewerId, "POST", {
    decision: "approve", reason: "Blocked by disputed attendance",
  })).status, 409);
  const [stillHeld] = await db.select().from(financeReviewItems)
    .where(and(eq(financeReviewItems.id, payoutId), eq(financeReviewItems.status, "pending")));
  assert.ok(stillHeld, "disputed attendance keeps payout approval pending");

  const manualPayoutBody = {
    ...payoutBody, periodStart: "2026-09-01", periodEnd: "2026-09-30",
    idempotencyKey: randomUUID(), reason: "Manual payout status verification",
  };
  const manualPayout = await call("/operations/finance/payouts", requesterId, "POST", manualPayoutBody);
  assert.equal(manualPayout.status, 201);
  const manualPayoutId = String(manualPayout.data.id);
  reviewIds.push(manualPayoutId);
  const approvedManual = await call(`/operations/finance/reviews/${manualPayoutId}/decision`, reviewerId, "POST", {
    decision: "approve", reason: "Verified period and manual status only",
  });
  assert.equal(approvedManual.status, 200);
  assert.equal(approvedManual.data.status, "approved_manual");

  const events = await db.select().from(financeReviewEvents).where(inArray(financeReviewEvents.reviewItemId, reviewIds));
  assert.ok(events.some(event => event.reviewItemId === refundId && event.action === "requested"));
  assert.ok(events.some(event => event.reviewItemId === refundId && event.action === "rejected"));
  assert.ok(events.some(event => event.reviewItemId === payoutId && event.action === "requested"));
  assert.ok(events.some(event => event.reviewItemId === manualPayoutId && event.action === "approved_manual"));
});
