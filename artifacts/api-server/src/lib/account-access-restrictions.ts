import { and, eq } from "drizzle-orm";
import { accountAccessRestrictions, db, facilityProfiles } from "@workspace/db";
import { inArray } from "drizzle-orm";

export type RestrictedEntityType = "member" | "partner" | "facility";

export async function isAccessSuspended(entityType: RestrictedEntityType, entityId: string): Promise<boolean> {
  const [restriction] = await db.select({ entityId: accountAccessRestrictions.entityId })
    .from(accountAccessRestrictions)
    .where(and(
      eq(accountAccessRestrictions.entityType, entityType),
      eq(accountAccessRestrictions.entityId, entityId),
      eq(accountAccessRestrictions.status, "suspended"),
    )).limit(1);
  return !!restriction;
}

export async function hasAccessRestrictionRecord(entityType: RestrictedEntityType, entityId: string): Promise<boolean> {
  const [restriction] = await db.select({ entityId: accountAccessRestrictions.entityId })
    .from(accountAccessRestrictions)
    .where(and(
      eq(accountAccessRestrictions.entityType, entityType),
      eq(accountAccessRestrictions.entityId, entityId),
    )).limit(1);
  return !!restriction;
}

export async function suspendedEntityIds(entityType: RestrictedEntityType): Promise<Set<string>> {
  const rows = await db.select({ entityId: accountAccessRestrictions.entityId })
    .from(accountAccessRestrictions)
    .where(and(
      eq(accountAccessRestrictions.entityType, entityType),
      eq(accountAccessRestrictions.status, "suspended"),
    ));
  return new Set(rows.map(row => row.entityId));
}

export async function filterSuspendedOfferings<T extends {
  partnerId: string | null;
  city: string;
  facility: string;
}>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const partnerIds = [...new Set(rows.flatMap(row => row.partnerId ? [row.partnerId] : []))];
  const [suspendedPartners, suspendedFacilities] = await Promise.all([
    suspendedEntityIds("partner"),
    suspendedEntityIds("facility"),
  ]);
  const profiles = partnerIds.length
    ? await db.select({
      id: facilityProfiles.id,
      partnerId: facilityProfiles.partnerId,
      city: facilityProfiles.city,
      facility: facilityProfiles.facility,
    }).from(facilityProfiles).where(inArray(facilityProfiles.partnerId, partnerIds))
    : [];
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en");
  const suspendedLocations = new Set(profiles
    .filter(profile => suspendedFacilities.has(profile.id))
    .map(profile => `${profile.partnerId}|${normalize(profile.city)}|${normalize(profile.facility)}`));
  return rows.filter(row => {
    if (!row.partnerId || suspendedPartners.has(row.partnerId)) return false;
    return !suspendedLocations.has(`${row.partnerId}|${normalize(row.city)}|${normalize(row.facility)}`);
  });
}
