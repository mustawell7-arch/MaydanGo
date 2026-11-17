import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  attendance, corporateOrganizations, db, instructorContentDrafts, instructorOfferingAssignments,
  instructorProfiles, memberReferralAttributions, memberReferralCodes, memberships, offerings, operators, partners, pool, reservations,
  sponsoredContentCampaigns, sponsoredContentPlacementEvents,
} from "@workspace/db";
import operationsAnalyticsRouter from "./operations-analytics";

const prefix = `analytics-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const otherPartnerId = `${prefix}-other`;
const partnerUser = `${prefix}-partner-user`;
const otherPartnerUser = `${prefix}-other-user`;
const adminUser = `${prefix}-admin`;
const financeUser = `${prefix}-finance`;
const userId = `${prefix}-member`;
const instructorUserId = `${prefix}-instructor`;
const instructorDraftId = randomUUID();
const instructorProfileId = randomUUID();
const corporateId = `${prefix}-corporate`;
const sponsoredCampaignId = randomUUID();
const referralCodeId = randomUUID();
const referralAttributionId = randomUUID();
const referralInviterId = `${prefix}-referrer`;
const referralInviteeId = `${prefix}-invitee`;
const referralCode = randomUUID().replaceAll("-", "").slice(0, 10).split("")
  .map(character => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Number.parseInt(character, 16) * 2]).join("");
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
  await db.delete(sponsoredContentPlacementEvents).where(eq(sponsoredContentPlacementEvents.campaignId, sponsoredCampaignId));
  await db.delete(sponsoredContentCampaigns).where(eq(sponsoredContentCampaigns.id, sponsoredCampaignId));
  await db.delete(memberReferralAttributions).where(eq(memberReferralAttributions.id, referralAttributionId));
  await db.delete(memberReferralCodes).where(eq(memberReferralCodes.id, referralCodeId));
  await db.delete(instructorOfferingAssignments).where(inArray(instructorOfferingAssignments.offeringId, offeringIds));
  await db.delete(memberships).where(eq(memberships.userId, userId));
  await db.delete(instructorProfiles).where(eq(instructorProfiles.id, instructorProfileId));
  await db.delete(instructorContentDrafts).where(eq(instructorContentDrafts.id, instructorDraftId));
  await db.delete(corporateOrganizations).where(eq(corporateOrganizations.id, corporateId));
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
    { userId: adminUser, role: "partner_operations_admin", partnerId: null },
    { userId: financeUser, role: "finance", partnerId: null },
  ]);

  const now = new Date();
  const endsAt = new Date(now.getTime() + 60 * 60_000);
  const cancellationDeadline = new Date(now.getTime() - 60_000);
  await db.insert(corporateOrganizations).values({
    id: corporateId,
    name: `${prefix} Corporate`,
    status: "active",
    createdBy: adminUser,
  });
  await db.insert(memberships).values({
    userId,
    scope: "live",
    status: "active",
    paymentStatus: "not_required",
    tier: "M",
    source: "corporate",
    billingId: null,
    corporateId,
    startsAt: new Date(now.getTime() - 60_000),
    endsAt: new Date(now.getTime() + 86_400_000),
    rules: { quota: 1, dailyLimit: 1, corporateId },
  });
  await db.insert(memberReferralCodes).values({
    id: referralCodeId,
    ownerUserId: referralInviterId,
    code: referralCode,
  });
  await db.insert(memberReferralAttributions).values({
    id: referralAttributionId,
    codeId: referralCodeId,
    referrerUserId: referralInviterId,
    referredUserId: referralInviteeId,
    attributedAt: now,
  });
  await db.insert(instructorContentDrafts).values({
    id: instructorDraftId,
    instructorUserId,
    contentType: "profile",
    payload: {},
    status: "approved",
  });
  await db.insert(instructorProfiles).values({
    id: instructorProfileId,
    userId: instructorUserId,
    sourceDraftId: instructorDraftId,
    displayName: `${prefix} Instructor`,
    biography: "Approved analytics fixture",
    approvedBy: adminUser,
  });
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
  await db.insert(instructorOfferingAssignments).values({
    id: randomUUID(),
    userId: instructorUserId,
    offeringId: offeringIds[0],
    assignedBy: adminUser,
  });
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
  await db.insert(sponsoredContentCampaigns).values({
    id: sponsoredCampaignId,
    campaignName: `${prefix} Sponsored event`,
    targetType: "event",
    targetId: offeringIds[0],
    targetName: `${prefix} Sponsored target`,
    partnerId,
    city: "Erbil",
    placementTypes: ["featured_event"],
    targetMembershipTiers: [],
    startsAt: new Date(now.getTime() - 60_000),
    endsAt: new Date(now.getTime() + 86_400_000),
    status: "active",
    createdBy: adminUser,
    updatedBy: adminUser,
  });
  await db.insert(sponsoredContentPlacementEvents).values([
    { id: randomUUID(), campaignId: sponsoredCampaignId, eventType: "impression", placementType: "featured_event", createdAt: now },
    { id: randomUUID(), campaignId: sponsoredCampaignId, eventType: "click", placementType: "featured_event", createdAt: now },
    { id: randomUUID(), campaignId: sponsoredCampaignId, eventType: "conversion", placementType: "featured_event", referenceId: reservationIds[0], createdAt: now },
  ]);

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
  assert.equal(partnerResult.data.summary.attributedSignups, null);
  assert.equal(partnerResult.data.partnerPerformance.length, 0);
  assert.equal(partnerResult.data.corporateUsage.length, 0);
  assert.equal(partnerResult.data.instructorPerformance.length, 0);
  assert.equal(partnerResult.data.promotionPerformance.length, 0);
  assert.ok(!JSON.stringify(partnerResult.data).includes(userId));

  const adminResult = await call(adminUser);
  assert.equal(adminResult.status, 200);
  assert.equal(adminResult.data.role, "partner_operations_admin");
  assert.equal(adminResult.data.summary.visits, 3);
  assert.equal(adminResult.data.summary.activeSubscriptions >= 0, true);
  assert.equal(adminResult.data.summary.attributedSignups, 1);
  assert.ok(adminResult.data.unavailableMetrics.includes("revenue"));
  assert.equal(adminResult.data.unavailableMetrics.includes("instructor_performance"), false);
  assert.equal(adminResult.data.unavailableMetrics.includes("promotion_performance"), false);
  assert.equal(adminResult.data.partnerPerformance.length, 2);
  assert.deepEqual(adminResult.data.corporateUsage, [{
    organizationName: `${prefix} Corporate`,
    activeMembers: 1,
    uniqueVisitors: 1,
    visits: 2,
    bookings: 2,
    courseEnrollments: 0,
    usageRate: 100,
  }]);
  const instructor = adminResult.data.instructorPerformance.find((row: { instructorName: string }) =>
    row.instructorName === `${prefix} Instructor`);
  assert.deepEqual(instructor, {
    instructorName: `${prefix} Instructor`,
    sessions: 1,
    bookings: 1,
    visits: 1,
    noShows: 0,
    courseEnrollments: 0,
    courseCompletions: 0,
  });
  assert.deepEqual(adminResult.data.promotionPerformance.find((row: { campaignName: string }) =>
    row.campaignName === `${prefix} Sponsored event`), {
    campaignName: `${prefix} Sponsored event`,
    targetType: "event",
    status: "active",
    impressions: 1,
    clicks: 1,
    conversions: 1,
    clickThroughRate: 100,
    conversionRate: 100,
  });
  assert.ok(!JSON.stringify(adminResult.data).includes(userId));
  assert.ok(!JSON.stringify(adminResult.data).includes(referralInviterId));
  assert.ok(!JSON.stringify(adminResult.data).includes(referralInviteeId));

  const invalidRange = await call(adminUser, "2026-02-31");
  assert.equal(invalidRange.status, 400);
});
