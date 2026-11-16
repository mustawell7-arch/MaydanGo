import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, facilityProfiles, operationAudit, offerings, operators, partners, pool, reservations,
} from "@workspace/db";
import operationsRouter from "./operations";

const prefix = `offering-approval-test-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const partnerUserId = `${prefix}-operator`;
const otherPartnerId = `${prefix}-other-partner`;
const otherPartnerUserId = `${prefix}-other-operator`;
const adminUserId = `${prefix}-admin`;
const superAdminUserId = `${prefix}-super-admin`;
const memberId = `${prefix}-member`;
const facilityId = `${prefix}-facility`;
const otherFacilityId = `${prefix}-other-facility`;
let server: Server | null = null;
let createdOfferingIds: string[] = [];
const actorIds = [partnerUserId, otherPartnerUserId, adminUserId, superAdminUserId];

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

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json() as unknown;
  return { status: response.status, data };
}

const facilityValues = (id: string, ownerPartnerId: string) => ({
  id,
  partnerId: ownerPartnerId,
  city: "Baghdad",
  facility: "Studio",
  localizedName: { en: "Test studio", ar: "استوديو اختبار", ku: "ستۆدیۆی تاقیکردنەوە" },
  localizedDistrict: { en: "Test district", ar: "منطقة اختبار", ku: "ناوچەی تاقیکردنەوە" },
  localizedAddress: { en: "Test address", ar: "عنوان اختبار", ku: "ناونیشانی تاقیکردنەوە" },
  localizedDescription: { en: "Test facility", ar: "مرفق اختبار", ku: "شوێنی تاقیکردنەوە" },
  activities: [{ en: "fitness", ar: "لياقة", ku: "وەرزش" }], amenities: [], accessibility: [],
  openingHours: Array.from({ length: 7 }, (_, day) => ({ day, closed: true, opensAt: null, closesAt: null })),
  contactPhone: null, websiteUrl: null, latitude: null, longitude: null,
});

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (createdOfferingIds.length) {
    await db.delete(reservations).where(inArray(reservations.offeringId, createdOfferingIds));
    await db.delete(offerings).where(inArray(offerings.id, createdOfferingIds));
  }
  // operation_audit is append-only; randomized test records are intentionally retained.
  await db.delete(facilityProfiles).where(inArray(facilityProfiles.id, [facilityId, otherFacilityId]));
  await db.delete(operators).where(inArray(operators.userId, actorIds));
  await db.delete(partners).where(inArray(partners.id, [partnerId, otherPartnerId]));
  await pool.end();
});

test("activity review is scoped, audited, and cannot bypass booking safeguards", async () => {
  await db.insert(partners).values([
    { id: partnerId, name: prefix, groupId: prefix, ownerUserId: partnerUserId, approved: true },
    { id: otherPartnerId, name: `${prefix}-other`, groupId: `${prefix}-other`, ownerUserId: otherPartnerUserId, approved: true },
  ]);
  await db.insert(operators).values([
    { userId: partnerUserId, role: "partner", partnerId },
    { userId: otherPartnerUserId, role: "partner", partnerId: otherPartnerId },
    { userId: adminUserId, role: "partner_operations_admin", partnerId: null },
    { userId: superAdminUserId, role: "super_admin", partnerId: null },
  ]);
  await db.insert(facilityProfiles).values([
    facilityValues(facilityId, partnerId),
    facilityValues(otherFacilityId, otherPartnerId),
  ]);

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const payload = {
    partnerId,
    title: "Approval test class",
    kind: "session",
    city: "Baghdad",
    facility: "Studio",
    category: "fitness",
    accessType: "physical",
    tiers: ["M"],
    startsAt: "2099-03-14T09:00:00+03:00",
    endsAt: "2099-03-14T10:00:00+03:00",
    cancellationDeadline: "2099-03-14T08:00:00+03:00",
    capacity: 2,
    active: false,
  };
  const unlistedCategory = await call("/operations/offerings", partnerUserId, "POST", {
    ...payload, category: "unlisted",
  });
  assert.equal(unlistedCategory.status, 400);
  const created = await call("/operations/offerings", partnerUserId, "POST", payload);
  assert.equal(created.status, 201);
  const activity = created.data as { id: string; approvalStatus: string; active: boolean };
  createdOfferingIds = [activity.id];
  assert.equal(activity.approvalStatus, "draft");
  assert.equal(activity.active, false);

  assert.equal((await call(`/operations/offerings/${activity.id}/submit`, otherPartnerUserId, "POST")).status, 403);
  const directPublishAttempt = await call(`/operations/offerings/${activity.id}`, partnerUserId, "PATCH", {
    capacity: 2, active: true,
  });
  assert.equal(directPublishAttempt.status, 400);
  const [stillDraft] = await db.select().from(offerings).where(eq(offerings.id, activity.id));
  assert.equal(stillDraft.approvalStatus, "draft");
  assert.equal(stillDraft.active, false);
  assert.equal((await call(`/operations/offerings/${activity.id}/submit`, partnerUserId, "POST")).status, 200);
  assert.equal((await call(`/operations/offerings/${activity.id}/review`, partnerUserId, "PATCH", {
    status: "approved",
  })).status, 403);

  const underReview = await call(`/operations/offerings/${activity.id}/review`, adminUserId, "PATCH", {
    status: "under_review",
  });
  assert.equal(underReview.status, 200);
  assert.equal((underReview.data as { approvalStatus: string; reviewedBy: string }).approvalStatus, "under_review");
  assert.equal((underReview.data as { reviewedBy: string }).reviewedBy, adminUserId);

  const correction = await call(`/operations/offerings/${activity.id}/review`, adminUserId, "PATCH", {
    status: "changes_requested",
    reason: "Clarify the session access and safety details.",
  });
  assert.equal(correction.status, 200);
  assert.equal((correction.data as { approvalReason: string }).approvalReason, "Clarify the session access and safety details.");

  assert.equal((await call(`/operations/offerings/${activity.id}/respond`, otherPartnerUserId, "POST", {
    response: "Updated the requested details.",
  })).status, 403);
  const response = await call(`/operations/offerings/${activity.id}/respond`, partnerUserId, "POST", {
    response: "Updated the requested details.",
  });
  assert.equal(response.status, 200);
  assert.equal((response.data as { approvalStatus: string; partnerResponse: string }).approvalStatus, "submitted");
  assert.equal((response.data as { partnerResponse: string }).partnerResponse, "Updated the requested details.");

  assert.equal((await call(`/operations/offerings/${activity.id}/review`, adminUserId, "PATCH", {
    status: "under_review",
  })).status, 200);
  assert.equal((await call(`/operations/offerings/${activity.id}/review`, adminUserId, "PATCH", {
    status: "approved",
  })).status, 200);
  const published = await call(`/operations/offerings/${activity.id}/review`, adminUserId, "PATCH", {
    status: "published",
  });
  assert.equal(published.status, 200);
  assert.equal((published.data as { approvalStatus: string; active: boolean }).approvalStatus, "published");
  assert.equal((published.data as { active: boolean }).active, true);

  await db.insert(reservations).values({
    id: `${prefix}-reservation`, userId: memberId, offeringId: activity.id, status: "reserved",
  });
  const editWithReservation = await call(`/operations/offerings/${activity.id}`, partnerUserId, "PATCH", {
    capacity: 2,
    localizedTitle: { en: "Changed title", ar: "عنوان جديد", ku: "ناونیشانی نوێ" },
  });
  assert.equal(editWithReservation.status, 409);
  const archiveWithReservation = await call(`/operations/offerings/${activity.id}/review`, adminUserId, "PATCH", {
    status: "archived",
    reason: "Retire this activity from the catalog.",
  });
  assert.equal(archiveWithReservation.status, 409);

  const cancelled = await call(`/operations/offerings/${activity.id}/cancel`, partnerUserId, "POST");
  assert.equal(cancelled.status, 200);
  const [archivedActivity] = await db.select().from(offerings).where(eq(offerings.id, activity.id));
  assert.equal(archivedActivity.approvalStatus, "archived");
  assert.equal(archivedActivity.active, false);
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, `${prefix}-reservation`));
  assert.equal(reservation.status, "partner_cancelled");

  const policyPath = `/operations/partners/${partnerId}/activity-approval-mode`;
  assert.equal((await call(policyPath, adminUserId, "PATCH", {
    activityApprovalMode: "trusted_direct_publish",
  })).status, 403);
  const changedPolicy = await call(policyPath, superAdminUserId, "PATCH", {
    activityApprovalMode: "trusted_direct_publish",
  });
  assert.equal(changedPolicy.status, 200);
  assert.equal((changedPolicy.data as { activityApprovalMode: string }).activityApprovalMode, "trusted_direct_publish");
  const trustedDraft = await call("/operations/offerings", partnerUserId, "POST", {
    ...payload, title: "Trusted partner session",
  });
  assert.equal(trustedDraft.status, 201);
  const trustedId = (trustedDraft.data as { id: string }).id;
  createdOfferingIds.push(trustedId);
  const directPublish = await call(`/operations/offerings/${trustedId}/submit`, partnerUserId, "POST");
  assert.equal(directPublish.status, 200);
  assert.equal((directPublish.data as { approvalStatus: string; active: boolean }).approvalStatus, "published");
  assert.equal((directPublish.data as { active: boolean }).active, true);

  const auditRows = await db.select().from(operationAudit).where(eq(operationAudit.targetId, activity.id));
  assert.ok(auditRows.some(row => row.action === "offering.approval.submit"));
  assert.ok(auditRows.some(row => row.action === "offering.approval.respond"));
  assert.ok(auditRows.filter(row => row.action === "offering.approval.decision").length >= 4);
});
