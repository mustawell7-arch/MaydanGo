import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, facilityProfiles, facilityReviews, facilityReviewResponses, partners } from "@workspace/db";
import { GetPublicFacilityReviewsResponse } from "@workspace/api-zod";

const router = Router();

router.get("/facilities/:id/reviews", async (req, res): Promise<void> => {
  const id = z.string().min(1).max(160).safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ message: "Invalid facility ID." });
    return;
  }
  const [facility] = await db.select({ id: facilityProfiles.id })
    .from(facilityProfiles)
    .innerJoin(partners, eq(partners.id, facilityProfiles.partnerId))
    .where(and(eq(facilityProfiles.id, id.data), eq(partners.approved, true)))
    .limit(1);
  if (!facility) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }
  const [summary] = await db.select({
    reviewCount: sql<number>`count(*)::int`,
    averageRating: sql<number | null>`round(avg(${facilityReviews.overallRating})::numeric, 1)`,
  }).from(facilityReviews).where(and(
    eq(facilityReviews.facilityId, facility.id),
    eq(facilityReviews.status, "published"),
  ));
  const reviews = await db.select({
    id: facilityReviews.id,
    overallRating: facilityReviews.overallRating,
    categoryRatings: facilityReviews.categoryRatings,
    content: facilityReviews.content,
    createdAt: facilityReviews.createdAt,
    partnerResponse: facilityReviewResponses.response,
  }).from(facilityReviews)
    .leftJoin(facilityReviewResponses, eq(facilityReviewResponses.reviewId, facilityReviews.id))
    .where(and(
      eq(facilityReviews.facilityId, facility.id),
      eq(facilityReviews.status, "published"),
    ))
    .orderBy(desc(facilityReviews.createdAt))
    .limit(100);
  res.json(GetPublicFacilityReviewsResponse.parse({
    facilityId: facility.id,
    reviewCount: Number(summary?.reviewCount ?? 0),
    averageRating: summary?.averageRating == null ? null : Number(summary.averageRating),
    reviews,
  }));
});

export default router;
