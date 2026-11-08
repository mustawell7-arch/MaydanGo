import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db, attendance, facilityProfiles, facilityReviews, facilityReviewPrivileges,
  facilityReviewReports, facilityReviewResponses, operationAudit, offerings,
} from "@workspace/db";
import {
  CreateMemberFacilityReviewBody, CreateMemberFacilityReviewResponse,
  GetMemberFacilityReviewsResponse, ReportFacilityReviewBody,
  ReportFacilityReviewParams, ReportFacilityReviewResponse,
} from "@workspace/api-zod";

const router = Router();

router.use((req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ message: "Sign in to review a facility." });
    return;
  }
  next();
});

function facilityMatch() {
  return and(
    eq(facilityProfiles.partnerId, offerings.partnerId),
    sql`lower(btrim(${facilityProfiles.city})) = lower(btrim(${offerings.city}))`,
    sql`lower(btrim(${facilityProfiles.facility})) = lower(btrim(${offerings.facility}))`,
  );
}

async function memberReviewDetail(id: string) {
  const [row] = await db.select({
    id: facilityReviews.id,
    facilityId: facilityReviews.facilityId,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    overallRating: facilityReviews.overallRating,
    categoryRatings: facilityReviews.categoryRatings,
    content: facilityReviews.content,
    status: facilityReviews.status,
    createdAt: facilityReviews.createdAt,
    partnerResponse: facilityReviewResponses.response,
  }).from(facilityReviews)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityReviews.facilityId))
    .leftJoin(facilityReviewResponses, eq(facilityReviewResponses.reviewId, facilityReviews.id))
    .where(eq(facilityReviews.id, id))
    .limit(1);
  return row;
}

router.get("/reviews", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const [eligibleVisits, reviews] = await Promise.all([
    db.select({
      reservationId: attendance.reservationId,
      facilityId: facilityProfiles.id,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      offeringTitle: offerings.title,
      attendedAt: attendance.checkedInAt,
    }).from(attendance)
      .innerJoin(offerings, eq(offerings.id, attendance.offeringId))
      .innerJoin(facilityProfiles, facilityMatch())
      .leftJoin(facilityReviews, eq(facilityReviews.reservationId, attendance.reservationId))
      .where(and(
        eq(attendance.userId, userId),
        eq(attendance.status, "confirmed"),
        isNotNull(attendance.reservationId),
        eq(offerings.scope, "live"),
        isNull(facilityReviews.id),
      ))
      .orderBy(desc(attendance.checkedInAt))
      .limit(100),
    db.select({
      id: facilityReviews.id,
      facilityId: facilityReviews.facilityId,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      overallRating: facilityReviews.overallRating,
      categoryRatings: facilityReviews.categoryRatings,
      content: facilityReviews.content,
      status: facilityReviews.status,
      createdAt: facilityReviews.createdAt,
      partnerResponse: facilityReviewResponses.response,
    }).from(facilityReviews)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityReviews.facilityId))
      .leftJoin(facilityReviewResponses, eq(facilityReviewResponses.reviewId, facilityReviews.id))
      .where(eq(facilityReviews.reviewerUserId, userId))
      .orderBy(desc(facilityReviews.createdAt))
      .limit(100),
  ]);
  res.json(GetMemberFacilityReviewsResponse.parse({
    eligibleVisits: eligibleVisits.filter(visit => visit.reservationId !== null),
    reviews,
  }));
});

router.post("/reviews", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const parsed = CreateMemberFacilityReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose an overall rating and valid category ratings." });
    return;
  }
  const [privilege] = await db.select({ userId: facilityReviewPrivileges.userId })
    .from(facilityReviewPrivileges).where(eq(facilityReviewPrivileges.userId, userId)).limit(1);
  if (privilege) {
    res.status(403).json({ message: "Review privileges are currently suspended." });
    return;
  }
  const [visit] = await db.select({
    attendanceId: attendance.id,
    reservationId: attendance.reservationId,
    facilityId: facilityProfiles.id,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    partnerId: offerings.partnerId,
  }).from(attendance)
    .innerJoin(offerings, eq(offerings.id, attendance.offeringId))
    .innerJoin(facilityProfiles, facilityMatch())
    .where(and(
      eq(attendance.reservationId, parsed.data.reservationId),
      eq(attendance.userId, userId),
      eq(attendance.status, "confirmed"),
      eq(offerings.scope, "live"),
    ))
    .limit(1);
  if (!visit?.reservationId || !visit.partnerId) {
    res.status(404).json({ message: "A confirmed visit for this facility was not found." });
    return;
  }
  const content = parsed.data.content?.trim() || null;
  const id = randomUUID();
  const created = await db.transaction(async tx => {
    const [row] = await tx.insert(facilityReviews).values({
      id,
      attendanceId: visit.attendanceId,
      reservationId: visit.reservationId!,
      facilityId: visit.facilityId,
      partnerId: visit.partnerId!,
      reviewerUserId: userId,
      overallRating: parsed.data.overallRating,
      categoryRatings: parsed.data.categoryRatings,
      content,
      status: "published",
    }).onConflictDoNothing().returning();
    if (!row) return null;
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: userId,
      action: "facility.review.created",
      targetId: id,
      detail: JSON.stringify({
        facilityId: visit.facilityId,
        reservationId: visit.reservationId,
        overallRating: parsed.data.overallRating,
      }),
    });
    return row;
  });
  if (!created) {
    res.status(409).json({ message: "A review already exists for this verified visit." });
    return;
  }
  const row = await memberReviewDetail(id);
  if (!row) {
    res.status(500).json({ message: "The review could not be loaded after saving." });
    return;
  }
  res.status(201).json(CreateMemberFacilityReviewResponse.parse(row));
});

router.post("/reviews/:id/reports", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const params = ReportFacilityReviewParams.safeParse(req.params);
  const parsed = ReportFacilityReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid report reason." });
    return;
  }
  const [review] = await db.select({
    id: facilityReviews.id,
    reviewerUserId: facilityReviews.reviewerUserId,
    status: facilityReviews.status,
  }).from(facilityReviews).where(eq(facilityReviews.id, params.data.id)).limit(1);
  if (!review || review.status !== "published" || review.reviewerUserId === userId) {
    res.status(404).json({ message: "Review not found." });
    return;
  }
  const id = randomUUID();
  const [report] = await db.transaction(async tx => {
    const [row] = await tx.insert(facilityReviewReports).values({
      id,
      reviewId: review.id,
      reporterUserId: userId,
      reason: parsed.data.reason,
      details: parsed.data.details?.trim() || null,
    }).onConflictDoNothing().returning();
    if (!row) return [null];
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: userId,
      action: "facility.review.reported",
      targetId: review.id,
      detail: JSON.stringify({ reason: parsed.data.reason }),
    });
    return [row];
  });
  if (!report) {
    res.status(409).json({ message: "You have already reported this review." });
    return;
  }
  res.status(201).json(ReportFacilityReviewResponse.parse(report));
});

export default router;
