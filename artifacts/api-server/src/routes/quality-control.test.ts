import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, facilityProfiles, facilityQualityAssessments, facilityQualityEmergencyContacts, facilityQualityIncidents,
  operationAudit, operators, partners, pool,
} from "@workspace/db";
import qualityControlRouter from "./quality-control";
import operationsRouter from "./operations";

const prefix = `quality-control-${randomUUID()}`;
const partnerA = `${prefix}-partner-a`;
const partnerB = `${prefix}-partner-b`;
const adminUser = `${prefix}-admin`;
const partnerOperationsAdmin = `${prefix}-partner-operations-admin`;
const partnerUserA = `${prefix}-user-a`;
const partnerUserB = `${prefix}-user-b`;
const financeUser = `${prefix}-finance`;
const supportUser = `${prefix}-support`;
const facilityA = `${prefix}-facility-a`;
const facilityB = `${prefix}-facility-b`;
const userIds = [adminUser, partnerOperationsAdmin, partnerUserA, partnerUserB, financeUser, supportUser];
const facilityIds = [facilityA, facilityB];
const assessmentIds: string[] = [];
const incidentIds: string[] = [];
let server: Server | null = null;
const dateOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

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
  await db.delete(facilityQualityEmergencyContacts)
    .where(inArray(facilityQualityEmergencyContacts.facilityId, facilityIds));
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
    { userId: adminUser, role: "fraud_compliance_admin", partnerId: null },
    { userId: partnerOperationsAdmin, role: "partner_operations_admin", partnerId: null },
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
  const scopedData = scoped.data as {
    facilities: Array<{ id: string }>;
    assessments: unknown[];
    incidents: unknown[];
    expiringDocuments: unknown[];
    emergencyContacts: unknown[];
  };
  assert.deepEqual(scopedData.facilities.map(item => item.id), [facilityA]);
  assert.equal(scopedData.assessments.length, 0);
  assert.equal(scopedData.incidents.length, 0);
  assert.equal(scopedData.expiringDocuments.length, 0);
  assert.equal(scopedData.emergencyContacts.length, 0);

  const emergencyContactBody = {
    contactName: "Venue safety lead",
    contactRole: "Facility manager",
    contactPhone: "+964 770 000 0000",
    verified: false,
  };
  assert.equal((await call(`/operations/quality/emergency-contacts/${facilityB}`, partnerUserA, "PUT", emergencyContactBody)).status, 404);
  const createdContactResult = await call(
    `/operations/quality/emergency-contacts/${facilityA}`, partnerUserA, "PUT", emergencyContactBody,
  );
  assert.equal(createdContactResult.status, 200);
  const createdContact = createdContactResult.data as { verificationStatus: string; contactPhone: string };
  assert.equal(createdContact.verificationStatus, "pending");
  assert.equal(createdContact.contactPhone, emergencyContactBody.contactPhone);
  assert.equal((await call(
    `/operations/quality/emergency-contacts/${facilityA}`, partnerUserA, "PUT", { ...emergencyContactBody, verified: true },
  )).status, 403);
  const verifiedContactResult = await call(
    `/operations/quality/emergency-contacts/${facilityA}`, adminUser, "PUT", { ...emergencyContactBody, verified: true },
  );
  assert.equal(verifiedContactResult.status, 200);
  assert.equal((verifiedContactResult.data as { verificationStatus: string }).verificationStatus, "verified");
  const changedContactResult = await call(
    `/operations/quality/emergency-contacts/${facilityA}`, partnerUserA, "PUT", {
      ...emergencyContactBody, contactPhone: "+964 770 111 0000",
    },
  );
  assert.equal(changedContactResult.status, 200);
  assert.equal((changedContactResult.data as { verificationStatus: string }).verificationStatus, "pending");
  const otherPartnerContactView = await call("/operations/quality", partnerUserB);
  assert.equal(otherPartnerContactView.status, 200);
  assert.equal((otherPartnerContactView.data as { emergencyContacts: unknown[] }).emergencyContacts.length, 0);

  const inspection = await call("/operations/quality/assessments", partnerUserA, "POST", {});
  assert.equal(inspection.status, 403);
  const assessmentBody = {
    facilityId: facilityA,
    reviewedOn: dateOffset(-3),
    nextReviewOn: dateOffset(60),
    licenceExpiresOn: dateOffset(10),
    insuranceExpiresOn: dateOffset(20),
    hygieneChecklist: {
      cleanliness: "action_required", changingAreas: "pass", showers: "pass", waterSanitation: "pass",
    },
    safetyChecklist: {
      emergencyExits: "pass", firstAid: "pass", equipmentCondition: "pass", incidentPlan: "pass",
    },
    status: "action_required",
    findings: "One hygiene item needs follow-up.",
    correctiveAction: "Complete the cleaning review and record the result.",
    correctiveDueOn: dateOffset(7),
  };
  const createdAssessment = await call("/operations/quality/assessments", adminUser, "POST", assessmentBody);
  assert.equal(createdAssessment.status, 201);
  const assessment = createdAssessment.data as { id: string; status: string };
  assessmentIds.push(assessment.id);
  assert.equal(assessment.status, "action_required");

  const adminDashboard = await call("/operations/quality", adminUser);
  assert.equal(adminDashboard.status, 200);
  const firstAlerts = (adminDashboard.data as { expiringDocuments: Array<{ documentType: string; daysRemaining: number }> })
    .expiringDocuments;
  assert.deepEqual(firstAlerts.map(item => item.documentType), ["licence", "insurance"]);
  assert.deepEqual(firstAlerts.map(item => item.daysRemaining), [10, 20]);

  const refreshedAssessmentResult = await call("/operations/quality/assessments", adminUser, "POST", {
    ...assessmentBody,
    reviewedOn: dateOffset(-1),
    licenceExpiresOn: dateOffset(45),
    insuranceExpiresOn: dateOffset(60),
  });
  assert.equal(refreshedAssessmentResult.status, 201);
  const refreshedAssessment = refreshedAssessmentResult.data as { id: string };
  assessmentIds.push(refreshedAssessment.id);
  const refreshedDashboard = await call("/operations/quality", adminUser);
  assert.equal(refreshedDashboard.status, 200);
  assert.equal((refreshedDashboard.data as { expiringDocuments: unknown[] }).expiringDocuments.length, 0);

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
  assert.equal((await call(`/operations/facilities/${facilityA}`, partnerOperationsAdmin, "DELETE")).status, 409);
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
  const history = partnerHistory.data as {
    assessments: Array<{ id: string }>;
    incidents: Array<{ id: string; status: string }>;
    expiringDocuments: unknown[];
    emergencyContacts: Array<{ facilityId: string; contactPhone: string; verificationStatus: string }>;
  };
  assert.deepEqual(history.assessments.map(item => item.id), [refreshedAssessment.id, assessment.id]);
  assert.deepEqual(history.incidents.map(item => item.id), [incident.id]);
  assert.equal(history.incidents[0].status, "resolved");
  assert.equal(history.expiringDocuments.length, 0);
  assert.deepEqual(history.emergencyContacts.map(item => ({
    facilityId: item.facilityId,
    contactPhone: item.contactPhone,
    verificationStatus: item.verificationStatus,
  })), [{
    facilityId: facilityA,
    contactPhone: "+964 770 111 0000",
    verificationStatus: "pending",
  }]);

  const auditRows = await db.select().from(operationAudit).where(and(
    inArray(operationAudit.targetId, [assessment.id, refreshedAssessment.id, incident.id, facilityA]),
    inArray(operationAudit.action, [
      "facility.quality.assessment.created",
      "facility.quality.incident.created",
      "facility.quality.incident.review",
      "facility.quality.emergency_contact.updated",
    ]),
  ));
  assert.equal(auditRows.length, 7);
  const contactAuditRows = auditRows.filter(row => row.action === "facility.quality.emergency_contact.updated");
  assert.equal(contactAuditRows.length, 3);
  assert.ok(contactAuditRows.every(row => !row.detail?.includes("770")));
});
