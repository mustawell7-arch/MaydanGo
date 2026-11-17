import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, count, desc, eq, gt, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db, courseEnrollments, learningCourses, offerings, operationAudit, partners, reservations,
  sponsoredContentCampaigns, sponsoredContentPlacementEvents,
} from "@workspace/db";
import {
  CreateSponsoredContentCampaignBody, CreateSponsoredContentCampaignResponse,
  GetPublicSponsoredContentQueryParams, GetPublicSponsoredContentResponse, GetSponsoredContentCampaignsResponse,
  RecordPublicSponsoredContentEventBody, RecordPublicSponsoredContentEventParams,
  UpdateSponsoredContentCampaignBody, UpdateSponsoredContentCampaignParams,
  UpdateSponsoredContentCampaignResponse,
} from "@workspace/api-zod";
import { isAccessSuspended, filterSuspendedOfferings } from "../lib/account-access-restrictions";
import { activeMembershipTiers, marketingOperator, requireMarketingAdmin } from "./sponsored-placements";

const router = Router();
type TargetType = "event" | "course";
type PlacementType = "featured_event" | "featured_course" | "home_promotion" | "category_featured";
type CampaignStatus = "draft" | "active" | "paused";
type CampaignInput = {
  campaignName: string;
  targetType: TargetType;
  targetId: string;
  placementTypes: PlacementType[];
  targetCity: string | null;
  targetActivity: string | null;
  targetMembershipTiers: string[];
  startsAt: Date;
  endsAt: Date;
  status: CampaignStatus;
};

type ContentTarget = {
  name: string;
  city: string | null;
  category: string;
  partnerId: string | null;
  partnerName: string | null;
  facility?: string;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("en");

function cleanInput(input: CampaignInput): CampaignInput {
  return {
    ...input,
    campaignName: input.campaignName.trim(),
    targetCity: input.targetCity?.trim() || null,
    targetActivity: input.targetActivity?.trim() || null,
    targetMembershipTiers: [...new Set(input.targetMembershipTiers)],
    placementTypes: [...new Set(input.placementTypes)],
  };
}

function placementTypesFor(targetType: TargetType): PlacementType[] {
  return targetType === "event"
    ? ["featured_event", "home_promotion", "category_featured"]
    : ["featured_course", "home_promotion", "category_featured"];
}

async function loadPublicTarget(targetType: TargetType, targetId: string, now = new Date()): Promise<ContentTarget | null> {
  if (targetType === "event") {
    const [event] = await db.select({
      id: offerings.id,
      title: offerings.title,
      localizedTitle: offerings.localizedTitle,
      city: offerings.city,
      facility: offerings.facility,
      category: offerings.category,
      partnerId: offerings.partnerId,
      partnerName: partners.name,
    }).from(offerings)
      .innerJoin(partners, eq(offerings.partnerId, partners.id))
      .where(and(
        eq(offerings.id, targetId),
        eq(offerings.kind, "event"),
        eq(offerings.scope, "live"),
        eq(offerings.active, true),
        isNull(offerings.cancelledAt),
        eq(offerings.additionalPayment, false),
        eq(partners.approved, true),
        gt(offerings.startsAt, now),
      ))
      .limit(1);
    if (!event || !event.partnerId) return null;
    const visible = await filterSuspendedOfferings([event]);
    if (!visible.length) return null;
    return {
      name: event.localizedTitle?.en?.trim() || event.title,
      city: event.city,
      category: event.category,
      partnerId: event.partnerId,
      partnerName: event.partnerName,
      facility: event.facility,
    };
  }

  const [course] = await db.select({
    title: learningCourses.title,
    localizedTitle: learningCourses.localizedTitle,
    category: learningCourses.category,
  }).from(learningCourses)
    .where(and(eq(learningCourses.id, targetId), eq(learningCourses.published, true)))
    .limit(1);
  if (!course) return null;
  return {
    name: course.localizedTitle.en.trim() || course.title,
    city: null,
    category: course.category,
    partnerId: null,
    partnerName: null,
  };
}

function targetMatchesInput(
  target: ContentTarget,
  input: Pick<CampaignInput, "targetCity" | "targetActivity">,
): boolean {
  if (input.targetActivity && normalize(input.targetActivity) !== normalize(target.category)) return false;
  return true;
}

function placementsMatchTarget(input: CampaignInput): boolean {
  const allowed = placementTypesFor(input.targetType);
  return input.placementTypes.length > 0
    && input.placementTypes.every(placement => allowed.includes(placement))
    && (!input.placementTypes.includes("category_featured") || !!input.targetActivity);
}

async function contentCampaignsForAdmin() {
  const rows = await db.select({
    id: sponsoredContentCampaigns.id,
    campaignName: sponsoredContentCampaigns.campaignName,
    targetType: sponsoredContentCampaigns.targetType,
    targetId: sponsoredContentCampaigns.targetId,
    targetName: sponsoredContentCampaigns.targetName,
    partnerName: partners.name,
    city: sponsoredContentCampaigns.city,
    placementTypes: sponsoredContentCampaigns.placementTypes,
    targetCity: sponsoredContentCampaigns.targetCity,
    targetActivity: sponsoredContentCampaigns.targetActivity,
    targetMembershipTiers: sponsoredContentCampaigns.targetMembershipTiers,
    startsAt: sponsoredContentCampaigns.startsAt,
    endsAt: sponsoredContentCampaigns.endsAt,
    status: sponsoredContentCampaigns.status,
    createdBy: sponsoredContentCampaigns.createdBy,
    createdAt: sponsoredContentCampaigns.createdAt,
    updatedAt: sponsoredContentCampaigns.updatedAt,
  }).from(sponsoredContentCampaigns)
    .leftJoin(partners, eq(partners.id, sponsoredContentCampaigns.partnerId))
    .orderBy(desc(sponsoredContentCampaigns.createdAt));
  const ids = rows.map(row => row.id);
  const counts = ids.length
    ? await db.select({
      campaignId: sponsoredContentPlacementEvents.campaignId,
      eventType: sponsoredContentPlacementEvents.eventType,
      total: count(),
    }).from(sponsoredContentPlacementEvents)
      .where(inArray(sponsoredContentPlacementEvents.campaignId, ids))
      .groupBy(sponsoredContentPlacementEvents.campaignId, sponsoredContentPlacementEvents.eventType)
    : [];
  const byCampaign = new Map<string, { impressions: number; clicks: number; conversions: number }>();
  for (const row of counts) {
    const current = byCampaign.get(row.campaignId) ?? { impressions: 0, clicks: 0, conversions: 0 };
    if (row.eventType === "impression") current.impressions = Number(row.total);
    if (row.eventType === "click") current.clicks = Number(row.total);
    if (row.eventType === "conversion") current.conversions = Number(row.total);
    byCampaign.set(row.campaignId, current);
  }
  return GetSponsoredContentCampaignsResponse.parse(rows.map(row => ({
    ...row,
    targetType: row.targetType as TargetType,
    placementTypes: row.placementTypes as PlacementType[],
    targetMembershipTiers: row.targetMembershipTiers as Array<"M" | "L" | "XL">,
    status: row.status as CampaignStatus,
    partnerName: row.partnerName ?? null,
    ...(byCampaign.get(row.id) ?? { impressions: 0, clicks: 0, conversions: 0 }),
  })));
}

function auditDetail(input: CampaignInput): string {
  return `target=${input.targetType}:${input.targetId};placements=${input.placementTypes.join(",")};city=${input.targetCity ?? "all"};category=${input.targetActivity ?? "all"};tiers=${input.targetMembershipTiers.join(",") || "all"};status=${input.status}`;
}

router.get("/operations/sponsored-content", requireMarketingAdmin, async (_req, res): Promise<void> => {
  res.json(await contentCampaignsForAdmin());
});

router.post("/operations/sponsored-content", requireMarketingAdmin, async (req, res): Promise<void> => {
  const operator = marketingOperator(res);
  const parsed = CreateSponsoredContentCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Complete the event or course campaign details before saving." });
    return;
  }
  const input = cleanInput(parsed.data);
  if (!input.campaignName || input.endsAt <= input.startsAt || !placementsMatchTarget(input)) {
    res.status(400).json({ message: "Choose compatible placements and a valid end date after the start date." });
    return;
  }
  const target = await loadPublicTarget(input.targetType, input.targetId);
  if (!target || !targetMatchesInput(target, input)) {
    res.status(404).json({ message: "Choose a currently published event or course with matching targeting." });
    return;
  }
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(sponsoredContentCampaigns).values({
      id,
      ...input,
      targetName: target.name,
      partnerId: target.partnerId,
      city: target.city,
      createdBy: operator.userId,
      updatedBy: operator.userId,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "sponsored_content_campaign.created",
      targetId: id,
      detail: auditDetail(input),
    });
  });
  const record = (await contentCampaignsForAdmin()).find(campaign => campaign.id === id);
  if (!record) {
    res.status(500).json({ message: "The new sponsored campaign could not be loaded." });
    return;
  }
  res.status(201).json(CreateSponsoredContentCampaignResponse.parse(record));
});

router.patch("/operations/sponsored-content/:id", requireMarketingAdmin, async (req, res): Promise<void> => {
  const operator = marketingOperator(res);
  const params = UpdateSponsoredContentCampaignParams.safeParse(req.params);
  const parsed = UpdateSponsoredContentCampaignBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Complete the event or course campaign details before saving." });
    return;
  }
  const input = cleanInput(parsed.data);
  if (!input.campaignName || input.endsAt <= input.startsAt || !placementsMatchTarget(input)) {
    res.status(400).json({ message: "Choose compatible placements and a valid end date after the start date." });
    return;
  }
  const target = await loadPublicTarget(input.targetType, input.targetId);
  if (!target || !targetMatchesInput(target, input)) {
    res.status(404).json({ message: "Choose a currently published event or course with matching targeting." });
    return;
  }
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(sponsoredContentCampaigns).set({
      ...input,
      targetName: target.name,
      partnerId: target.partnerId,
      city: target.city,
      updatedBy: operator.userId,
      updatedAt: new Date(),
    }).where(eq(sponsoredContentCampaigns.id, params.data.id)).returning({ id: sponsoredContentCampaigns.id });
    if (!row) return false;
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "sponsored_content_campaign.updated",
      targetId: row.id,
      detail: auditDetail(input),
    });
    return true;
  });
  if (!updated) {
    res.status(404).json({ message: "Sponsored content campaign not found." });
    return;
  }
  const record = (await contentCampaignsForAdmin()).find(campaign => campaign.id === params.data.id);
  if (!record) {
    res.status(404).json({ message: "Sponsored content campaign not found." });
    return;
  }
  res.json(UpdateSponsoredContentCampaignResponse.parse(record));
});

router.get("/public/sponsored-content", async (req, res): Promise<void> => {
  const query = GetPublicSponsoredContentQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Invalid city targeting filter." });
    return;
  }
  const now = new Date();
  const tiers = await activeMembershipTiers(getAuth(req).userId, now);
  const campaigns = await db.select().from(sponsoredContentCampaigns).where(and(
    eq(sponsoredContentCampaigns.status, "active"),
    lte(sponsoredContentCampaigns.startsAt, now),
    gte(sponsoredContentCampaigns.endsAt, now),
  ));
  const eventIds = [...new Set(campaigns.filter(item => item.targetType === "event").map(item => item.targetId))];
  const courseIds = [...new Set(campaigns.filter(item => item.targetType === "course").map(item => item.targetId))];
  const [eventRows, courseRows] = await Promise.all([
    eventIds.length ? db.select({
      id: offerings.id,
      city: offerings.city,
      facility: offerings.facility,
      category: offerings.category,
      partnerId: offerings.partnerId,
    }).from(offerings)
      .innerJoin(partners, eq(offerings.partnerId, partners.id))
      .where(and(
        inArray(offerings.id, eventIds),
        eq(offerings.kind, "event"),
        eq(offerings.scope, "live"),
        eq(offerings.active, true),
        isNull(offerings.cancelledAt),
        eq(offerings.additionalPayment, false),
        eq(partners.approved, true),
        gt(offerings.startsAt, now),
      ))
      : Promise.resolve([]),
    courseIds.length ? db.select({
      id: learningCourses.id,
      category: learningCourses.category,
      published: learningCourses.published,
    }).from(learningCourses)
      .where(and(inArray(learningCourses.id, courseIds), eq(learningCourses.published, true)))
      : Promise.resolve([]),
  ]);
  const visibleEvents = await filterSuspendedOfferings(eventRows);
  const eventsById = new Map(visibleEvents.map(event => [event.id, event]));
  const coursesById = new Map(courseRows.map(course => [course.id, course]));
  const visible = campaigns.filter(campaign => {
    const event = campaign.targetType === "event" ? eventsById.get(campaign.targetId) : undefined;
    const course = campaign.targetType === "course" ? coursesById.get(campaign.targetId) : undefined;
    if (!event && !course) return false;
    const targetActivity = event?.category ?? course?.category ?? "";
    const visitorCity = query.data.city?.trim() || null;
    if (campaign.targetCity && (!visitorCity || normalize(campaign.targetCity) !== normalize(visitorCity))) return false;
    if (campaign.targetActivity && normalize(campaign.targetActivity) !== normalize(targetActivity)) return false;
    return campaign.targetMembershipTiers.length === 0
      || campaign.targetMembershipTiers.some(tier => tiers.has(tier));
  }).map(campaign => ({
    campaignId: campaign.id,
    targetType: campaign.targetType as TargetType,
    targetId: campaign.targetId,
    placementTypes: campaign.placementTypes as PlacementType[],
    targetCity: campaign.targetCity,
    targetActivity: campaign.targetActivity,
  }));
  res.json(GetPublicSponsoredContentResponse.parse(visible));
});

router.post("/public/sponsored-content/:id/events", async (req, res): Promise<void> => {
  const params = RecordPublicSponsoredContentEventParams.safeParse(req.params);
  const parsed = RecordPublicSponsoredContentEventBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Invalid sponsored content event." });
    return;
  }
  const now = new Date();
  const [campaign] = await db.select().from(sponsoredContentCampaigns).where(and(
    eq(sponsoredContentCampaigns.id, params.data.id),
    eq(sponsoredContentCampaigns.status, "active"),
    lte(sponsoredContentCampaigns.startsAt, now),
    gte(sponsoredContentCampaigns.endsAt, now),
  )).limit(1);
  if (!campaign || !campaign.placementTypes.includes(parsed.data.placementType)) {
    res.status(404).json({ message: "Active sponsored content placement not found." });
    return;
  }
  const target = await loadPublicTarget(campaign.targetType as TargetType, campaign.targetId, now);
  if (!target || !targetMatchesInput(target, campaign)) {
    res.status(404).json({ message: "Active sponsored content placement not found." });
    return;
  }
  if (campaign.targetMembershipTiers.length > 0) {
    const tiers = await activeMembershipTiers(getAuth(req).userId, now);
    if (!campaign.targetMembershipTiers.some(tier => tiers.has(tier))) {
      res.status(404).json({ message: "Active sponsored content placement not found." });
      return;
    }
  }

  let referenceId: string | null = null;
  if (parsed.data.eventType === "conversion") {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(404).json({ message: "An authenticated booking or enrolment is required for conversion reporting." });
      return;
    }
    if (campaign.targetType === "event") {
      const [reservation] = await db.select({ id: reservations.id }).from(reservations)
        .where(and(
          eq(reservations.userId, userId),
          eq(reservations.offeringId, campaign.targetId),
          inArray(reservations.status, ["reserved", "requested"]),
          gte(reservations.createdAt, campaign.startsAt),
        )).limit(1);
      referenceId = reservation?.id ?? null;
    } else {
      const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
        .where(and(
          eq(courseEnrollments.userId, userId),
          eq(courseEnrollments.courseId, campaign.targetId),
          gte(courseEnrollments.enrolledAt, campaign.startsAt),
        ))
        .limit(1);
      referenceId = enrollment?.id ?? null;
    }
    if (!referenceId) {
      res.status(404).json({ message: "No matching event reservation or course enrolment was found." });
      return;
    }
  }

  await db.insert(sponsoredContentPlacementEvents).values({
    id: randomUUID(),
    campaignId: campaign.id,
    eventType: parsed.data.eventType,
    placementType: parsed.data.placementType,
    referenceId,
  }).onConflictDoNothing();
  res.status(204).end();
});

export default router;
