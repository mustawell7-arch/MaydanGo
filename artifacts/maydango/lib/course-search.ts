type LocalizedValues = {
  en?: string | null;
  ar?: string | null;
  ku?: string | null;
};

export type CourseSearchRecord = {
  title?: string | null;
  category?: string | null;
  level?: string | null;
  localizedTitle?: LocalizedValues | null;
  localizedSummary?: LocalizedValues | null;
  localizedInstructor?: LocalizedValues | null;
};

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '');

export function courseMatchesSearch(course: CourseSearchRecord, query: string): boolean {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const searchableFields = [
    course.title,
    course.category,
    course.level,
    ...Object.values(course.localizedTitle ?? {}),
    ...Object.values(course.localizedSummary ?? {}),
    ...Object.values(course.localizedInstructor ?? {}),
  ].map(value => normalize(String(value ?? '')));

  return terms.every(term => searchableFields.some(field => field.includes(term)));
}
