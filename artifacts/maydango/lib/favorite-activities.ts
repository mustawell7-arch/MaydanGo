export type FavoriteActivityLabel = {
  en: string;
  ar: string;
  ku: string;
};

export function activityFavoriteId(activityName: string): string {
  return activityName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

export function toggleActivityFavorite(favorites: string[], activityName: string): string[] {
  const id = activityFavoriteId(activityName);
  if (!id) return favorites;
  return favorites.includes(id)
    ? favorites.filter(favorite => favorite !== id)
    : [...favorites, id];
}

export function getFavoriteActivities<TActivity extends FavoriteActivityLabel>(
  activities: TActivity[],
  favorites: string[],
  limit = 8,
): TActivity[] {
  if (!Number.isInteger(limit) || limit < 1) return [];

  const activitiesById = new Map<string, TActivity>();
  for (const activity of activities) {
    const id = activityFavoriteId(activity.en);
    if (id && !activitiesById.has(id)) activitiesById.set(id, activity);
  }

  const seen = new Set<string>();
  return favorites.flatMap(favorite => {
    const id = activityFavoriteId(favorite);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const activity = activitiesById.get(id);
    return activity ? [activity] : [];
  }).slice(0, limit);
}
