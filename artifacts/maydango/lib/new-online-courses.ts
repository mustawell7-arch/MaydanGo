export type DatedOnlineCourse = {
  id: string;
  publishedAt: string | null;
};

const recentCourseWindowMs = 30 * 24 * 60 * 60 * 1000;

export function getNewOnlineCourses<T extends DatedOnlineCourse>(
  courses: T[],
  now = Date.now(),
  limit = 4,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  return courses
    .filter(course => {
      if (!course.publishedAt) return false;
      const publishedAt = Date.parse(course.publishedAt);
      return Number.isFinite(publishedAt)
        && publishedAt <= now
        && now - publishedAt <= recentCourseWindowMs;
    })
    .sort((left, right) =>
      Date.parse(right.publishedAt!) - Date.parse(left.publishedAt!)
      || left.id.localeCompare(right.id, 'en'),
    )
    .slice(0, limit);
}
