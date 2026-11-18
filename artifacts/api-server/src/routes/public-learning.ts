import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, instructorProfiles, learningCourses, learningLessons } from "@workspace/db";
import { GetPublicCoursesResponse, GetPublicInstructorProfilesResponse } from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

router.get("/courses", async (_req, res): Promise<void> => {
  const courses = await db.select({
    id: learningCourses.id,
    localizedTitle: learningCourses.localizedTitle,
    localizedSummary: learningCourses.localizedSummary,
    localizedInstructor: learningCourses.localizedInstructor,
    category: learningCourses.category,
    level: learningCourses.level,
    durationMinutes: learningCourses.durationMinutes,
    publishedAt: learningCourses.publishedAt,
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
    publishedAt: course.publishedAt?.toISOString() ?? null,
    lessonCount: countByCourse.get(course.id) ?? 0,
  }))));
});

router.get("/instructors", async (_req, res): Promise<void> => {
  const profiles = await db.select({
    id: instructorProfiles.id,
    userId: instructorProfiles.userId,
    displayName: instructorProfiles.displayName,
    biography: instructorProfiles.biography,
    qualifications: instructorProfiles.qualifications,
    languages: instructorProfiles.languages,
    specialties: instructorProfiles.specialties,
    photoPath: instructorProfiles.photoPath,
  }).from(instructorProfiles).orderBy(asc(instructorProfiles.displayName)).limit(100);
  const courses = profiles.length
    ? await db.select({
      id: learningCourses.id,
      instructorUserId: learningCourses.instructorUserId,
      localizedTitle: learningCourses.localizedTitle,
      category: learningCourses.category,
    }).from(learningCourses)
      .where(and(
        eq(learningCourses.published, true),
        inArray(learningCourses.instructorUserId, profiles.map(profile => profile.userId)),
      ))
      .orderBy(asc(learningCourses.category), asc(learningCourses.title))
    : [];
  const coursesByInstructor = new Map<string, typeof courses>();
  for (const course of courses) {
    if (!course.instructorUserId) continue;
    const saved = coursesByInstructor.get(course.instructorUserId) ?? [];
    saved.push(course);
    coursesByInstructor.set(course.instructorUserId, saved);
  }
  res.json(GetPublicInstructorProfilesResponse.parse(profiles.map(profile => ({
    id: profile.id,
    displayName: profile.displayName,
    biography: profile.biography,
    qualifications: profile.qualifications,
    languages: profile.languages,
    specialties: profile.specialties,
    photoUrl: profile.photoPath ? `/api/public/instructors/${profile.id}/photo` : null,
    courses: (coursesByInstructor.get(profile.userId) ?? []).map(course => ({
      id: course.id,
      localizedTitle: course.localizedTitle,
      category: course.category,
    })),
  }))));
});

router.get("/instructors/:id/photo", async (req, res): Promise<void> => {
  const [profile] = await db.select({ photoPath: instructorProfiles.photoPath })
    .from(instructorProfiles).where(eq(instructorProfiles.id, String(req.params.id))).limit(1);
  if (!profile?.photoPath) {
    res.status(404).end();
    return;
  }
  let file;
  try {
    file = await objectStorage.getPrivateFile(profile.photoPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).end();
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType ?? "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=300");
  file.createReadStream().on("error", error => {
    req.log.error({ err: error, profileId: String(req.params.id) }, "Failed to stream public instructor photo");
    if (!res.headersSent) res.status(404).end();
    else res.end();
  }).pipe(res);
});

export default router;
