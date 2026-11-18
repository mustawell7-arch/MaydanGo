export type HomeActivityCandidate<TActivity> = {
  activity: TActivity & { en: string };
  facilityId: string;
  savedPlace: boolean;
  previouslyBooked: boolean;
  preferredActivity?: boolean;
};

export type HomeActivityRecommendation<TActivity> = {
  activity: TActivity;
  facilityCount: number;
};

export function recommendHomeActivities<TActivity extends { en: string }>(
  candidates: HomeActivityCandidate<TActivity>[],
  limit = 4,
): HomeActivityRecommendation<TActivity>[] {
  if (!Number.isInteger(limit) || limit < 1) return [];

  const grouped = new Map<string, {
    activity: TActivity;
    facilityIds: Set<string>;
    savedFacilityIds: Set<string>;
    bookedFacilityIds: Set<string>;
    preferred: boolean;
  }>();

  for (const candidate of candidates) {
    const key = candidate.activity.en.trim().toLocaleLowerCase('en');
    if (!key || !candidate.facilityId) continue;

    const group = grouped.get(key) ?? {
      activity: candidate.activity,
      facilityIds: new Set<string>(),
      savedFacilityIds: new Set<string>(),
      bookedFacilityIds: new Set<string>(),
      preferred: false,
    };
    group.facilityIds.add(candidate.facilityId);
    if (candidate.savedPlace) group.savedFacilityIds.add(candidate.facilityId);
    if (candidate.previouslyBooked) group.bookedFacilityIds.add(candidate.facilityId);
    if (candidate.preferredActivity) group.preferred = true;
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .sort(([leftKey, left], [rightKey, right]) => {
      const preference = Number(right.preferred) - Number(left.preferred);
      const leftInterest = left.bookedFacilityIds.size * 3 + left.savedFacilityIds.size * 2;
      const rightInterest = right.bookedFacilityIds.size * 3 + right.savedFacilityIds.size * 2;
      const relevance = rightInterest - leftInterest;
      return preference
        || relevance
        || right.facilityIds.size - left.facilityIds.size
        || leftKey.localeCompare(rightKey, 'en');
    })
    .slice(0, limit)
    .map(([, group]) => ({ activity: group.activity, facilityCount: group.facilityIds.size }));
}
