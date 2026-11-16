import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  db, courseEnrollments, courseMaterials, lessonAccess, learningCourses, learningLessons, lessonProgress,
  memberSavedCourses,
  memberships, offerings, partners, reservations,
} from "@workspace/db";
import {
  CreateMemberCoursePlaybackLinkResponse,
  CreateMemberCourseMaterialDownloadLinkResponse,
  CreateLiveClassJoinResponse, EnrollMemberCourseResponse, GetMemberCourseResponse,
  GetMemberCoursesResponse, GetMemberLiveClassesResponse, UpdateCourseProgressBody,
  UpdateCourseProgressResponse, RecordMemberCourseLessonViewResponse,
  UpdateMemberCoursePlaybackProgressBody, UpdateMemberCoursePlaybackProgressResponse,
  SetMemberCourseFavoriteBody, SetMemberCourseFavoriteParams, SetMemberCourseFavoriteResponse,
} from "@workspace/api-zod";
import { BookingError, membershipCanAccess } from "../lib/reservations";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { courseRecordingContentType, isPrivateCourseRecordingPath } from "../lib/course-recordings";
import { createCoursePlaybackToken, verifyCoursePlaybackToken } from "../lib/course-playback-token";
import { createCourseMaterialToken, verifyCourseMaterialToken } from "../lib/course-material-token";
import { courseMaterialObjectPath, isPrivateCourseMaterialPath } from "../lib/course-materials";
import { isAccessSuspended } from "../lib/account-access-restrictions";

const router = Router();
export const learningObjectStorage = new ObjectStorageService();
const joinLeadMs = 15 * 60 * 1000;

async function currentEligibleMembership(userId: string) {
  const [membership] = await db.select().from(memberships).where(
    and(eq(memberships.userId, userId), eq(memberships.scope, "live")),
  );
  const now = new Date();
  if (!membership || !membershipCanAccess(membership, now)) return null;
  // Match existing booking policy. Preview memberships and unpaid activation never grant content access.
  if (!((["trial", "corporate"].includes(membership.source)) && membership.paymentStatus === "not_required")) return null;
  if (membership.source === "corporate" &&
      (!membership.rules.corporateId || membership.corporateId !== membership.rules.corporateId)) return null;
  return membership;
}

async function currentLiveMembership(userId: string) {
  const membership = await currentEligibleMembership(userId);
  if (!membership) return null;
  if (membership.source === "trial" && !membership.rules.trialAllowedTypes?.includes("live")) return null;
  return membership;
}

async function currentDigitalCourseMembership(userId: string) {
  const membership = await currentEligibleMembership(userId);
  if (!membership || membership.rules.planTerms?.digitalContentAccess !== true) return null;
  return membership;
}

function courseSummary(course: typeof learningCourses.$inferSelect, enrolled: boolean, completedLessons: number, lessonCount: number, isSaved: boolean) {
  return {
    id: course.id,
    title: course.localizedTitle.en,
    localizedTitle: course.localizedTitle,
    localizedSummary: course.localizedSummary,
    localizedInstructor: course.localizedInstructor,
    category: course.category,
    level: course.level,
    durationMinutes: course.durationMinutes,
    thumbnailUrl: course.thumbnailUrl,
    published: course.published,
    courseLanguages: course.courseLanguages,
    subtitleLanguages: course.subtitleLanguages,
    requiredEquipment: course.requiredEquipment,
    disclaimers: course.disclaimers,
    supportingMaterials: course.supportingMaterials,
    lessonCount,
    enrolled,
    completedLessons,
    isSaved,
  };
}

async function getCourseDetail(userId: string, id: string) {
  const [course] = await db.select().from(learningCourses).where(
    and(eq(learningCourses.id, id), eq(learningCourses.published, true)),
  );
  if (!course) throw new BookingError(404, "This course is not available.");

  const [membership, enrollment, savedCourse] = await Promise.all([
    currentDigitalCourseMembership(userId),
    db.select().from(courseEnrollments).where(and(
      eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, id),
    )),
    db.select({ id: memberSavedCourses.id }).from(memberSavedCourses).where(and(
      eq(memberSavedCourses.userId, userId), eq(memberSavedCourses.courseId, id),
    )),
  ]);
  const enrolled = enrollment[0];
  const accessState = !membership ? "membership_required" : !enrolled ? "enrollment_required" : "ready";
  const lessons = await db.select().from(learningLessons)
    .where(eq(learningLessons.courseId, id)).orderBy(asc(learningLessons.position));
  const [completedRows, viewedRows] = enrolled
    ? await Promise.all([
      db.select({ lessonId: lessonProgress.lessonId }).from(lessonProgress)
        .where(eq(lessonProgress.enrollmentId, enrolled.id)),
      db.select({
        lessonId: lessonAccess.lessonId,
        playbackPositionSeconds: lessonAccess.playbackPositionSeconds,
        durationSeconds: lessonAccess.durationSeconds,
      }).from(lessonAccess)
        .where(eq(lessonAccess.enrollmentId, enrolled.id)),
    ])
    : [[], []];
  const completed = new Set(completedRows.map(row => row.lessonId));
  const viewedByLesson = new Map(viewedRows.map(row => [row.lessonId, row]));
  const materials = accessState === "ready" && enrolled
    ? await db.select({
      id: courseMaterials.id,
      title: courseMaterials.title,
      fileName: courseMaterials.fileName,
      sizeBytes: courseMaterials.sizeBytes,
      approvedAt: courseMaterials.approvedAt,
    }).from(courseMaterials)
      .where(eq(courseMaterials.courseId, id))
      .orderBy(asc(courseMaterials.approvedAt))
    : [];
  const summary = courseSummary(course, !!enrolled, completed.size, lessons.length, savedCourse.length > 0);
  return {
    ...summary,
    accessState,
    materials,
    lastAccessAt: enrolled?.lastAccessAt ?? null,
    lessons: lessons.map(lesson => ({
      id: lesson.id,
      position: lesson.position,
      localizedTitle: lesson.localizedTitle,
      localizedContent: accessState === "ready" ? lesson.localizedContent : null,
      durationMinutes: lesson.durationMinutes,
      mediaUrl: null,
      hasRecording: accessState === "ready" && isPrivateCourseRecordingPath(lesson.mediaUrl),
      recordingKind: accessState === "ready" && isPrivateCourseRecordingPath(lesson.mediaUrl)
        ? (courseRecordingContentType(lesson.mediaUrl)?.startsWith("audio/") ? "audio" : "video")
        : null,
      completed: completed.has(lesson.id),
      viewed: viewedByLesson.has(lesson.id),
      playbackPositionSeconds: accessState === "ready" ? viewedByLesson.get(lesson.id)?.playbackPositionSeconds ?? 0 : 0,
      durationSeconds: accessState === "ready" ? viewedByLesson.get(lesson.id)?.durationSeconds ?? null : null,
    })),
  };
}

router.get("/courses", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to browse courses." }); return; }
  const published = await db.select().from(learningCourses)
    .where(eq(learningCourses.published, true)).orderBy(asc(learningCourses.title));
  const enrollments = published.length ? await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), inArray(courseEnrollments.courseId, published.map(course => course.id)))) : [];
  const enrollmentByCourse = new Map(enrollments.map(enrollment => [enrollment.courseId, enrollment]));
  const progressRows = enrollments.length ? await db.select({
    enrollmentId: lessonProgress.enrollmentId,
    count: sql<number>`count(*)::int`,
  }).from(lessonProgress).where(inArray(lessonProgress.enrollmentId, enrollments.map(row => row.id)))
    .groupBy(lessonProgress.enrollmentId) : [];
  const progressByEnrollment = new Map(progressRows.map(row => [row.enrollmentId, row.count]));
  const lessonCounts = published.length ? await db.select({
    courseId: learningLessons.courseId,
    count: sql<number>`count(*)::int`,
  }).from(learningLessons).where(inArray(learningLessons.courseId, published.map(course => course.id)))
    .groupBy(learningLessons.courseId) : [];
  const countByCourse = new Map(lessonCounts.map(row => [row.courseId, row.count]));
  const savedRows = published.length ? await db.select({ courseId: memberSavedCourses.courseId })
    .from(memberSavedCourses).where(and(
      eq(memberSavedCourses.userId, userId),
      inArray(memberSavedCourses.courseId, published.map(course => course.id)),
    )) : [];
  const savedCourseIds = new Set(savedRows.map(row => row.courseId));
  res.json(GetMemberCoursesResponse.parse(published.map(course => {
    const enrollment = enrollmentByCourse.get(course.id);
    return courseSummary(
      course,
      !!enrollment,
      enrollment ? progressByEnrollment.get(enrollment.id) ?? 0 : 0,
      countByCourse.get(course.id) ?? 0,
      savedCourseIds.has(course.id),
    );
  })));
});

router.get("/courses/:id", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to view this course." }); return; }
  res.json(GetMemberCourseResponse.parse(await getCourseDetail(userId, String(req.params.id))));
});

router.put("/courses/:id/favorite", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to save courses." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from account changes. Contact MaydanGo support.");
  }
  const { id: courseId } = SetMemberCourseFavoriteParams.parse(req.params);
  const body = SetMemberCourseFavoriteBody.parse(req.body);
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, courseId), eq(learningCourses.published, true),
  ));
  if (!course) throw new BookingError(404, "This course is not available.");

  let savedAt: Date | null = null;
  if (body.isSaved) {
    await db.insert(memberSavedCourses).values({
      id: randomUUID(),
      userId,
      courseId,
    }).onConflictDoNothing({
      target: [memberSavedCourses.userId, memberSavedCourses.courseId],
    });
    const [saved] = await db.select({ savedAt: memberSavedCourses.savedAt }).from(memberSavedCourses).where(and(
      eq(memberSavedCourses.userId, userId), eq(memberSavedCourses.courseId, courseId),
    ));
    savedAt = saved?.savedAt ?? null;
  } else {
    await db.delete(memberSavedCourses).where(and(
      eq(memberSavedCourses.userId, userId), eq(memberSavedCourses.courseId, courseId),
    ));
  }

  res.json(SetMemberCourseFavoriteResponse.parse({
    courseId,
    isSaved: body.isSaved,
    savedAt,
  }));
});

router.post("/courses/:id/lessons/:lessonId/view", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to record lesson progress." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from course changes. Contact MaydanGo support.");
  }
  const courseId = String(req.params.id);
  const lessonId = String(req.params.lessonId);
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, courseId), eq(learningCourses.published, true),
  ));
  if (!course) throw new BookingError(404, "This course is not available.");
  if (!await currentDigitalCourseMembership(userId)) {
    throw new BookingError(403, "An eligible membership with digital course access is required to view lessons.");
  }
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId),
  ));
  if (!enrollment) throw new BookingError(403, "Enroll in this course before viewing lessons.");
  const [lesson] = await db.select({ id: learningLessons.id }).from(learningLessons).where(and(
    eq(learningLessons.id, lessonId), eq(learningLessons.courseId, courseId),
  ));
  if (!lesson) throw new BookingError(404, "This lesson is not part of the course.");

  const now = new Date();
  const [view, updatedEnrollment] = await db.transaction(async tx => {
    const [recordedView] = await tx.insert(lessonAccess).values({
      id: randomUUID(),
      enrollmentId: enrollment.id,
      lessonId: lesson.id,
      lastViewedAt: now,
    }).onConflictDoUpdate({
      target: [lessonAccess.enrollmentId, lessonAccess.lessonId],
      set: { lastViewedAt: now },
    }).returning();
    const [updated] = await tx.update(courseEnrollments).set({ lastAccessAt: now })
      .where(eq(courseEnrollments.id, enrollment.id))
      .returning({ lastAccessAt: courseEnrollments.lastAccessAt });
    return [recordedView, updated];
  });
  res.json(RecordMemberCourseLessonViewResponse.parse({
    lessonId: lesson.id,
    firstViewedAt: view.firstViewedAt,
    lastViewedAt: view.lastViewedAt,
    lastAccessAt: updatedEnrollment.lastAccessAt,
  }));
});

router.put("/courses/:id/lessons/:lessonId/playback-progress", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to save playback progress." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from course access. Contact MaydanGo support.");
  }
  const body = UpdateMemberCoursePlaybackProgressBody.parse(req.body);
  if (body.positionSeconds > body.durationSeconds) {
    throw new BookingError(400, "Playback position cannot exceed the recording duration.");
  }
  const courseId = String(req.params.id);
  const lessonId = String(req.params.lessonId);
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, courseId), eq(learningCourses.published, true),
  ));
  if (!course) throw new BookingError(404, "This course is not available.");
  if (!await currentDigitalCourseMembership(userId)) {
    throw new BookingError(403, "An eligible membership with digital course access is required to save playback progress.");
  }
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId),
  ));
  if (!enrollment) throw new BookingError(403, "Enroll in this course before saving playback progress.");
  const [lesson] = await db.select({ id: learningLessons.id, mediaUrl: learningLessons.mediaUrl })
    .from(learningLessons).where(and(
      eq(learningLessons.id, lessonId), eq(learningLessons.courseId, courseId),
    ));
  if (!lesson || !isPrivateCourseRecordingPath(lesson.mediaUrl)) {
    throw new BookingError(404, "This course recording is unavailable.");
  }

  const now = new Date();
  const [saved, updatedEnrollment] = await db.transaction(async tx => {
    const [progress] = await tx.insert(lessonAccess).values({
      id: randomUUID(),
      enrollmentId: enrollment.id,
      lessonId: lesson.id,
      lastViewedAt: now,
      playbackPositionSeconds: body.positionSeconds,
      durationSeconds: body.durationSeconds,
    }).onConflictDoUpdate({
      target: [lessonAccess.enrollmentId, lessonAccess.lessonId],
      set: {
        lastViewedAt: now,
        playbackPositionSeconds: body.positionSeconds,
        durationSeconds: body.durationSeconds,
      },
    }).returning({
      playbackPositionSeconds: lessonAccess.playbackPositionSeconds,
      durationSeconds: lessonAccess.durationSeconds,
    });
    const [updated] = await tx.update(courseEnrollments).set({ lastAccessAt: now })
      .where(eq(courseEnrollments.id, enrollment.id))
      .returning({ lastAccessAt: courseEnrollments.lastAccessAt });
    return [progress, updated];
  });
  res.json(UpdateMemberCoursePlaybackProgressResponse.parse({
    lessonId: lesson.id,
    positionSeconds: saved.playbackPositionSeconds,
    durationSeconds: saved.durationSeconds,
    lastAccessAt: updatedEnrollment.lastAccessAt,
  }));
});

router.post("/courses/:id/enroll", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to enroll." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from course enrollment. Contact MaydanGo support.");
  }
  if (!await currentDigitalCourseMembership(userId)) {
    throw new BookingError(403, "An eligible membership with digital course access is required to enroll.");
  }
  const courseId = String(req.params.id);
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses)
    .where(and(eq(learningCourses.id, courseId), eq(learningCourses.published, true)));
  if (!course) throw new BookingError(404, "This course is not available.");
  await db.insert(courseEnrollments).values({ id: randomUUID(), userId, courseId }).onConflictDoNothing();
  res.json(EnrollMemberCourseResponse.parse(await getCourseDetail(userId, courseId)));
});

router.put("/courses/:id/progress", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to save course progress." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from course changes. Contact MaydanGo support.");
  }
  const parsed = UpdateCourseProgressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a valid lesson and completion state." }); return; }
  const courseId = String(req.params.id);
  if (!await currentDigitalCourseMembership(userId)) {
    throw new BookingError(403, "An eligible membership with digital course access is required to access course lessons.");
  }
  const [enrollment] = await db.select().from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId),
  ));
  if (!enrollment) throw new BookingError(403, "Enroll in this course before saving progress.");
  const [lesson] = await db.select({ id: learningLessons.id }).from(learningLessons).where(and(
    eq(learningLessons.id, parsed.data.lessonId), eq(learningLessons.courseId, courseId),
  ));
  if (!lesson) throw new BookingError(404, "This lesson is not part of the course.");

  if (parsed.data.completed) {
    await db.insert(lessonProgress).values({
      id: randomUUID(), enrollmentId: enrollment.id, lessonId: lesson.id,
    }).onConflictDoNothing();
  } else {
    await db.delete(lessonProgress).where(and(
      eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lesson.id),
    ));
  }
  res.json(UpdateCourseProgressResponse.parse(await getCourseDetail(userId, courseId)));
});

router.post("/courses/:id/materials/:materialId/download-link", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to download course materials." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from course access. Contact MaydanGo support.");
  }
  const courseId = String(req.params.id);
  const materialId = String(req.params.materialId);
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, courseId), eq(learningCourses.published, true),
  ));
  if (!course) throw new BookingError(404, "This course is not available.");
  if (!await currentDigitalCourseMembership(userId)) {
    throw new BookingError(403, "An eligible membership with digital course access is required to download materials.");
  }
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId),
  ));
  if (!enrollment) throw new BookingError(403, "Enroll in this course before downloading materials.");
  const [material] = await db.select().from(courseMaterials).where(and(
    eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, courseId),
  ));
  if (!material || !isPrivateCourseMaterialPath(material.objectPath)) {
    throw new BookingError(404, "This course material is unavailable.");
  }
  try {
    const file = await learningObjectStorage.getPrivateFile(material.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== material.sizeBytes || Number(metadata.size) < 1) {
      throw new BookingError(404, "This course material is unavailable.");
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) throw new BookingError(404, "This course material is unavailable.");
    throw error;
  }
  const { token, expiresAt } = createCourseMaterialToken({ userId, courseId, materialId });
  res.setHeader("Cache-Control", "no-store");
  res.json(CreateMemberCourseMaterialDownloadLinkResponse.parse({
    url: `/api/member/course-material-download?token=${encodeURIComponent(token)}`,
    validUntil: new Date(expiresAt),
  }));
});

router.get("/course-material-download", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const claims = verifyCourseMaterialToken(token);
  if (!claims) { res.status(403).json({ message: "This material link is invalid or expired." }); return; }
  if (await isAccessSuspended("member", claims.userId)) {
    res.status(403).json({ message: "This account is temporarily restricted from course access." }); return;
  }
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, claims.courseId), eq(learningCourses.published, true),
  ));
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, claims.userId), eq(courseEnrollments.courseId, claims.courseId),
  ));
  const [material] = await db.select().from(courseMaterials).where(and(
    eq(courseMaterials.id, claims.materialId), eq(courseMaterials.courseId, claims.courseId),
  ));
  let expectedObjectPath: string;
  try {
    expectedObjectPath = courseMaterialObjectPath(claims.courseId, claims.materialId);
  } catch {
    res.status(403).json({ message: "Course material access is no longer available." }); return;
  }
  if (!course || !enrollment || !material
      || material.objectPath !== expectedObjectPath
      || !await currentDigitalCourseMembership(claims.userId)) {
    res.status(403).json({ message: "Course material access is no longer available." }); return;
  }
  let file: Awaited<ReturnType<typeof learningObjectStorage.getPrivateFile>>;
  try {
    file = await learningObjectStorage.getPrivateFile(material.objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).end(); return; }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const sizeBytes = Number(metadata.size);
  if (metadata.contentType !== "application/pdf" || sizeBytes !== material.sizeBytes
      || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    res.status(404).end(); return;
  }
  const asciiName = material.fileName.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(material.fileName)
    .replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(sizeBytes));
  res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  file.createReadStream()
    .on("error", error => {
      if (res.headersSent) res.destroy(error);
      else res.status(500).end();
    })
    .pipe(res);
});

router.post("/courses/:id/lessons/:lessonId/playback-link", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to play this recording." }); return; }
  if (await isAccessSuspended("member", userId)) {
    throw new BookingError(403, "This account is temporarily restricted from course access. Contact MaydanGo support.");
  }
  const courseId = String(req.params.id);
  const lessonId = String(req.params.lessonId);
  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, courseId), eq(learningCourses.published, true),
  ));
  if (!course) throw new BookingError(404, "This course is not available.");
  if (!await currentDigitalCourseMembership(userId)) {
    throw new BookingError(403, "An eligible membership with digital course access is required to play course recordings.");
  }
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId),
  ));
  if (!enrollment) throw new BookingError(403, "Enroll in this course before playing recordings.");
  const [lesson] = await db.select().from(learningLessons).where(and(
    eq(learningLessons.id, lessonId), eq(learningLessons.courseId, courseId),
  ));
  if (!lesson || !isPrivateCourseRecordingPath(lesson.mediaUrl)) {
    throw new BookingError(404, "This course recording is unavailable.");
  }
  try {
    const file = await learningObjectStorage.getPrivateFile(lesson.mediaUrl);
    const [metadata] = await file.getMetadata();
    if (!Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) < 1) {
      throw new BookingError(404, "This course recording is unavailable.");
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) throw new BookingError(404, "This course recording is unavailable.");
    throw error;
  }
  const { token, expiresAt } = createCoursePlaybackToken({ userId, courseId, lessonId });
  res.setHeader("Cache-Control", "no-store");
  res.json(CreateMemberCoursePlaybackLinkResponse.parse({
    url: `/api/member/course-playback?token=${encodeURIComponent(token)}`,
    validUntil: new Date(expiresAt),
  }));
});

router.get("/course-playback", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const claims = verifyCoursePlaybackToken(token);
  if (!claims) { res.status(403).json({ message: "This playback link is invalid or expired." }); return; }

  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses).where(and(
    eq(learningCourses.id, claims.courseId), eq(learningCourses.published, true),
  ));
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments).where(and(
    eq(courseEnrollments.userId, claims.userId), eq(courseEnrollments.courseId, claims.courseId),
  ));
  const [lesson] = await db.select().from(learningLessons).where(and(
    eq(learningLessons.id, claims.lessonId), eq(learningLessons.courseId, claims.courseId),
  ));
  if (!course || !enrollment || !lesson || !isPrivateCourseRecordingPath(lesson.mediaUrl)
      || !await currentDigitalCourseMembership(claims.userId)) {
    res.status(403).json({ message: "Course recording access is no longer available." }); return;
  }

  const contentType = courseRecordingContentType(lesson.mediaUrl);
  if (!contentType) { res.status(404).end(); return; }
  let file: Awaited<ReturnType<typeof learningObjectStorage.getPrivateFile>>;
  try {
    file = await learningObjectStorage.getPrivateFile(lesson.mediaUrl);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).end(); return; }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size < 1) { res.status(404).end(); return; }

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", "inline");
  let start = 0;
  let end = size - 1;
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.status(416).end();
      return;
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) {
        res.setHeader("Content-Range", `bytes */${size}`);
        res.status(416).end();
        return;
      }
      start = Math.max(0, size - suffixLength);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.status(416).end();
      return;
    }
    end = Math.min(end, size - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  res.setHeader("Content-Length", String(end - start + 1));
  const stream = file.createReadStream({ start, end });
  stream.on("error", error => {
    req.log.error({ err: error }, "Course recording stream failed");
    if (!res.headersSent) res.status(502).end();
    else res.destroy(error);
  });
  stream.pipe(res);
});

router.get("/live-classes", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to view live classes." }); return; }
  const now = new Date();
  const rows = await db.select({
    id: offerings.id,
    title: offerings.title,
    localizedTitle: offerings.localizedTitle,
    localizedDescription: offerings.localizedDescription,
    city: offerings.city,
    facility: offerings.facility,
    partnerName: partners.name,
    startsAt: offerings.startsAt,
    endsAt: offerings.endsAt,
    capacity: offerings.capacity,
    reserved: sql<number>`count(${reservations.id})::int`,
    booked: sql<boolean>`coalesce(bool_or(${reservations.userId} = ${userId} and ${reservations.status} = 'reserved'), false)`,
    joinUrl: offerings.joinUrl,
  }).from(offerings)
    .innerJoin(partners, eq(offerings.partnerId, partners.id))
    .leftJoin(reservations, and(
      eq(reservations.offeringId, offerings.id),
      inArray(reservations.status, ["reserved", "requested"]),
    ))
    .where(and(
      eq(offerings.scope, "live"),
      eq(offerings.active, true),
      eq(offerings.kind, "session"),
      eq(offerings.accessType, "live"),
      isNull(offerings.cancelledAt),
      eq(partners.approved, true),
      gt(offerings.endsAt, now),
      gte(offerings.startsAt, new Date(now.getTime() - joinLeadMs)),
    ))
    .groupBy(offerings.id, partners.id).orderBy(asc(offerings.startsAt));
  const membership = await currentLiveMembership(userId);
  res.json(GetMemberLiveClassesResponse.parse(rows.map(row => ({
    id: row.id,
    title: row.title,
    localizedTitle: row.localizedTitle,
    localizedDescription: row.localizedDescription,
    city: row.city,
    facility: row.facility,
    partnerName: row.partnerName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    remaining: Math.max(0, row.capacity - row.reserved),
    booked: row.booked,
    canJoin: !!membership && row.booked && !!row.joinUrl
      && row.startsAt.getTime() <= now.getTime() + joinLeadMs && row.endsAt > now
      && membership.endsAt >= row.endsAt,
  }))));
});

router.post("/live-classes/:id/join", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to join this class." }); return; }
  const id = String(req.params.id);
  const [row] = await db.select({ offering: offerings, approved: partners.approved }).from(offerings)
    .innerJoin(partners, eq(offerings.partnerId, partners.id))
    .where(and(
      eq(offerings.id, id), eq(offerings.scope, "live"), eq(offerings.accessType, "live"),
      eq(offerings.kind, "session"), eq(offerings.active, true), isNull(offerings.cancelledAt),
    ));
  if (!row || !row.approved) throw new BookingError(404, "This live class is not available.");
  const now = new Date();
  if (row.offering.startsAt.getTime() > now.getTime() + joinLeadMs || row.offering.endsAt <= now) {
    throw new BookingError(409, "The secure join window is not open.");
  }
  const [reservation] = await db.select({ id: reservations.id }).from(reservations).where(and(
    eq(reservations.offeringId, id), eq(reservations.userId, userId), eq(reservations.status, "reserved"),
  ));
  if (!reservation) throw new BookingError(403, "Book this class with an eligible membership before joining.");
  const membership = await currentLiveMembership(userId);
  if (!membership || membership.endsAt < row.offering.endsAt) {
    throw new BookingError(403, "An eligible membership covering this class is required to join.");
  }
  let destination: URL;
  try { destination = new URL(row.offering.joinUrl ?? ""); }
  catch { throw new BookingError(409, "The class join link is not configured."); }
  if (destination.protocol !== "https:" || destination.username || destination.password) {
    throw new BookingError(409, "The class join link is not configured securely.");
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(CreateLiveClassJoinResponse.parse({ url: destination.toString(), validUntil: row.offering.endsAt }));
});

export default router;
