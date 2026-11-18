export type InstructorWithPublishedCourses = {
  id: string;
  displayName: string;
  courses: readonly unknown[];
};

export function getFeaturedInstructors<T extends InstructorWithPublishedCourses>(
  profiles: T[],
  limit = 3,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) return [];

  return profiles
    .filter(profile => profile.displayName.trim().length > 0 && profile.courses.length > 0)
    .slice()
    .sort((left, right) =>
      right.courses.length - left.courses.length
      || left.displayName.localeCompare(right.displayName, 'en', { sensitivity: 'base' })
      || left.id.localeCompare(right.id, 'en'),
    )
    .slice(0, limit);
}
