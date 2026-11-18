import { Router } from "express";
import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  facilityHoursOverrides,
  facilityProfiles,
  facilityReviews,
  offerings,
  partners,
} from "@workspace/db";
import {
  GetPublicFacilitiesResponse,
  GetPublicFacilityParams,
  GetPublicFacilityResponse,
} from "@workspace/api-zod";
import { iraqCalendarDate, openingState } from "../lib/facility-hours";
import { filterSuspendedOfferings, suspendedEntityIds } from "../lib/account-access-restrictions";

const router = Router();

async function publishedFacilities(id?: string) {
  const [allProfiles, suspendedPartners, suspendedFacilities] = await Promise.all([
    db.select({ profile: facilityProfiles, partnerName: partners.name })
    .from(facilityProfiles)
    .innerJoin(partners, eq(facilityProfiles.partnerId, partners.id))
    .where(and(eq(partners.approved, true), id ? eq(facilityProfiles.id, id) : undefined))
    .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility)),
    suspendedEntityIds("partner"),
    suspendedEntityIds("facility"),
  ]);
  const profiles = allProfiles.filter(row =>
    !suspendedPartners.has(row.profile.partnerId) && !suspendedFacilities.has(row.profile.id));
  if (!profiles.length) return [];

  const partnerIds = [...new Set(profiles.map(row => row.profile.partnerId))];
  const now = new Date();
  const hoursOverrideRows = await db.select().from(facilityHoursOverrides)
    .where(and(
      inArray(facilityHoursOverrides.facilityId, profiles.map(row => row.profile.id)),
      gte(facilityHoursOverrides.endDate, iraqCalendarDate(now)),
    ))
    .orderBy(asc(facilityHoursOverrides.startDate), asc(facilityHoursOverrides.createdAt));
  const hoursOverridesByFacility = new Map<string, typeof hoursOverrideRows>();
  for (const override of hoursOverrideRows) {
    const current = hoursOverridesByFacility.get(override.facilityId) ?? [];
    current.push(override);
    hoursOverridesByFacility.set(override.facilityId, current);
  }
  const sessionRows = await db.select({
    id: offerings.id,
    partnerId: offerings.partnerId,
    city: offerings.city,
    facility: offerings.facility,
    title: offerings.title,
    localizedTitle: offerings.localizedTitle,
    localizedInstructor: offerings.localizedInstructor,
    category: offerings.category,
    startsAt: offerings.startsAt,
    endsAt: offerings.endsAt,
    accessType: offerings.accessType,
    tiers: offerings.tiers,
    difficultyLevel: offerings.difficultyLevel,
    environment: offerings.environment,
    gender: offerings.gender,
    minAge: offerings.minAge,
    maxAge: offerings.maxAge,
  }).from(offerings)
    .innerJoin(partners, eq(offerings.partnerId, partners.id))
    .where(and(
      eq(offerings.scope, "live"),
      eq(offerings.active, true),
      isNull(offerings.cancelledAt),
      eq(offerings.additionalPayment, false),
      eq(partners.approved, true),
      gt(offerings.startsAt, now),
      inArray(offerings.partnerId, partnerIds),
    ))
    .orderBy(asc(offerings.startsAt));
  const liveSessions = await filterSuspendedOfferings(sessionRows);
  const ratingRows = await db.select({
    facilityId: facilityReviews.facilityId,
    reviewCount: sql<number>`count(*)::int`,
    averageRating: sql<number | null>`round(avg(${facilityReviews.overallRating})::numeric, 1)`,
  }).from(facilityReviews)
    .where(and(
      eq(facilityReviews.status, "published"),
      inArray(facilityReviews.facilityId, profiles.map(row => row.profile.id)),
    ))
    .groupBy(facilityReviews.facilityId);
  const ratingsByFacility = new Map(ratingRows.map(row => [row.facilityId, row]));
  const normalized = (value: string) => value.trim().toLocaleLowerCase("en");

  return profiles.map(({ profile, partnerName }) => {
    const specialHours = hoursOverridesByFacility.get(profile.id) ?? [];
    return {
      ...profile,
      publishedAt: profile.publishedAt?.toISOString() ?? null,
      partnerName,
      averageRating: ratingsByFacility.get(profile.id)?.averageRating == null
        ? null : Number(ratingsByFacility.get(profile.id)?.averageRating),
      reviewCount: ratingsByFacility.get(profile.id)?.reviewCount ?? 0,
      specialHours,
      ...openingState(profile.openingHours, now, specialHours),
      upcomingSessions: liveSessions.filter(session =>
        session.partnerId === profile.partnerId &&
        normalized(session.city) === normalized(profile.city) &&
        normalized(session.facility) === normalized(profile.facility),
      ).map(({ partnerId: _partnerId, city: _city, facility: _facility, ...session }) => session),
    };
  });
}

router.get("/facilities", async (_req, res) => {
  const facilities = await publishedFacilities();
  res.json(GetPublicFacilitiesResponse.parse(facilities));
});

router.get("/facilities/:id", async (req, res): Promise<void> => {
  const params = GetPublicFacilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Invalid facility ID." });
    return;
  }
  const [facility] = await publishedFacilities(params.data.id);
  if (!facility) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }
  res.json(GetPublicFacilityResponse.parse(facility));
});

export default router;
