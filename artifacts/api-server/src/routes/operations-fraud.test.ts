import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, facilityCheckinQrActivity, facilityProfiles, fraudInvestigations, operationAudit, operators, partners, pool,
} from "@workspace/db";
import operationsFraudRouter from "./operations-fraud";

const prefix = `fraud-investigation-${randomUUID()}`;
const complianceAdminId = `${prefix}-compliance`;
const partnerUserId = `${prefix}-partner-user`;
const partnerId = `${prefix}-partner`;
const facilityId = randomUUID();
const activityId = randomUUID();
let server: Server | null = null;

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
app.use("/operations", operationsFraudRouter);
app.get("/operations/other-feature", (_req, res) => res.json({ ok: true }));

async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as unknown };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(fraudInvestigations).where(eq(fraudInvestigations.sourceActivityId, activityId));
  await db.delete(facilityCheckinQrActivity).where(eq(facilityCheckinQrActivity.id, activityId));
  await db.delete(facilityProfiles).where(eq(facilityProfiles.id, facilityId));
  await db.delete(operators).where(inArray(operators.userId, [complianceAdminId, partnerUserId]));
  await db.delete(partners).where(eq(partners.id, partnerId));
  // The audit log is append-only; randomized test entries are intentionally retained.
  await pool.end();
});

test("fraud investigations are restricted, evidence-linked, reviewable, and audited", async () => {
  await db.insert(partners).values({
    id: partnerId, name: `${prefix} partner`, groupId: prefix, ownerUserId: partnerUserId, approved: true,
  });
  await db.insert(facilityProfiles).values({
    id: facilityId, partnerId, city: "Baghdad", facility: `${prefix} facility`,
    localizedName: { en: "Test", ar: "اختبار", ku: "تاقیکردنەوە" },
    localizedDistrict: { en: "District", ar: "منطقة", ku: "ناوچە" },
    localizedAddress: { en: "Address", ar: "عنوان", ku: "ناونیشان" },
    localizedDescription: { en: "Facility", ar: "مرفق", ku: "شوێن" },
    activities: [], amenities: [], accessibility: [],
    openingHours: Array.from({ length: 7 }, (_, day) => ({
      day, closed: true, opensAt: null, closesAt: null,
    })),
    contactPhone: null, websiteUrl: null, latitude: null, longitude: null,
  });
  await db.insert(operators).values([
    { userId: complianceAdminId, role: "fraud_compliance_admin", partnerId: null },
    { userId: partnerUserId, role: "partner", partnerId },
  ]);
  await db.insert(facilityCheckinQrActivity).values({
    id: activityId, facilityId, pointId: null, qrCodeId: null, reservationId: null,
    actorId: `${prefix}-member`, action: "scan_rejected", riskFlag: true,
    reason: "Location verification failed.", createdAt: new Date(),
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/fraud/signals")).status, 401);
  assert.equal((await call("/operations/other-feature")).status, 200);
  assert.equal((await call("/operations/fraud/signals", partnerUserId)).status, 403);
  assert.equal((await call("/operations/fraud/signals", complianceAdminId)).status, 200);

  const queue = await call("/operations/fraud/signals", complianceAdminId);
  const signals = queue.data as Array<{ activityId: string; investigationId: string | null }>;
  assert.equal(signals.some(signal => signal.activityId === activityId && signal.investigationId === null), true);

  await db.update(facilityCheckinQrActivity).set({ riskFlag: false })
    .where(eq(facilityCheckinQrActivity.id, activityId));
  assert.equal((await call("/operations/fraud/investigations", complianceAdminId, "POST", {
    sourceActivityId: activityId,
  })).status, 409);
  await db.update(facilityCheckinQrActivity).set({ riskFlag: true })
    .where(eq(facilityCheckinQrActivity.id, activityId));

  const opened = await call("/operations/fraud/investigations", complianceAdminId, "POST", {
    sourceActivityId: activityId,
  });
  assert.equal(opened.status, 201);
  const investigation = opened.data as { id: string; status: string };
  assert.equal(investigation.status, "open");
  assert.equal((await call("/operations/fraud/investigations", complianceAdminId, "POST", {
    sourceActivityId: activityId,
  })).status, 409);
  assert.equal((await call(`/operations/fraud/investigations/${investigation.id}`, complianceAdminId, "PATCH", {
    status: "action_taken", resolutionReason: "Action already taken.",
  })).status, 409);
  assert.equal((await call(`/operations/fraud/investigations/${investigation.id}`, complianceAdminId, "PATCH", {
    status: "under_review",
  })).status, 200);
  assert.equal((await call(`/operations/fraud/investigations/${investigation.id}`, complianceAdminId, "PATCH", {
    status: "resolved_no_action", resolutionReason: "No",
  })).status, 400);
  const resolved = await call(`/operations/fraud/investigations/${investigation.id}`, complianceAdminId, "PATCH", {
    status: "resolved_no_action",
    resolutionReason: "Review completed; no further action is needed.",
  });
  assert.equal(resolved.status, 200);
  assert.equal((resolved.data as { status: string }).status, "resolved_no_action");

  const refreshed = await call("/operations/fraud/signals", complianceAdminId);
  const updatedSignal = (refreshed.data as Array<{ activityId: string; investigationStatus: string | null }>)
    .find(signal => signal.activityId === activityId);
  assert.equal(updatedSignal?.investigationStatus, "resolved_no_action");

  const auditRows = await db.select({ action: operationAudit.action }).from(operationAudit)
    .where(eq(operationAudit.targetId, investigation.id));
  assert.deepEqual(auditRows.map(row => row.action).sort(), [
    "fraud.investigation.opened",
    "fraud.investigation.status_updated",
    "fraud.investigation.status_updated",
  ]);
});
