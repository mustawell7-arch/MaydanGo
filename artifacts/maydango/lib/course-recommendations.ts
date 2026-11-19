export type RecommendationCourse = {
  id: string;
  category: string;
  enrolled: boolean;
  isSaved?: boolean;
};

export type RecommendationReason = 'saved-course-interest' | 'enrollment-interest';

export type OnlineCourseRecommendation<TCourse> = {
  course: TCourse;
  reason: RecommendationReason;
};

type CategoryInterest = {
  saved: number;
  enrolled: number;
};

const normalizedCategory = (category: string) => category.trim().toLocaleLowerCase('en');

export function recommendOnlineCourses<T extends RecommendationCourse>(
  courses: T[],
  limit = 3,
): OnlineCourseRecommendation<T>[] {
  if (!Number.isInteger(limit) || limit < 1) return [];

  const interests = new Map<string, CategoryInterest>();
  for (const course of courses) {
    if (!course.enrolled && !course.isSaved) continue;
    const category = normalizedCategory(course.category);
    if (!category) continue;
    const interest = interests.get(category) ?? { saved: 0, enrolled: 0 };
    if (course.isSaved) interest.saved += 1;
    if (course.enrolled) interest.enrolled += 1;
    interests.set(category, interest);
  }

  return courses
    .flatMap(course => {
      if (course.enrolled || course.isSaved) return [];
      const category = normalizedCategory(course.category);
      if (!category) return [];
      const interest = interests.get(category);
      if (!interest) return [];
      const score = interest.saved * 3 + interest.enrolled;
      if (score < 1) return [];
      return [{
        course,
        score,
        category,
        reason: interest.saved ? 'saved-course-interest' as const : 'enrollment-interest' as const,
      }];
    })
    .sort((left, right) =>
      right.score - left.score ||
      left.category.localeCompare(right.category, 'en') ||
      left.course.id.localeCompare(right.course.id, 'en'),
    )
    .slice(0, limit)
    .map(({ course, reason }) => ({ course, reason }));
}
