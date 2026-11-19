import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  attendance, db, facilityProfiles, facilityQualityAssessments, facilityQualityEmergencyContacts,
  facilityQualityIncidents, facilityReviews, offerings, operationAudit, operators, partners,
  partnerComplianceDocuments, pool, reservations, supportTicketLinks, supportTickets,
} from "@workspace/db";
import qualityControlRouter from "./quality-control";
import operationsRouter from "./operations";
import { runPartnerDocumentExpiryReminders } from "../lib/partner-document-expiry";
import { sendMemberNotification } from "../lib/notifications";

const prefix = `quality-control-${randomUUID()}`;
const partnerA = `${prefix}-partner-a`;
const partnerB = `${prefix}-partner-b`;
const adminUser = `${prefix}-admin`;
const partnerOperationsAdmin = `${prefix}-partner-operations-admin`;
const partnerUserA = `${prefix}-user-a`;
const partnerUserB = `${prefix}-user-b`;
const financeUser = `${prefix}-finance`;
const supportUser = `${prefix}-support`;
const superAdminUser = `${prefix}-super-admin`;
const facilityA = `${prefix}-facility-a`;
const facilityB = `${prefix}-facility-b`;
const userIds = [adminUser, partnerOperationsAdmin, partnerUserA, partnerUserB, financeUser, supportUser, superAdminUser];
const facilityIds = [facilityA, facilityB];
const assessmentIds: string[] = [];
const incidentIds: string[] = [];
const complianceDocumentIds: string[] = [];
const qualityReviewIds: string[] = [];
const qualityAttendanceIds: string[] = [];
const qualityReservationIds: string[] = [];
const qualityOfferingIds: string[] = [];
const complaintTicketIds: string[] = [];
const complaintLinkIds: string[] = [];
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
  if (qualityReviewIds.length) await db.delete(facilityReviews).where(inArray(facilityReviews.id, qualityReviewIds));
  if (complaintLinkIds.length) await db.delete(supportTicketLinks).where(inArray(supportTicketLinks.id, complaintLinkIds));
  if (complaintTicketIds.length) await db.delete(supportTickets).where(inArray(supportTickets.id, complaintTicketIds));
  if (qualityAttendanceIds.length) await db.delete(attendance).where(inArray(attendance.id, qualityAttendanceIds));
  if (qualityReservationIds.length) await db.delete(reservations).where(inArray(reservations.id, qualityReservationIds));
  if (qualityOfferingIds.length) await db.delete(offerings).where(inArray(offerings.id, qualityOfferingIds));
  if (incidentIds.length) await db.delete(facilityQualityIncidents).where(inArray(facilityQualityIncidents.id, incidentIds));
  if (assessmentIds.length) await db.delete(facilityQualityAssessments).where(inArray(facilityQualityAssessments.id, assessmentIds));
  if (complianceDocumentIds.length) await db.delete(partnerComplianceDocuments).where(inArray(partnerComplianceDocuments.id, complianceDocumentIds));
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
    { userId: adminUser, role: "fraud_compliance_admin", partnerId: null, receiveUrgentAlerts: true },
    { userId: partnerOperationsAdmin, role: "partner_operations_admin", partnerId: null },
    { userId: partnerUserA, role: "partner", partnerId: partnerA },
    { userId: partnerUserB, role: "partner", partnerId: partnerB },
    { userId: financeUser, role: "finance", partnerId: null },
    { userId: supportUser, role: "support", partnerId: null, receiveUrgentAlerts: true },
    { userId: superAdminUser, role: "super_admin", partnerId: null, receiveUrgentAlerts: true },
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
    reapprovalAlerts: unknown[];
    complaintAlerts: unknown[];
    ratingAlerts: unknown[];
    emergencyContacts: unknown[];
    complianceDocuments: unknown[];
  };
  assert.deepEqual(scopedData.facilities.map(item => item.id), [facilityA]);
  assert.equal(scopedData.assessments.length, 0);
  assert.equal(scopedData.incidents.length, 0);
  assert.equal(scopedData.expiringDocuments.length, 0);
  assert.equal(scopedData.reapprovalAlerts.length, 0);
  assert.equal(scopedData.complaintAlerts.length, 0);
  assert.equal(scopedData.ratingAlerts.length, 0);
  assert.equal(scopedData.emergencyContacts.length, 0);
  assert.equal(scopedData.complianceDocuments.length, 0);

  const offeringA = `${prefix}-offering-a`;
  const offeringB = `${prefix}-offering-b`;
  qualityOfferingIds.push(offeringA, offeringB);
  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  await db.insert(offerings).values([
    {
      id: offeringA, kind: "facility", targetId: facilityA, title: "Facility A session", scope: "live",
      partnerId: partnerA, city: "Baghdad", facility: `${prefix} facility A`, category: "fitness", tiers: [],
      startsAt, endsAt, cancellationDeadline: startsAt, capacity: 20, active: true,
    },
    {
      id: offeringB, kind: "facility", targetId: facilityB, title: "Facility B session", scope: "live",
      partnerId: partnerB, city: "Baghdad", facility: `${prefix} facility B`, category: "fitness", tiers: [],
      startsAt, endsAt, cancellationDeadline: startsAt, capacity: 20, active: true,
    },
  ]);

  const complaintCases = [
    { category: "facility", type: "booking", ageDays: 1 },
    { category: "safety", type: "booking", ageDays: 5 },
    { category: "facility", type: "checkin", ageDays: 7 },
    { category: "booking", type: "booking", ageDays: 2 },
    { category: "safety", type: "booking", ageDays: 31 },
  ].map(item => ({
    ...item,
    ticketId: randomUUID(),
    userId: `${prefix}-complaint-member-${randomUUID()}`,
    createdAt: new Date(Date.now() - item.ageDays * 86_400_000),
    recordId: randomUUID(),
  }));
  const complaintReservationCases = complaintCases.filter(item => item.type === "booking");
  const complaintCheckinCase = complaintCases.find(item => item.type === "checkin")!;
  qualityReservationIds.push(...complaintReservationCases.map(item => item.recordId));
  qualityAttendanceIds.push(complaintCheckinCase.recordId);
  await db.insert(reservations).values(complaintReservationCases.map(item => ({
    id: item.recordId, userId: item.userId, offeringId: offeringA, status: "confirmed" as const,
    createdAt: item.createdAt,
  })));
  await db.insert(attendance).values([{
    id: complaintCheckinCase.recordId,
    userId: complaintCheckinCase.userId,
    offeringId: offeringA,
    checkedInAt: complaintCheckinCase.createdAt,
    verifiedBy: supportUser,
    status: "confirmed",
  }]);
  complaintTicketIds.push(...complaintCases.map(item => item.ticketId));
  await db.insert(supportTickets).values(complaintCases.map(item => ({
    id: item.ticketId, userId: item.userId, subject: "Facility experience",
    category: item.category, urgent: false, language: "en", status: "open",
    createdAt: item.createdAt, updatedAt: item.createdAt, lastMessageAt: item.createdAt,
  })));
  const complaintLinks = complaintCases.map(item => ({
    id: randomUUID(),
    ticketId: item.ticketId,
    reservationId: item.type === "booking" ? item.recordId : null,
    attendanceId: item.type === "checkin" ? item.recordId : null,
    createdBy: supportUser,
  }));
  complaintLinkIds.push(...complaintLinks.map(item => item.id));
  await db.insert(supportTicketLinks).values(complaintLinks);

  const ratingCases = ["A", "B"].flatMap(group => Array.from({ length: 10 }, (_, index) => ({
    facilityId: group === "A" ? facilityA : facilityB,
    partnerId: group === "A" ? partnerA : partnerB,
    offeringId: group === "A" ? offeringA : offeringB,
    userId: `${prefix}-rating-member-${group}-${index}`,
    reservationId: randomUUID(),
    attendanceId: randomUUID(),
    reviewId: randomUUID(),
    overallRating: group === "A" ? 4 : 3,
  })));
  qualityReservationIds.push(...ratingCases.map(item => item.reservationId));
  qualityAttendanceIds.push(...ratingCases.map(item => item.attendanceId));
  qualityReviewIds.push(...ratingCases.map(item => item.reviewId));
  await db.insert(reservations).values(ratingCases.map(item => ({
    id: item.reservationId, userId: item.userId, offeringId: item.offeringId, status: "confirmed" as const,
  })));
  await db.insert(attendance).values(ratingCases.map(item => ({
    id: item.attendanceId,
    userId: item.userId,
    offeringId: item.offeringId,
    checkedInAt: new Date(),
    verifiedBy: supportUser,
    reservationId: item.reservationId,
    status: "confirmed",
  })));
  await db.insert(facilityReviews).values(ratingCases.map(item => ({
    id: item.reviewId,
    attendanceId: item.attendanceId,
    reservationId: item.reservationId,
    facilityId: item.facilityId,
    partnerId: item.partnerId,
    reviewerUserId: item.userId,
    overallRating: item.overallRating,
    categoryRatings: {
      cleanliness: item.overallRating, staff: item.overallRating, equipment: item.overallRating,
      instructor: item.overallRating, facilities: item.overallRating, informationAccuracy: item.overallRating,
    },
    content: null,
    status: "published",
  })));

  const qualitySignalView = await call("/operations/quality", adminUser);
  assert.equal(qualitySignalView.status, 200);
  const complaintAlerts = (qualitySignalView.data as {
    complaintAlerts: Array<{ facilityId: string; complaintCount: number; windowDays: number }>;
  }).complaintAlerts;
  assert.deepEqual(complaintAlerts.map(item => [item.facilityId, item.complaintCount, item.windowDays]), [[facilityA, 3, 30]]);
  const ratingAlerts = (qualitySignalView.data as {
    ratingAlerts: Array<{ facilityId: string; averageRating: number; reviewCount: number }>;
  }).ratingAlerts;
  assert.deepEqual(ratingAlerts.map(item => [item.facilityId, item.averageRating, item.reviewCount]), [[facilityB, 3, 10]]);
  const partnerAQualitySignals = await call("/operations/quality", partnerUserA);
  assert.deepEqual((partnerAQualitySignals.data as { complaintAlerts: Array<{ facilityId: string }> })
    .complaintAlerts.map(item => item.facilityId), [facilityA]);
  assert.equal((partnerAQualitySignals.data as { ratingAlerts: unknown[] }).ratingAlerts.length, 0);
  const partnerBQualitySignals = await call("/operations/quality", partnerUserB);
  assert.equal((partnerBQualitySignals.data as { complaintAlerts: unknown[] }).complaintAlerts.length, 0);
  assert.deepEqual((partnerBQualitySignals.data as { ratingAlerts: Array<{ facilityId: string }> })
    .ratingAlerts.map(item => item.facilityId), [facilityB]);

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
  const futureMysteryAssessment = await call("/operations/quality/assessments", adminUser, "POST", {
    ...assessmentBody,
    inspectionType: "mystery",
    reviewedOn: dateOffset(1),
  });
  assert.equal(futureMysteryAssessment.status, 400);
  const createdAssessment = await call("/operations/quality/assessments", adminUser, "POST", {
    ...assessmentBody,
    inspectionType: "mystery",
  });
  assert.equal(createdAssessment.status, 201);
  const assessment = createdAssessment.data as { id: string; status: string; inspectionType: string };
  assessmentIds.push(assessment.id);
  assert.equal(assessment.status, "action_required");
  assert.equal(assessment.inspectionType, "mystery");

  const adminDashboard = await call("/operations/quality", adminUser);
  assert.equal(adminDashboard.status, 200);
  const firstAlerts = (adminDashboard.data as { expiringDocuments: Array<{ documentType: string; daysRemaining: number }> })
    .expiringDocuments;
  assert.deepEqual(firstAlerts.map(item => item.documentType), ["licence", "insurance"]);
  assert.deepEqual(firstAlerts.map(item => item.daysRemaining), [10, 20]);

  const passingChecklist = {
    cleanliness: "pass", changingAreas: "pass", showers: "pass", waterSanitation: "pass",
  };
  const passingSafetyChecklist = {
    emergencyExits: "pass", firstAid: "pass", equipmentCondition: "pass", incidentPlan: "pass",
  };
  const dueSoonAssessment = await call("/operations/quality/assessments", adminUser, "POST", {
    ...assessmentBody,
    reviewedOn: dateOffset(-1),
    nextReviewOn: dateOffset(14),
    licenceExpiresOn: null,
    insuranceExpiresOn: null,
    hygieneChecklist: passingChecklist,
    safetyChecklist: passingSafetyChecklist,
    status: "approved",
    findings: "Facility inspection completed successfully.",
    correctiveAction: null,
    correctiveDueOn: null,
  });
  assert.equal(dueSoonAssessment.status, 201);
  const dueSoonAssessmentData = dueSoonAssessment.data as { id: string; inspectionType: string };
  const dueSoonAssessmentId = dueSoonAssessmentData.id;
  assert.equal(dueSoonAssessmentData.inspectionType, "routine");
  assessmentIds.push(dueSoonAssessmentId);
  const overdueAssessment = await call("/operations/quality/assessments", adminUser, "POST", {
    ...assessmentBody,
    facilityId: facilityB,
    reviewedOn: dateOffset(-6),
    nextReviewOn: dateOffset(-2),
    licenceExpiresOn: null,
    insuranceExpiresOn: null,
    hygieneChecklist: passingChecklist,
    safetyChecklist: passingSafetyChecklist,
    status: "approved",
    findings: "Facility inspection completed successfully.",
    correctiveAction: null,
    correctiveDueOn: null,
  });
  assert.equal(overdueAssessment.status, 201);
  assessmentIds.push((overdueAssessment.data as { id: string }).id);
  const reapprovalAdminView = await call("/operations/quality", adminUser);
  const reapprovalAlerts = (reapprovalAdminView.data as {
    reapprovalAlerts: Array<{ facilityId: string; alertStatus: string; nextReviewOn: string }>;
  }).reapprovalAlerts;
  assert.deepEqual(reapprovalAlerts.map(item => item.facilityId), [facilityB, facilityA]);
  assert.equal(reapprovalAlerts[0]?.alertStatus, "overdue");
  assert.equal(reapprovalAlerts[1]?.alertStatus, "due_soon");
  assert.equal(reapprovalAlerts[0]?.nextReviewOn.slice(0, 10), dateOffset(-2));
  assert.equal(reapprovalAlerts[1]?.nextReviewOn.slice(0, 10), dateOffset(14));
  const partnerAReapprovals = await call("/operations/quality", partnerUserA);
  assert.deepEqual((partnerAReapprovals.data as { reapprovalAlerts: Array<{ facilityId: string }> })
    .reapprovalAlerts.map(item => item.facilityId), [facilityA]);
  const partnerBReapprovals = await call("/operations/quality", partnerUserB);
  assert.deepEqual((partnerBReapprovals.data as { reapprovalAlerts: Array<{ facilityId: string }> })
    .reapprovalAlerts.map(item => item.facilityId), [facilityB]);

  const approvedDocumentId = randomUUID();
  const reviewDocumentId = randomUUID();
  const otherPartnerDocumentId = randomUUID();
  const pendingDocumentId = randomUUID();
  complianceDocumentIds.push(approvedDocumentId, reviewDocumentId, otherPartnerDocumentId, pendingDocumentId);
  await db.insert(partnerComplianceDocuments).values([
    {
      id: approvedDocumentId, partnerId: partnerA, facilityId: facilityA, documentType: "licence",
      documentName: "operating-licence.pdf", documentPath: `/objects/partner-compliance/${partnerA}/${facilityA}/${approvedDocumentId}`,
      contentType: "application/pdf", fileSize: 2048, expiresOn: dateOffset(3), status: "approved",
      uploadedBy: partnerUserA, reviewedBy: adminUser, reviewedAt: new Date(),
    },
    {
      id: reviewDocumentId, partnerId: partnerA, facilityId: facilityA, documentType: "supporting_document",
      documentName: "facility-plan.png", documentPath: `/objects/partner-compliance/${partnerA}/${facilityA}/${reviewDocumentId}`,
      contentType: "image/png", fileSize: 1024, expiresOn: null, status: "submitted", uploadedBy: partnerUserA,
    },
    {
      id: otherPartnerDocumentId, partnerId: partnerB, facilityId: facilityB, documentType: "insurance",
      documentName: "insurance.pdf", documentPath: `/objects/partner-compliance/${partnerB}/${facilityB}/${otherPartnerDocumentId}`,
      contentType: "application/pdf", fileSize: 4096, expiresOn: dateOffset(2), status: "submitted", uploadedBy: partnerUserB,
    },
    {
      id: pendingDocumentId, partnerId: partnerA, facilityId: facilityA, documentType: "insurance",
      documentName: "pending-insurance.pdf", documentPath: `/objects/partner-compliance/${partnerA}/${facilityA}/${pendingDocumentId}`,
      expiresOn: dateOffset(1), status: "upload_pending", uploadedBy: partnerUserA,
    },
  ]);
  const partnerDocumentsView = await call("/operations/quality", partnerUserA);
  assert.equal(partnerDocumentsView.status, 200);
  const partnerDocuments = (partnerDocumentsView.data as { complianceDocuments: Array<{ id: string; status: string }> }).complianceDocuments;
  assert.deepEqual(partnerDocuments.map(item => item.id).sort(), [approvedDocumentId, reviewDocumentId].sort());
  assert.ok(partnerDocuments.every(item => item.id !== otherPartnerDocumentId && item.id !== pendingDocumentId));
  const adminDocumentsView = await call("/operations/quality", adminUser);
  const adminDocuments = (adminDocumentsView.data as {
    complianceDocuments: Array<{ id: string }>;
    expiringDocuments: Array<{ documentType: string; daysRemaining: number }>;
  });
  assert.deepEqual(adminDocuments.complianceDocuments.map(item => item.id).sort(),
    [approvedDocumentId, reviewDocumentId, otherPartnerDocumentId].sort());
  assert.deepEqual(adminDocuments.expiringDocuments.map(item => item.daysRemaining), [3, 20]);
  const reminderCalls: Array<{
    userId: string;
    kind: string;
    dedupeKey: string | undefined;
    qualityRecord: {
      facilityId: string;
      documentType: string;
      expiresOn: string;
      phase: string;
    } | undefined;
  }> = [];
  const fakeNotification: typeof sendMemberNotification = async (userId, kind, context) => {
    reminderCalls.push({
      userId,
      kind,
      dedupeKey: context?.dedupeKey,
      qualityRecord: context?.qualityRecord,
    });
    return { status: "sent" };
  };

  const initialRun = await runPartnerDocumentExpiryReminders(new Date(), fakeNotification);
  const facilityAReminders = reminderCalls.filter(call => call.qualityRecord?.facilityId === facilityA);
  assert.ok(facilityAReminders.some(call =>
    call.kind === "partner_document_expiry_upcoming" && call.qualityRecord?.documentType === "licence",
  ));
  assert.ok(facilityAReminders.some(call =>
    call.kind === "partner_document_expiry_upcoming" && call.qualityRecord?.documentType === "insurance",
  ));
  assert.ok(facilityAReminders.some(call => call.userId === superAdminUser));
  assert.ok(facilityAReminders.every(call => call.userId !== supportUser && call.userId !== adminUser));
  assert.equal(initialRun.attempts, reminderCalls.length);
  assert.ok(facilityAReminders.every(call =>
    Object.keys(call.qualityRecord ?? {}).sort().join(",") === "documentType,expiresOn,facilityId,phase",
  ));

  const initialKeys = reminderCalls
    .filter(call => call.qualityRecord?.facilityId === facilityA)
    .map(call => call.dedupeKey)
    .sort();
  reminderCalls.length = 0;
  await runPartnerDocumentExpiryReminders(new Date(), fakeNotification);
  assert.deepEqual(
    reminderCalls.filter(call => call.qualityRecord?.facilityId === facilityA)
      .map(call => call.dedupeKey).sort(),
    initialKeys,
  );

  reminderCalls.length = 0;
  await runPartnerDocumentExpiryReminders(new Date(Date.now() + 5 * 86_400_000), fakeNotification);
  assert.ok(reminderCalls.some(call =>
    call.qualityRecord?.facilityId === facilityA
    && call.qualityRecord.documentType === "licence"
    && call.kind === "partner_document_expiry_overdue",
  ));

  assert.equal((await call(`/operations/quality/documents/${approvedDocumentId}/file`, partnerUserB)).status, 404);
  const invalidScopeUpload = await call("/operations/quality/documents/upload-url", partnerUserA, "POST", {
    facilityId: facilityB, documentType: "licence", documentName: "licence.pdf", size: 1024, expiresOn: dateOffset(30),
  });
  assert.equal(invalidScopeUpload.status, 404);
  const unsupportedUpload = await call("/operations/quality/documents/upload-url", partnerUserA, "POST", {
    facilityId: facilityA, documentType: "licence", documentName: "licence.exe", size: 1024, expiresOn: dateOffset(30),
  });
  assert.equal(unsupportedUpload.status, 400);
  assert.equal((await call(`/operations/quality/documents/${pendingDocumentId}/complete`, partnerUserB, "POST")).status, 404);
  assert.equal((await call(`/operations/quality/documents/${reviewDocumentId}/review`, partnerUserA, "PATCH", {
    status: "approved", reviewNote: null,
  })).status, 403);
  assert.equal((await call(`/operations/quality/documents/${reviewDocumentId}/review`, adminUser, "PATCH", {
    status: "rejected", reviewNote: null,
  })).status, 400);
  const reviewedDocument = await call(`/operations/quality/documents/${reviewDocumentId}/review`, adminUser, "PATCH", {
    status: "rejected", reviewNote: "The uploaded facility plan is not readable.",
  });
  assert.equal(reviewedDocument.status, 200);
  assert.equal((reviewedDocument.data as { status: string }).status, "rejected");

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
  assert.deepEqual(
    (refreshedDashboard.data as { expiringDocuments: Array<{ daysRemaining: number }> }).expiringDocuments
      .map(item => item.daysRemaining),
    [3],
  );

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
    complianceDocuments: Array<{ id: string; status: string }>;
  };
  assert.deepEqual(history.assessments.map(item => item.id), [
    refreshedAssessment.id, dueSoonAssessmentId, assessment.id,
  ]);
  assert.deepEqual(history.incidents.map(item => item.id), [incident.id]);
  assert.equal(history.incidents[0].status, "resolved");
  assert.deepEqual(
    (history.expiringDocuments as Array<{ daysRemaining: number }>).map(item => item.daysRemaining),
    [3],
  );
  assert.deepEqual(
    history.complianceDocuments.map(item => [item.id, item.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [[approvedDocumentId, "approved"], [reviewDocumentId, "rejected"]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
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
  const documentAuditRows = await db.select().from(operationAudit).where(and(
    eq(operationAudit.targetId, reviewDocumentId),
    eq(operationAudit.action, "partner.compliance_document.rejected"),
  ));
  assert.equal(documentAuditRows.length, 1);
  assert.ok(!documentAuditRows[0].detail?.includes("facility-plan.png"));

  const renewedLicenceId = randomUUID();
  complianceDocumentIds.push(renewedLicenceId);
  await db.insert(partnerComplianceDocuments).values({
    id: renewedLicenceId, partnerId: partnerA, facilityId: facilityA, documentType: "licence",
    documentName: "renewed-licence.pdf",
    documentPath: `/objects/partner-compliance/${partnerA}/${facilityA}/${renewedLicenceId}`,
    contentType: "application/pdf", fileSize: 2048, expiresOn: dateOffset(50), status: "approved",
    uploadedBy: partnerUserA, reviewedBy: adminUser, reviewedAt: new Date(),
    createdAt: new Date(Date.now() + 5_000), updatedAt: new Date(Date.now() + 5_000),
  });
  reminderCalls.length = 0;
  await runPartnerDocumentExpiryReminders(new Date(), fakeNotification);
  assert.ok(!reminderCalls.some(call =>
    call.qualityRecord?.facilityId === facilityA && call.qualityRecord.documentType === "licence",
  ), "an approved renewal suppresses reminders for the expired licence");
});
