import { Router, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db, facilityProfiles, facilityReviewPrivileges, facilityReviewReports,
  facilityReviewResponses, facilityReviews, operationAudit, operators, partners,
} from "@workspace/db";
import { hasAdminPermission } from "../lib/admin-roles";
import { isAccessSuspended } from "../lib/account-access-restrictions";
import {
  GetOperationsFacilityReviewsResponse, ModerateFacilityReviewBody,
  ModerateFacilityReviewParams, ModerateFacilityReviewResponse,
  RespondToFacilityReviewBody, RespondToFacilityReviewParams,
  RespondToFacilityReviewResponse, SetFacilityReviewPrivilegeBody,
  SetFacilityReviewPrivilegeParams, SetFacilityReviewPrivilegeResponse,
} from "@workspace/api-zod";

const router = Router();
type Operator = typeof operators.$inferSelect;

router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to access facility reviews." });
    return;
  }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (!operator || (!hasAdminPermission(operator.role, "fraud_compliance") && operator.role !== "partner")) {
    res.status(403).json({ message: "Administrator or approved partner access is required." });
    return;
  }
  if (operator.role === "partner") {
    if (!operator.partnerId) {
      res.status(403).json({ message: "This partner account is not assigned to a partner." });
      return;
    }
    const [partner] = await db.select({ approved: partners.approved })
      .from(partners).where(eq(partners.id, operator.partnerId)).limit(1);
    if (!partner?.approved) {
      res.status(403).json({ message: "Partner approval is required to respond to reviews." });
      return;
    }
    if (await isAccessSuspended("partner", operator.partnerId)) {
      res.status(403).json({ message: "Partner operations are temporarily restricted. Contact MaydanGo support." });
      return;
    }
  }
  res.locals.reviewOperator = operator;
  next();
});

function operatorFor(res: Response): Operator {
  return res.locals.reviewOperator as Operator;
}

async function reviewRows(ids?: string[], operator?: Operator) {
  if (ids && !ids.length) return [];
  const scope = operator?.role === "partner"
    ? and(eq(facilityReviews.partnerId, operator.partnerId!), eq(facilityReviews.status, "published"))
    : undefined;
  const rows = await db.select({
    id: facilityReviews.id,
    facilityId: facilityReviews.facilityId,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    partnerId: facilityReviews.partnerId,
    partnerName: partners.name,
    reviewerUserId: facilityReviews.reviewerUserId,
    overallRating: facilityReviews.overallRating,
    categoryRatings: facilityReviews.categoryRatings,
    content: facilityReviews.content,
    status: facilityReviews.status,
    moderationReason: facilityReviews.moderationReason,
    createdAt: facilityReviews.createdAt,
    updatedAt: facilityReviews.updatedAt,
    partnerResponse: facilityReviewResponses.response,
  }).from(facilityReviews)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityReviews.facilityId))
    .innerJoin(partners, eq(partners.id, facilityReviews.partnerId))
    .leftJoin(facilityReviewResponses, eq(facilityReviewResponses.reviewId, facilityReviews.id))
    .where(and(scope, ids ? inArray(facilityReviews.id, ids) : undefined))
    .orderBy(desc(facilityReviews.createdAt))
    .limit(ids ? ids.length : 200);

  const reviewIds = rows.map(row => row.id);
  const [reports, privileges] = await Promise.all([
    operator && hasAdminPermission(operator.role, "fraud_compliance") && reviewIds.length
      ? db.select({
        id: facilityReviewReports.id,
        reviewId: facilityReviewReports.reviewId,
        reason: facilityReviewReports.reason,
        details: facilityReviewReports.details,
        status: facilityReviewReports.status,
        createdAt: facilityReviewReports.createdAt,
      }).from(facilityReviewReports)
        .where(inArray(facilityReviewReports.reviewId, reviewIds))
        .orderBy(desc(facilityReviewReports.createdAt))
      : Promise.resolve([]),
    operator && hasAdminPermission(operator.role, "fraud_compliance") && rows.length
      ? db.select({ userId: facilityReviewPrivileges.userId })
        .from(facilityReviewPrivileges)
        .where(inArray(facilityReviewPrivileges.userId, rows.map(row => row.reviewerUserId)))
      : Promise.resolve([]),
  ]);
  const reportGroups = new Map<string, typeof reports>();
  for (const report of reports) {
    const group = reportGroups.get(report.reviewId) ?? [];
    group.push(report);
    reportGroups.set(report.reviewId, group);
  }
  const suspendedUsers = new Set(privileges.map(row => row.userId));
  return rows.map(row => {
    const reviewReports = reportGroups.get(row.id) ?? [];
    return {
      id: row.id,
      facilityId: row.facilityId,
      facility: row.facility,
      city: row.city,
      partnerId: row.partnerId,
      partnerName: row.partnerName,
      reviewerUserId: operator && hasAdminPermission(operator.role, "fraud_compliance") ? row.reviewerUserId : null,
      reviewPrivilegeSuspended: !!operator && hasAdminPermission(operator.role, "fraud_compliance") && suspendedUsers.has(row.reviewerUserId),
      overallRating: row.overallRating,
      categoryRatings: row.categoryRatings,
      content: row.content,
      status: row.status,
      moderationReason: row.moderationReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      partnerResponse: row.partnerResponse,
      reportCount: operator && hasAdminPermission(operator.role, "fraud_compliance") ? reviewReports.length : 0,
      reports: operator && hasAdminPermission(operator.role, "fraud_compliance") ? reviewReports.map(({ reviewId: _reviewId, ...report }) => report) : [],
    };
  });
}

async function reviewFor(id: string, operator: Operator) {
  const rows = await reviewRows([id], operator);
  return rows[0];
}

router.get("/reviews", async (_req, res): Promise<void> => {
  const operator = operatorFor(res);
  const reviews = await reviewRows(undefined, operator);
  res.json(GetOperationsFacilityReviewsResponse.parse({
    role: operator.role,
    reviews,
  }));
});

router.patch("/reviews/:id/moderation", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can moderate reviews." });
    return;
  }
  const params = ModerateFacilityReviewParams.safeParse(req.params);
  const parsed = ModerateFacilityReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a review status and provide a decision reason." });
    return;
  }
  const now = new Date();
  const changed = await db.transaction(async tx => {
    const [row] = await tx.update(facilityReviews).set({
      status: parsed.data.status,
      moderationReason: parsed.data.reason.trim(),
      updatedAt: now,
    }).where(eq(facilityReviews.id, params.data.id)).returning({ id: facilityReviews.id });
    if (!row) return false;
    await tx.update(facilityReviewReports).set({
      status: "reviewed",
      reviewedBy: operator.userId,
      reviewedAt: now,
    }).where(and(
      eq(facilityReviewReports.reviewId, row.id),
      eq(facilityReviewReports.status, "open"),
    ));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.review.moderated",
      targetId: row.id,
      detail: JSON.stringify({ status: parsed.data.status }),
    });
    return true;
  });
  if (!changed) {
    res.status(404).json({ message: "Review not found." });
    return;
  }
  const row = await reviewFor(params.data.id, operator);
  if (!row) {
    res.status(500).json({ message: "The review could not be loaded after moderation." });
    return;
  }
  res.json(ModerateFacilityReviewResponse.parse(row));
});

router.put("/reviews/:id/response", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (operator.role !== "partner" || !operator.partnerId) {
    res.status(403).json({ message: "Only the facility's approved partner can respond." });
    return;
  }
  const params = RespondToFacilityReviewParams.safeParse(req.params);
  const parsed = RespondToFacilityReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Enter a response of at least five characters." });
    return;
  }
  const [review] = await db.select({
    id: facilityReviews.id,
    partnerId: facilityReviews.partnerId,
    status: facilityReviews.status,
  }).from(facilityReviews).where(eq(facilityReviews.id, params.data.id)).limit(1);
  if (!review || review.partnerId !== operator.partnerId || review.status !== "published") {
    res.status(404).json({ message: "Published review not found for this partner." });
    return;
  }
  const response = parsed.data.response.trim();
  await db.transaction(async tx => {
    await tx.insert(facilityReviewResponses).values({
      reviewId: review.id,
      partnerId: operator.partnerId!,
      response,
      createdBy: operator.userId,
    }).onConflictDoUpdate({
      target: facilityReviewResponses.reviewId,
      set: { response, updatedAt: new Date() },
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.review.partner_response",
      targetId: review.id,
      detail: JSON.stringify({ responseLength: response.length }),
    });
  });
  const row = await reviewFor(review.id, operator);
  if (!row) {
    res.status(500).json({ message: "The review could not be loaded after saving the response." });
    return;
  }
  res.json(RespondToFacilityReviewResponse.parse(row));
});

router.put("/review-privileges/:userId", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can change review privileges." });
    return;
  }
  const params = SetFacilityReviewPrivilegeParams.safeParse(req.params);
  const parsed = SetFacilityReviewPrivilegeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Provide a reason for the privilege decision." });
    return;
  }
  const reason = parsed.data.reason.trim();
  const suspendedAt = parsed.data.suspended ? new Date() : null;
  await db.transaction(async tx => {
    if (parsed.data.suspended) {
      await tx.insert(facilityReviewPrivileges).values({
        userId: params.data.userId,
        reason,
        suspendedBy: operator.userId,
        suspendedAt: suspendedAt!,
        updatedAt: suspendedAt!,
      }).onConflictDoUpdate({
        target: facilityReviewPrivileges.userId,
        set: { reason, suspendedBy: operator.userId, suspendedAt: suspendedAt!, updatedAt: suspendedAt! },
      });
    } else {
      await tx.delete(facilityReviewPrivileges).where(eq(facilityReviewPrivileges.userId, params.data.userId));
    }
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: parsed.data.suspended ? "facility.review_privilege.suspended" : "facility.review_privilege.restored",
      targetId: params.data.userId,
      detail: JSON.stringify({ reasonLength: reason.length }),
    });
  });
  res.json(SetFacilityReviewPrivilegeResponse.parse({
    userId: params.data.userId,
    suspended: parsed.data.suspended,
    reason: parsed.data.suspended ? reason : null,
    suspendedAt,
  }));
});

export default router;
