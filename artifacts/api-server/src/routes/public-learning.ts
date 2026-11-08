import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db, learningCourses } from "@workspace/db";
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
  }).from(learningCourses)
    .where(eq(learningCourses.published, true))
    .orderBy(asc(learningCourses.category), asc(learningCourses.title))
    .limit(100);

  res.json(GetPublicCoursesResponse.parse(courses));
});

export default router;
