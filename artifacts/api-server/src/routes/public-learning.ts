import { Router } from "express";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, learningCourses, learningLessons } from "@workspace/db";
import { GetPublicCoursesResponse } from "@workspace/api-zod";

const router = Router();

router.get("/courses", async (_req, res): Promise<void> => {
  const courses = await db.select({
    id: learningCourses.id,
    localizedTitle: learningCourses.localizedTitle,
    localizedSummary: learningCourses.localizedSummary,
    localizedInstructor: learningCourses.localizedInstructor,
    category: learningCourses.category,
    level: learningCourses.level,
    durationMinutes: learningCourses.durationMinutes,
    courseLanguages: learningCourses.courseLanguages,
    subtitleLanguages: learningCourses.subtitleLanguages,
    requiredEquipment: learningCourses.requiredEquipment,
    disclaimers: learningCourses.disclaimers,
    supportingMaterials: learningCourses.supportingMaterials,
  }).from(learningCourses)
    .where(eq(learningCourses.published, true))
    .orderBy(asc(learningCourses.category), asc(learningCourses.title))
    .limit(100);
  const lessonCounts = courses.length
    ? await db.select({
      courseId: learningLessons.courseId,
      lessonCount: sql<number>`count(*)::int`,
    }).from(learningLessons)
      .where(inArray(learningLessons.courseId, courses.map(course => course.id)))
      .groupBy(learningLessons.courseId)
    : [];
  const countByCourse = new Map(lessonCounts.map(row => [row.courseId, row.lessonCount]));

  res.json(GetPublicCoursesResponse.parse(courses.map(course => ({
    ...course,
    lessonCount: countByCourse.get(course.id) ?? 0,
  }))));
});

export default router;
