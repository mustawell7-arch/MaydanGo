export type RecommendationCourse = {
  id: string;
  category: string;
  enrolled: boolean;
};

const normalizedCategory = (category: string) => category.trim().toLocaleLowerCase('en');

export function recommendOnlineCourses<T extends RecommendationCourse>(courses: T[], limit = 3): T[] {
  if (!Number.isInteger(limit) || limit < 1) return [];

  const enrolledCategoryCounts = new Map<string, number>();
  for (const course of courses) {
    if (!course.enrolled) continue;
    const category = normalizedCategory(course.category);
    if (category) enrolledCategoryCounts.set(category, (enrolledCategoryCounts.get(category) ?? 0) + 1);
  }

  return courses
    .filter(course => !course.enrolled && enrolledCategoryCounts.has(normalizedCategory(course.category)))
    .sort((left, right) => {
      const leftCategory = normalizedCategory(left.category);
      const rightCategory = normalizedCategory(right.category);
      const relevance = (enrolledCategoryCounts.get(rightCategory) ?? 0) - (enrolledCategoryCounts.get(leftCategory) ?? 0);
      return relevance || leftCategory.localeCompare(rightCategory, 'en') || left.id.localeCompare(right.id, 'en');
    })
    .slice(0, limit);
}
