export type DatedFacilityVisit = {
  facilityId: string;
  visitedAt: string;
};

export function getRecentlyVisitedFacilities<T extends DatedFacilityVisit>(
  visits: T[],
  now = Date.now(),
  limit = 4,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) return [];

  const sorted = visits
    .filter(visit => {
      const visitedAt = Date.parse(visit.visitedAt);
      return visit.facilityId.trim().length > 0
        && Number.isFinite(visitedAt)
        && visitedAt <= now;
    })
    .slice()
    .sort((left, right) => Date.parse(right.visitedAt) - Date.parse(left.visitedAt));

  const seen = new Set<string>();
  return sorted.filter(visit => {
    if (seen.has(visit.facilityId)) return false;
    seen.add(visit.facilityId);
    return true;
  }).slice(0, limit);
}
