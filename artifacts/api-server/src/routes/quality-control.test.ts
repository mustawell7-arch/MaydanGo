import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, facilityProfiles, facilityQualityAssessments, facilityQualityIncidents,
  operationAudit, operators, partners, pool,
} from "@workspace/db";
import qualityControlRouter from "./quality-control";
import operationsRouter from "./operations";

const prefix = `quality-control-${randomUUID()}`;
const partnerA = `${prefix}-partner-a`;
const partnerB = `${prefix}-partner-b`;
const adminUser = `${prefix}-admin`;
const partnerUserA = `${prefix}-user-a`;
const partnerUserB = `${prefix}-user-b`;
const financeUser = `${prefix}-finance`;
const supportUser = `${prefix}-support`;
const facilityA = `${prefix}-facility-a`;
const facilityB = `${prefix}-facility-b`;
const userIds = [adminUser, partnerUserA, partnerUserB, financeUser, supportUser];
const facilityIds = [facilityA, facilityB];
const assessmentIds: string[] = [];
const incidentIds: string[] = [];
let server: Server | null = null;

const openingHours = Array.from({ length: 7 }, (_, day) => ({
  day, closed: true, opensAt: null, closesAt: null,
}));
function profile(name: string) {
  return {
    city: "Baghdad",
    facility: name,
    localizedName: { en: name, ar: `مرفق ${name}`, ku: `شوێنی ${name}` },
    localizedDistrict: { en: "Test district", ar: "منطقة اختبار", ku: "ناوچەی تاقیکردنەوە" },
    localizedAddress: { en: "Test address", ar: "عنوان اختبار", ku: "ناونیشانی تاقیکردنەوە" },
    localizedDescription: { en: "Test facility", ar: "مرفق اختباري", ku: "شوێنی تاقیکردنەوە" },
    activities: [], amenities: [], accessibility: [], openingHours,
    contactPhone: null, websiteUrl: null, latitude: null, longitude: null,
  };
}

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
app.use("/operations/quality", qualityControlRouter);
app.use("/operations", operationsRouter);

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
  if (incidentIds.length) await db.delete(facilityQualityIncidents).where(inArray(facilityQualityIncidents.id, incidentIds));
  if (assessmentIds.length) await db.delete(facilityQualityAssessments).where(inArray(facilityQualityAssessments.id, assessmentIds));
  await db.delete(facilityProfiles).where(inArray(facilityProfiles.id, facilityIds));
  await db.delete(operators).where(inArray(operators.userId, userIds));
  await db.delete(partners).where(inArray(partners.id, [partnerA, partnerB]));
  // operation_audit is append-only; randomized audit rows are intentionally retained.
  await pool.end();
});

test("facility quality records are scoped, validated, and audited", async () => {
  await db.insert(partners).values([
    { id: partnerA, name: `${prefix} partner A`, groupId: prefix, ownerUserId: partnerUserA, approved: true },
    { id: partnerB, name: `${prefix} partner B`, groupId: prefix, ownerUserId: partnerUserB, approved: true },
  ]);
  await db.insert(operators).values([
    { userId: adminUser, role: "admin", partnerId: null },
    { userId: partnerUserA, role: "partner", partnerId: partnerA },
    { userId: partnerUserB, role: "partner", partnerId: partnerB },
    { userId: financeUser, role: "finance", partnerId: null },
    { userId: supportUser, role: "support", partnerId: null },
  ]);
  await db.insert(facilityProfiles).values([
    { id: facilityA, partnerId: partnerA, ...profile(`${prefix} facility A`) },
    { id: facilityB, partnerId: partnerB, ...profile(`${prefix} facility B`) },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/quality")).status, 401);
  assert.equal((await call("/operations/quality", financeUser)).status, 403);
  assert.equal((await call("/operations/quality", supportUser)).status, 403);

  const scoped = await call("/operations/quality", partnerUserA);
  assert.equal(scoped.status, 200);
  const scopedData = scoped.data as { facilities: Array<{ id: string }>; assessments: unknown[]; incidents: unknown[] };
  assert.deepEqual(scopedData.facilities.map(item => item.id), [facilityA]);
  assert.equal(scopedData.assessments.length, 0);
  assert.equal(scopedData.incidents.length, 0);

  const inspection = await call("/operations/quality/assessments", partnerUserA, "POST", {});
  assert.equal(inspection.status, 403);
  const assessmentBody = {
    facilityId: facilityA,
    reviewedOn: "2026-11-07",
    nextReviewOn: "2027-02-07",
    licenceExpiresOn: "2027-06-30",
    insuranceExpiresOn: "2027-04-30",
    hygieneChecklist: {
      cleanliness: "action_required", changingAreas: "pass", showers: "pass", waterSanitation: "pass",
    },
    safetyChecklist: {
      emergencyExits: "pass", firstAid: "pass", equipmentCondition: "pass", incidentPlan: "pass",
    },
    status: "action_required",
    findings: "One hygiene item needs follow-up.",
    correctiveAction: "Complete the cleaning review and record the result.",
    correctiveDueOn: "2026-11-21",
  };
  const createdAssessment = await call("/operations/quality/assessments", adminUser, "POST", assessmentBody);
  assert.equal(createdAssessment.status, 201);
  const assessment = createdAssessment.data as { id: string; status: string };
  assessmentIds.push(assessment.id);
  assert.equal(assessment.status, "action_required");

  const attemptedApproval = await call(`/operations/quality/assessments/${assessment.id}`, adminUser, "PATCH", {
    status: "approved", correctiveAction: null, correctiveDueOn: null,
  });
  assert.equal(attemptedApproval.status, 400);

  const crossPartnerIncident = await call("/operations/quality/incidents", partnerUserA, "POST", {
    facilityId: facilityB,
    incidentType: "safety",
    occurredAt: "2026-11-07T10:00:00.000Z",
    description: "A test report that must remain partner scoped.",
  });
  assert.equal(crossPartnerIncident.status, 404);

  const createdIncident = await call("/operations/quality/incidents", partnerUserA, "POST", {
    facilityId: facilityA,
    incidentType: "equipment",
    occurredAt: "2026-11-07T10:00:00.000Z",
    description: "A damaged exercise machine was identified.",
  });
  assert.equal(createdIncident.status, 201);
  const incident = createdIncident.data as { id: string; status: string };
  incidentIds.push(incident.id);
  assert.equal(incident.status, "open");
  assert.equal((await call(`/operations/facilities/${facilityA}`, adminUser, "DELETE")).status, 409);
  assert.equal((await call(`/operations/quality/incidents/${incident.id}`, partnerUserA, "PATCH", {
    status: "resolved", resolution: "Fixed.",
  })).status, 403);
  assert.equal((await call(`/operations/quality/incidents/${incident.id}`, adminUser, "PATCH", {
    status: "resolved", resolution: null,
  })).status, 400);
  assert.equal((await call(`/operations/quality/incidents/${incident.id}`, adminUser, "PATCH", {
    status: "resolved", resolution: "The partner replaced the damaged machine.",
  })).status, 200);

  const partnerHistory = await call("/operations/quality", partnerUserA);
  assert.equal(partnerHistory.status, 200);
  const history = partnerHistory.data as { assessments: Array<{ id: string }>; incidents: Array<{ id: string; status: string }> };
  assert.deepEqual(history.assessments.map(item => item.id), [assessment.id]);
  assert.deepEqual(history.incidents.map(item => item.id), [incident.id]);
  assert.equal(history.incidents[0].status, "resolved");

  const auditRows = await db.select().from(operationAudit).where(and(
    inArray(operationAudit.targetId, [assessment.id, incident.id]),
    inArray(operationAudit.action, [
      "facility.quality.assessment.created",
      "facility.quality.incident.created",
      "facility.quality.incident.review",
    ]),
  ));
  assert.equal(auditRows.length, 3);
});
