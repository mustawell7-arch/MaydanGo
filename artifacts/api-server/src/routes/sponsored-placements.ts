import { Router, type NextFunction, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db, facilityProfiles, memberships, operationAudit, operators, partners,
  sponsoredFacilityCampaigns, sponsoredPlacementEvents,
} from "@workspace/db";
import { isAccessSuspended, suspendedEntityIds } from "../lib/account-access-restrictions";
import {
  CreateSponsoredFacilityCampaignBody, CreateSponsoredFacilityCampaignResponse,
  GetPublicSponsoredFacilitiesResponse, GetSponsoredFacilityCampaignsResponse,
  RecordPublicSponsoredFacilityEventBody, RecordPublicSponsoredFacilityEventParams,
  UpdateSponsoredFacilityCampaignBody, UpdateSponsoredFacilityCampaignParams,
  UpdateSponsoredFacilityCampaignResponse,
} from "@workspace/api-zod";
import { hasAdminPermission } from "../lib/admin-roles";

const router = Router();
type Operator = typeof operators.$inferSelect;
type PlacementType = "home_featured" | "search_sponsored" | "category_featured";
type CampaignStatus = "draft" | "active" | "paused";

export function marketingOperator(res: Response): Operator {
  return res.locals.marketingOperator as Operator;
}

export async function requireMarketingAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to manage sponsored placements." });
    return;
  }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (!operator || !hasAdminPermission(operator.role, "marketing")) {
    res.status(403).json({ message: "Marketing administrator access is required." });
    return;
  }
  res.locals.marketingOperator = operator;
  next();
}

function cleanCampaignInput(input: {
  campaignName: string;
  facilityId: string;
  placementTypes: PlacementType[];
  targetCity: string | null;
  targetActivity: string | null;
  targetMembershipTiers: string[];
  startsAt: Date;
  endsAt: Date;
  status: CampaignStatus;
}) {
  return {
    ...input,
    campaignName: input.campaignName.trim(),
    targetCity: input.targetCity?.trim() || null,
    targetActivity: input.targetActivity?.trim() || null,
    targetMembershipTiers: [...new Set(input.targetMembershipTiers)],
    placementTypes: [...new Set(input.placementTypes)],
  };
}

async function approvedFacility(facilityId: string) {
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles)
    .innerJoin(partners, eq(partners.id, facilityProfiles.partnerId))
    .where(and(eq(facilityProfiles.id, facilityId), eq(partners.approved, true)))
    .limit(1);
  if (!facility || await isAccessSuspended("partner", facility.partnerId)
    || await isAccessSuspended("facility", facility.id)) return null;
  return facility;
}

async function campaignDetail(id: string) {
  const [row] = await db.select({
    id: sponsoredFacilityCampaigns.id,
    campaignName: sponsoredFacilityCampaigns.campaignName,
    facilityId: sponsoredFacilityCampaigns.facilityId,
    partnerId: sponsoredFacilityCampaigns.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    placementTypes: sponsoredFacilityCampaigns.placementTypes,
    targetCity: sponsoredFacilityCampaigns.targetCity,
    targetActivity: sponsoredFacilityCampaigns.targetActivity,
    targetMembershipTiers: sponsoredFacilityCampaigns.targetMembershipTiers,
    startsAt: sponsoredFacilityCampaigns.startsAt,
    endsAt: sponsoredFacilityCampaigns.endsAt,
    status: sponsoredFacilityCampaigns.status,
    createdBy: sponsoredFacilityCampaigns.createdBy,
    createdAt: sponsoredFacilityCampaigns.createdAt,
    updatedAt: sponsoredFacilityCampaigns.updatedAt,
  }).from(sponsoredFacilityCampaigns)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, sponsoredFacilityCampaigns.facilityId))
    .innerJoin(partners, eq(partners.id, sponsoredFacilityCampaigns.partnerId))
    .where(eq(sponsoredFacilityCampaigns.id, id)).limit(1);
  if (!row) return undefined;
  const counts = await db.select({
    eventType: sponsoredPlacementEvents.eventType,
    total: count(),
  }).from(sponsoredPlacementEvents)
    .where(eq(sponsoredPlacementEvents.campaignId, id))
    .groupBy(sponsoredPlacementEvents.eventType);
  return {
    ...row,
    impressions: Number(counts.find(item => item.eventType === "impression")?.total ?? 0),
    clicks: Number(counts.find(item => item.eventType === "click")?.total ?? 0),
  };
}

export async function activeMembershipTiers(userId: string | null, now: Date): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db.select({ tier: memberships.tier }).from(memberships)
    .where(and(
      eq(memberships.userId, userId),
      inArray(memberships.status, ["active", "trial", "grace_period"]),
      lte(memberships.startsAt, now),
      gte(memberships.endsAt, now),
      ne(memberships.scope, "preview"),
      ne(memberships.source, "preview"),
    ));
  return new Set(rows.map(row => row.tier));
}

function campaignAuditDetail(input: ReturnType<typeof cleanCampaignInput>) {
  return `placements=${input.placementTypes.join(",")};target_city=${input.targetCity ?? "all"};target_activity=${input.targetActivity ?? "all"};membership_tiers=${input.targetMembershipTiers.join(",") || "all"};status=${input.status}`;
}

router.get("/operations/sponsored-facilities", requireMarketingAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: sponsoredFacilityCampaigns.id,
    campaignName: sponsoredFacilityCampaigns.campaignName,
    facilityId: sponsoredFacilityCampaigns.facilityId,
    partnerId: sponsoredFacilityCampaigns.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    placementTypes: sponsoredFacilityCampaigns.placementTypes,
    targetCity: sponsoredFacilityCampaigns.targetCity,
    targetActivity: sponsoredFacilityCampaigns.targetActivity,
    targetMembershipTiers: sponsoredFacilityCampaigns.targetMembershipTiers,
    startsAt: sponsoredFacilityCampaigns.startsAt,
    endsAt: sponsoredFacilityCampaigns.endsAt,
    status: sponsoredFacilityCampaigns.status,
    createdBy: sponsoredFacilityCampaigns.createdBy,
    createdAt: sponsoredFacilityCampaigns.createdAt,
    updatedAt: sponsoredFacilityCampaigns.updatedAt,
  }).from(sponsoredFacilityCampaigns)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, sponsoredFacilityCampaigns.facilityId))
    .innerJoin(partners, eq(partners.id, sponsoredFacilityCampaigns.partnerId))
    .orderBy(desc(sponsoredFacilityCampaigns.createdAt));
  const campaignIds = rows.map(row => row.id);
  const counts = campaignIds.length
    ? await db.select({
      campaignId: sponsoredPlacementEvents.campaignId,
      eventType: sponsoredPlacementEvents.eventType,
      total: count(),
    }).from(sponsoredPlacementEvents)
      .where(inArray(sponsoredPlacementEvents.campaignId, campaignIds))
      .groupBy(sponsoredPlacementEvents.campaignId, sponsoredPlacementEvents.eventType)
    : [];
  const countByCampaign = new Map<string, { impressions: number; clicks: number }>();
  for (const item of counts) {
    const current = countByCampaign.get(item.campaignId) ?? { impressions: 0, clicks: 0 };
    if (item.eventType === "impression") current.impressions = Number(item.total);
    if (item.eventType === "click") current.clicks = Number(item.total);
    countByCampaign.set(item.campaignId, current);
  }
  res.json(GetSponsoredFacilityCampaignsResponse.parse(rows.map(row => ({
    ...row,
    ...(countByCampaign.get(row.id) ?? { impressions: 0, clicks: 0 }),
  }))));
});

router.post("/operations/sponsored-facilities", requireMarketingAdmin, async (req, res): Promise<void> => {
  const operator = marketingOperator(res);
  const parsed = CreateSponsoredFacilityCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Complete the campaign details before saving." });
    return;
  }
  const input = cleanCampaignInput(parsed.data);
  if (!input.campaignName || input.endsAt <= input.startsAt) {
    res.status(400).json({ message: "Enter a campaign name and an end date after its start date." });
    return;
  }
  const facility = await approvedFacility(input.facilityId);
  if (!facility) {
    res.status(404).json({ message: "Choose a facility published by an approved partner." });
    return;
  }
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(sponsoredFacilityCampaigns).values({
      id,
      ...input,
      partnerId: facility.partnerId,
      createdBy: operator.userId,
      updatedBy: operator.userId,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "sponsored_facility_campaign.created",
      targetId: id,
      detail: campaignAuditDetail(input),
    });
  });
  const record = await campaignDetail(id);
  if (!record) {
    res.status(500).json({ message: "The new campaign could not be loaded." });
    return;
  }
  res.status(201).json(CreateSponsoredFacilityCampaignResponse.parse(record));
});

router.patch("/operations/sponsored-facilities/:id", requireMarketingAdmin, async (req, res): Promise<void> => {
  const operator = marketingOperator(res);
  const params = UpdateSponsoredFacilityCampaignParams.safeParse(req.params);
  const parsed = UpdateSponsoredFacilityCampaignBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Complete the campaign details before saving." });
    return;
  }
  const input = cleanCampaignInput(parsed.data);
  if (!input.campaignName || input.endsAt <= input.startsAt) {
    res.status(400).json({ message: "Enter a campaign name and an end date after its start date." });
    return;
  }
  const facility = await approvedFacility(input.facilityId);
  if (!facility) {
    res.status(404).json({ message: "Choose a facility published by an approved partner." });
    return;
  }
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(sponsoredFacilityCampaigns).set({
      ...input,
      partnerId: facility.partnerId,
      updatedBy: operator.userId,
      updatedAt: new Date(),
    }).where(eq(sponsoredFacilityCampaigns.id, params.data.id)).returning({ id: sponsoredFacilityCampaigns.id });
    if (!row) return false;
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "sponsored_facility_campaign.updated",
      targetId: row.id,
      detail: campaignAuditDetail(input),
    });
    return true;
  });
  if (!updated) {
    res.status(404).json({ message: "Campaign not found." });
    return;
  }
  const record = await campaignDetail(params.data.id);
  if (!record) {
    res.status(404).json({ message: "Campaign not found." });
    return;
  }
  res.json(UpdateSponsoredFacilityCampaignResponse.parse(record));
});

router.get("/public/sponsored-facilities", async (req, res): Promise<void> => {
  const now = new Date();
  const campaigns = await db.select({
    campaignId: sponsoredFacilityCampaigns.id,
    facilityId: sponsoredFacilityCampaigns.facilityId,
    placementTypes: sponsoredFacilityCampaigns.placementTypes,
    targetCity: sponsoredFacilityCampaigns.targetCity,
    targetActivity: sponsoredFacilityCampaigns.targetActivity,
    targetMembershipTiers: sponsoredFacilityCampaigns.targetMembershipTiers,
    partnerId: sponsoredFacilityCampaigns.partnerId,
    city: facilityProfiles.city,
    activities: facilityProfiles.activities,
  }).from(sponsoredFacilityCampaigns)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, sponsoredFacilityCampaigns.facilityId))
    .innerJoin(partners, eq(partners.id, sponsoredFacilityCampaigns.partnerId))
    .where(and(
      eq(sponsoredFacilityCampaigns.status, "active"),
      eq(partners.approved, true),
      lte(sponsoredFacilityCampaigns.startsAt, now),
      gte(sponsoredFacilityCampaigns.endsAt, now),
    ))
    .orderBy(asc(sponsoredFacilityCampaigns.startsAt));
  const [suspendedPartners, suspendedFacilities] = await Promise.all([
    suspendedEntityIds("partner"),
    suspendedEntityIds("facility"),
  ]);
  const tiers = await activeMembershipTiers(getAuth(req).userId, now);
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en");
  const visible = campaigns.filter(campaign => {
    if (suspendedPartners.has(campaign.partnerId) || suspendedFacilities.has(campaign.facilityId)) return false;
    if (campaign.targetCity && normalize(campaign.targetCity) !== normalize(campaign.city)) return false;
    if (campaign.targetActivity) {
      const match = campaign.activities.some(activity =>
        Object.values(activity).some(value => normalize(value) === normalize(campaign.targetActivity!)),
      );
      if (!match) return false;
    }
    return campaign.targetMembershipTiers.length === 0
      || campaign.targetMembershipTiers.some(tier => tiers.has(tier));
  }).map(campaign => ({
    campaignId: campaign.campaignId,
    facilityId: campaign.facilityId,
    placementTypes: campaign.placementTypes as PlacementType[],
    targetCity: campaign.targetCity,
    targetActivity: campaign.targetActivity,
  }));
  res.json(GetPublicSponsoredFacilitiesResponse.parse(visible));
});

router.post("/public/sponsored-facilities/:id/events", async (req, res): Promise<void> => {
  const params = RecordPublicSponsoredFacilityEventParams.safeParse(req.params);
  const parsed = RecordPublicSponsoredFacilityEventBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Invalid sponsored placement event." });
    return;
  }
  const now = new Date();
  const [campaign] = await db.select({
    id: sponsoredFacilityCampaigns.id,
    facilityId: sponsoredFacilityCampaigns.facilityId,
    partnerId: sponsoredFacilityCampaigns.partnerId,
    placementTypes: sponsoredFacilityCampaigns.placementTypes,
    targetMembershipTiers: sponsoredFacilityCampaigns.targetMembershipTiers,
  }).from(sponsoredFacilityCampaigns)
    .innerJoin(partners, eq(partners.id, sponsoredFacilityCampaigns.partnerId))
    .where(and(
      eq(sponsoredFacilityCampaigns.id, params.data.id),
      eq(sponsoredFacilityCampaigns.status, "active"),
      eq(partners.approved, true),
      lte(sponsoredFacilityCampaigns.startsAt, now),
      gte(sponsoredFacilityCampaigns.endsAt, now),
    ))
    .limit(1);
  if (!campaign || !campaign.placementTypes.includes(parsed.data.placementType)) {
    res.status(404).json({ message: "Active sponsored placement not found." });
    return;
  }
  if (await isAccessSuspended("partner", campaign.partnerId)
    || await isAccessSuspended("facility", campaign.facilityId)) {
    res.status(404).json({ message: "Active sponsored placement not found." });
    return;
  }
  if (campaign.targetMembershipTiers.length > 0) {
    const tiers = await activeMembershipTiers(getAuth(req).userId, now);
    if (!campaign.targetMembershipTiers.some(tier => tiers.has(tier))) {
      res.status(404).json({ message: "Active sponsored placement not found." });
      return;
    }
  }
  await db.insert(sponsoredPlacementEvents).values({
    id: randomUUID(),
    campaignId: campaign.id,
    eventType: parsed.data.eventType,
    placementType: parsed.data.placementType,
  });
  res.sendStatus(204);
});

export default router;
