import { Router } from "express";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import {
  db,
  facilityProfiles,
  offerings,
  partners,
} from "@workspace/db";
import {
  GetPublicFacilitiesResponse,
  GetPublicFacilityParams,
  GetPublicFacilityResponse,
} from "@workspace/api-zod";
import { openingState } from "../lib/facility-hours";

const router = Router();

async function publishedFacilities(id?: string) {
  const profiles = await db.select({ profile: facilityProfiles, partnerName: partners.name })
    .from(facilityProfiles)
    .innerJoin(partners, eq(facilityProfiles.partnerId, partners.id))
    .where(and(eq(partners.approved, true), id ? eq(facilityProfiles.id, id) : undefined))
    .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility));
  if (!profiles.length) return [];

  const partnerIds = [...new Set(profiles.map(row => row.profile.partnerId))];
  const now = new Date();
  const liveSessions = await db.select({
    id: offerings.id,
    partnerId: offerings.partnerId,
    city: offerings.city,
    facility: offerings.facility,
    title: offerings.title,
    localizedTitle: offerings.localizedTitle,
    category: offerings.category,
    startsAt: offerings.startsAt,
    endsAt: offerings.endsAt,
    accessType: offerings.accessType,
    gender: offerings.gender,
    minAge: offerings.minAge,
    maxAge: offerings.maxAge,
  }).from(offerings)
    .innerJoin(partners, eq(offerings.partnerId, partners.id))
    .where(and(
      eq(offerings.scope, "live"),
      eq(offerings.active, true),
      isNull(offerings.cancelledAt),
      eq(partners.approved, true),
      gt(offerings.startsAt, now),
      inArray(offerings.partnerId, partnerIds),
    ))
    .orderBy(asc(offerings.startsAt));
  const normalized = (value: string) => value.trim().toLocaleLowerCase("en");

  return profiles.map(({ profile, partnerName }) => ({
    ...profile,
    partnerName,
    ...openingState(profile.openingHours, now),
    upcomingSessions: liveSessions.filter(session =>
      session.partnerId === profile.partnerId &&
      normalized(session.city) === normalized(profile.city) &&
      normalized(session.facility) === normalized(profile.facility),
    ).map(({ partnerId: _partnerId, city: _city, facility: _facility, ...session }) => session),
  }));
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
