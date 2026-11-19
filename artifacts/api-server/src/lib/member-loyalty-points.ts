import { and, desc, eq, max, sql } from "drizzle-orm";
import {
  attendance,
  courseEnrollments,
  db,
  learningCourses,
  learningLessons,
  lessonProgress,
  offerings,
} from "@workspace/db";

export type MemberLoyaltyPointSource = "confirmed_visit" | "course_completion";

export type MemberLoyaltyPointEntry = {
  id: string;
  source: MemberLoyaltyPointSource;
  points: 1;
  earnedAt: Date;
  localizedTitle: { en: string; ar: string; ku: string };
  facility: string | null;
};

/**
 * Loyalty points are a private, non-cash summary derived from current source
 * records. Deriving the list keeps repeat requests idempotent and automatically
 * excludes attendance that is no longer confirmed and settlement-eligible.
 */
export async function getMemberLoyaltyPoints(userId: string) {
  const [visitRows, courseRows] = await Promise.all([
    db.select({
      id: attendance.id,
      earnedAt: attendance.checkedInAt,
      title: offerings.title,
      localizedTitle: offerings.localizedTitle,
      facility: offerings.facility,
    }).from(attendance)
      .innerJoin(offerings, eq(attendance.offeringId, offerings.id))
      .where(and(
        eq(attendance.userId, userId),
        eq(attendance.status, "confirmed"),
        eq(attendance.settlementEligible, true),
        eq(offerings.scope, "live"),
      ))
      .orderBy(desc(attendance.checkedInAt), desc(attendance.id)),
    db.select({
      enrollmentId: courseEnrollments.id,
      earnedAt: max(lessonProgress.completedAt),
      localizedTitle: learningCourses.localizedTitle,
    }).from(courseEnrollments)
      .innerJoin(learningCourses, eq(courseEnrollments.courseId, learningCourses.id))
      .innerJoin(learningLessons, eq(learningLessons.courseId, learningCourses.id))
      .leftJoin(lessonProgress, and(
        eq(lessonProgress.enrollmentId, courseEnrollments.id),
        eq(lessonProgress.lessonId, learningLessons.id),
      ))
      .where(eq(courseEnrollments.userId, userId))
      .groupBy(courseEnrollments.id, learningCourses.localizedTitle)
      .having(sql`count(${learningLessons.id}) > 0 and count(${lessonProgress.id}) = count(${learningLessons.id})`)
      .orderBy(desc(max(lessonProgress.completedAt)), desc(courseEnrollments.id)),
  ]);

  const entries: MemberLoyaltyPointEntry[] = [
    ...visitRows.map(row => ({
      id: `attendance:${row.id}`,
      source: "confirmed_visit" as const,
      points: 1 as const,
      earnedAt: row.earnedAt,
      localizedTitle: row.localizedTitle ?? { en: row.title, ar: row.title, ku: row.title },
      facility: row.facility,
    })),
    ...courseRows.flatMap(row => row.earnedAt ? [{
      id: `course:${row.enrollmentId}`,
      source: "course_completion" as const,
      points: 1 as const,
      earnedAt: row.earnedAt,
      localizedTitle: row.localizedTitle,
      facility: null,
    }] : []),
  ].sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime() || a.id.localeCompare(b.id));

  return {
    balance: entries.reduce((total, entry) => total + entry.points, 0),
    entries,
  };
}
