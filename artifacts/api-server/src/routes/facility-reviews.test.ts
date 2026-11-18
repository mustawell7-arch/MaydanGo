import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, attendance, facilityProfiles, facilityReviewPrivileges, facilityReviewReports,
  facilityReviewResponses, facilityReviews, offerings, operationAudit,
  operators, partners, pool, reservations,
} from "@workspace/db";
import memberReviewsRouter from "./member-reviews";
import publicReviewsRouter from "./public-reviews";
import facilitiesPublicRouter from "./facilities-public";
import operationsReviewsRouter from "./operations-reviews";

const prefix = `facility-reviews-${randomUUID()}`;
const partnerA = `${prefix}-partner-a`;
const partnerB = `${prefix}-partner-b`;
const adminUser = `${prefix}-admin`;
const userA = `${prefix}-member-a`;
const userB = `${prefix}-member-b`;
const partnerUserA = `${prefix}-partner-user-a`;
const partnerUserB = `${prefix}-partner-user-b`;
const financeUser = `${prefix}-finance`;
const facilityA = `${prefix}-facility-a`;
const facilityB = `${prefix}-facility-b`;
const offerA = `${prefix}-offer-a`;
const offerB = `${prefix}-offer-b`;
const pendingOffer = `${prefix}-pending-offer`;
const reservationA = `${prefix}-reservation-a`;
const reservationB = `${prefix}-reservation-b`;
const pendingReservation = `${prefix}-reservation-pending`;
const attendanceA = `${prefix}-attendance-a`;
const attendanceB = `${prefix}-attendance-b`;
const attendancePending = `${prefix}-attendance-pending`;
const ids = {
  users: [adminUser, userA, userB, partnerUserA, partnerUserB, financeUser],
  partners: [partnerA, partnerB],
  facilities: [facilityA, facilityB],
  offerings: [offerA, offerB, pendingOffer],
  reservations: [reservationA, reservationB, pendingReservation],
  attendance: [attendanceA, attendanceB, attendancePending],
};
let server: Server | null = null;

const openingHours = Array.from({ length: 7 }, (_, day) => ({ day, closed: true, opensAt: null, closesAt: null }));
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
function offering(id: string, partnerId: string, facility: string) {
  const started = new Date(Date.now() - 2 * 86400000);
  return {
    id, kind: "session", targetId: id, slot: "", title: `${facility} visit`,
    scope: "live", partnerId, partnerGroup: null, accessType: "physical", active: true,
    city: "Baghdad", facility, category: "fitness", tiers: ["M"],
    startsAt: started, endsAt: new Date(started.getTime() + 60 * 60_000),
    cancellationDeadline: started, capacity: 12, additionalPayment: false,
    gender: "all", minAge: 0, maxAge: null,
  };
}
const categoryRatings = {
  cleanliness: 4, staff: 5, equipment: null, instructor: 4, facilities: 5, informationAccuracy: null,
};

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
app.use("/member", memberReviewsRouter);
app.use("/public", publicReviewsRouter);
app.use("/public", facilitiesPublicRouter);
app.use("/operations", operationsReviewsRouter);

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
  await db.delete(facilityReviewReports).where(eq(facilityReviewReports.reporterUserId, userB));
  await db.delete(facilityReviewResponses).where(inArray(facilityReviewResponses.partnerId, ids.partners));
  await db.delete(facilityReviewPrivileges).where(inArray(facilityReviewPrivileges.userId, ids.users));
  await db.delete(facilityReviews).where(inArray(facilityReviews.reservationId, ids.reservations));
  await db.delete(attendance).where(inArray(attendance.id, ids.attendance));
  await db.delete(reservations).where(inArray(reservations.id, ids.reservations));
  await db.delete(offerings).where(inArray(offerings.id, ids.offerings));
  await db.delete(facilityProfiles).where(inArray(facilityProfiles.id, ids.facilities));
  await db.delete(operators).where(inArray(operators.userId, ids.users));
  await db.delete(partners).where(inArray(partners.id, ids.partners));
  // operation_audit is append-only; randomized test events are intentionally retained.
  await pool.end();
});

test("reviews require confirmed visits and support reporting, moderation, and partner replies", async () => {
  await db.insert(partners).values([
    { id: partnerA, name: `${prefix} Partner A`, groupId: prefix, ownerUserId: partnerUserA, approved: true },
    { id: partnerB, name: `${prefix} Partner B`, groupId: prefix, ownerUserId: partnerUserB, approved: true },
  ]);
  await db.insert(operators).values([
    { userId: adminUser, role: "fraud_compliance_admin", partnerId: null },
    { userId: partnerUserA, role: "partner", partnerId: partnerA },
    { userId: partnerUserB, role: "partner", partnerId: partnerB },
    { userId: financeUser, role: "finance", partnerId: null },
  ]);
  await db.insert(facilityProfiles).values([
    { id: facilityA, partnerId: partnerA, ...profile(`${prefix} facility A`) },
    { id: facilityB, partnerId: partnerB, ...profile(`${prefix} facility B`) },
  ]);
  await db.insert(offerings).values([
    offering(offerA, partnerA, `${prefix} facility A`),
    offering(offerB, partnerB, `${prefix} facility B`),
    offering(pendingOffer, partnerA, `${prefix} facility A`),
  ]);
  await db.insert(reservations).values([
    { id: reservationA, userId: userA, offeringId: offerA, status: "reserved" },
    { id: reservationB, userId: userB, offeringId: offerB, status: "reserved" },
    { id: pendingReservation, userId: userA, offeringId: pendingOffer, status: "reserved" },
  ]);
  const checkedInAt = new Date(Date.now() - 86400000);
  await db.insert(attendance).values([
    { id: attendanceA, reservationId: reservationA, userId: userA, offeringId: offerA, checkedInAt, verifiedBy: partnerUserA, status: "confirmed", settlementEligible: true },
    { id: attendanceB, reservationId: reservationB, userId: userB, offeringId: offerB, checkedInAt, verifiedBy: partnerUserB, status: "confirmed", settlementEligible: true },
    { id: attendancePending, reservationId: pendingReservation, userId: userA, offeringId: pendingOffer, checkedInAt, verifiedBy: partnerUserA, status: "pending", settlementEligible: false },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/member/reviews")).status, 401);
  assert.equal((await call("/member/visits")).status, 401);
  assert.equal((await call("/operations/reviews", financeUser)).status, 403);
  const eligible = await call("/member/reviews", userA);
  assert.equal(eligible.status, 200);
  const eligibleData = eligible.data as { eligibleVisits: Array<{ reservationId: string }>; reviews: unknown[] };
  assert.deepEqual(eligibleData.eligibleVisits.map(visit => visit.reservationId), [reservationA]);
  const visits = await call("/member/visits", userA);
  assert.equal(visits.status, 200);
  const visitRows = visits.data as Array<{ facilityId: string; localizedName: { en: string }; visitedAt: string }>;
  assert.deepEqual(visitRows.map(visit => visit.facilityId), [facilityA]);
  assert.equal(visitRows[0].localizedName.en, `${prefix} facility A`);
  const otherMemberVisits = await call("/member/visits", userB);
  assert.deepEqual(
    (otherMemberVisits.data as Array<{ facilityId: string }>).map(visit => visit.facilityId),
    [facilityB],
  );

  const body = {
    reservationId: reservationA,
    overallRating: 4,
    categoryRatings,
    content: "The class was welcoming and the equipment was ready.",
  };
  assert.equal((await call("/member/reviews", userA, "POST", { ...body, reservationId: pendingReservation })).status, 404);
  const created = await call("/member/reviews", userA, "POST", body);
  assert.equal(created.status, 201);
  assert.deepEqual(
    ((await call("/member/visits", userA)).data as Array<{ facilityId: string }>).map(visit => visit.facilityId),
    [facilityA],
  );
  const review = created.data as { id: string; facilityId: string; status: string };
  assert.equal(review.facilityId, facilityA);
  assert.equal(review.status, "published");
  assert.equal((await call("/member/reviews", userA, "POST", body)).status, 409);

  const publicBefore = await call(`/public/facilities/${facilityA}/reviews`);
  assert.equal(publicBefore.status, 200);
  const publicData = publicBefore.data as { reviewCount: number; averageRating: number; reviews: Array<{ id: string }> };
  assert.equal(publicData.reviewCount, 1);
  assert.equal(publicData.averageRating, 4);
  assert.equal(publicData.reviews[0].id, review.id);
  const facilitiesWithRatings = await call("/public/facilities");
  assert.equal(facilitiesWithRatings.status, 200);
  const ratedFacility = (facilitiesWithRatings.data as Array<{
    id: string; averageRating: number | null; reviewCount: number;
  }>).find(item => item.id === facilityA);
  assert.equal(ratedFacility?.averageRating, 4);
  assert.equal(ratedFacility?.reviewCount, 1);

  assert.equal((await call(`/member/reviews/${review.id}/reports`, userA, "POST", { reason: "other", details: null })).status, 404);
  const report = await call(`/member/reviews/${review.id}/reports`, userB, "POST", {
    reason: "misleading", details: "Please review the visit claim.",
  });
  assert.equal(report.status, 201);
  assert.equal((await call(`/member/reviews/${review.id}/reports`, userB, "POST", { reason: "other", details: null })).status, 409);

  const partnerReviews = await call("/operations/reviews", partnerUserA);
  assert.equal(partnerReviews.status, 200);
  assert.equal((partnerReviews.data as { reviews: Array<{ reviewerUserId: string | null; reports: unknown[] }> }).reviews[0].reviewerUserId, null);
  assert.equal((partnerReviews.data as { reviews: Array<{ reports: unknown[] }> }).reviews[0].reports.length, 0);
  assert.equal((await call("/operations/reviews", partnerUserB)).status, 200);
  const partnerResponse = await call(`/operations/reviews/${review.id}/response`, partnerUserA, "PUT", {
    response: "Thank you for sharing your experience with our team.",
  });
  assert.equal(partnerResponse.status, 200);
  assert.equal((await call(`/operations/reviews/${review.id}/response`, partnerUserB, "PUT", {
    response: "A different partner cannot respond to this review.",
  })).status, 404);

  const adminReviews = await call("/operations/reviews", adminUser);
  const adminReview = (adminReviews.data as { reviews: Array<{ id: string; reviewerUserId: string; reports: Array<{ status: string }> }> }).reviews
    .find(item => item.id === review.id);
  assert.equal(adminReview?.reviewerUserId, userA);
  assert.equal(adminReview?.reports.length, 1);
  assert.equal(adminReview?.reports[0].status, "open");

  assert.equal((await call(`/operations/review-privileges/${userB}`, adminUser, "PUT", {
    suspended: true, reason: "Repeated abusive review reports.",
  })).status, 200);
  assert.equal((await call("/member/reviews", userB, "POST", {
    reservationId: reservationB, overallRating: 2, categoryRatings, content: null,
  })).status, 403);
  assert.equal((await call(`/operations/review-privileges/${userB}`, adminUser, "PUT", {
    suspended: false, reason: "Review privilege restored after staff review.",
  })).status, 200);
  const secondReview = await call("/member/reviews", userB, "POST", {
    reservationId: reservationB, overallRating: 5, categoryRatings, content: null,
  });
  assert.equal(secondReview.status, 201);
  const secondReviewId = (secondReview.data as { id: string }).id;

  const moderation = await call(`/operations/reviews/${review.id}/moderation`, adminUser, "PATCH", {
    status: "hidden", reason: "The report requires additional verification.",
  });
  assert.equal(moderation.status, 200);
  const publicAfter = await call(`/public/facilities/${facilityA}/reviews`);
  assert.equal((publicAfter.data as { reviewCount: number; reviews: unknown[] }).reviewCount, 0);
  assert.equal((publicAfter.data as { reviews: unknown[] }).reviews.length, 0);
  const facilitiesAfterModeration = await call("/public/facilities");
  const facilityAfterModeration = (facilitiesAfterModeration.data as Array<{
    id: string; averageRating: number | null; reviewCount: number;
  }>).find(item => item.id === facilityA);
  assert.equal(facilityAfterModeration?.averageRating, null);
  assert.equal(facilityAfterModeration?.reviewCount, 0);

  const ownHistory = await call("/member/reviews", userA);
  assert.equal((ownHistory.data as { reviews: Array<{ id: string; status: string }> }).reviews[0].status, "hidden");
  const [reviewRow] = await db.select().from(facilityReviews).where(eq(facilityReviews.id, review.id));
  assert.equal(reviewRow.status, "hidden");
  const [reportRow] = await db.select().from(facilityReviewReports).where(eq(facilityReviewReports.reviewId, review.id));
  assert.equal(reportRow.status, "reviewed");
  const auditRows = await db.select().from(operationAudit).where(inArray(operationAudit.targetId, [
    review.id, secondReviewId, userB,
  ]));
  assert.ok(auditRows.length >= 6);
});
