export type DatedFacility = {
  id: string;
  city: string;
  publishedAt: string | null;
};

const recentFacilityWindowMs = 30 * 24 * 60 * 60 * 1000;

export function getNewFacilities<T extends DatedFacility>(
  facilities: T[],
  selectedCityId: string,
  now = Date.now(),
  limit = 4,
  matchesCity = (city: string, id: string) =>
    city.trim().toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '') === id.trim().toLocaleLowerCase('en').replace(/[^a-z0-9]/g, ''),
): T[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  return facilities
    .filter(facility => {
      if (!facility.publishedAt) return false;
      if (selectedCityId !== 'all' && !matchesCity(facility.city, selectedCityId)) return false;
      const publishedAt = Date.parse(facility.publishedAt);
      return Number.isFinite(publishedAt) && publishedAt <= now && now - publishedAt <= recentFacilityWindowMs;
    })
    .sort((left, right) =>
      Date.parse(right.publishedAt!) - Date.parse(left.publishedAt!) || left.id.localeCompare(right.id, 'en'),
    )
    .slice(0, limit);
}
