import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  db, courseEnrollments, learningCourses, learningLessons, lessonProgress,
  memberships, offerings, partners, reservations,
} from "@workspace/db";
import {
  CreateMemberCoursePlaybackLinkResponse,
  CreateLiveClassJoinResponse, EnrollMemberCourseResponse, GetMemberCourseResponse,
  GetMemberCoursesResponse, GetMemberLiveClassesResponse, UpdateCourseProgressBody,
  UpdateCourseProgressResponse,
} from "@workspace/api-zod";
import { BookingError, membershipCanAccess } from "../lib/reservations";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { courseRecordingContentType, isPrivateCourseRecordingPath } from "../lib/course-recordings";
import { createCoursePlaybackToken, verifyCoursePlaybackToken } from "../lib/course-playback-token";
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

function courseSummary(course: typeof learningCourses.$inferSelect, enrolled: boolean, completedLessons: number, lessonCount: number) {
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
  };
}

async function getCourseDetail(userId: string, id: string) {
  const [course] = await db.select().from(learningCourses).where(
    and(eq(learningCourses.id, id), eq(learningCourses.published, true)),
  );
  if (!course) throw new BookingError(404, "This course is not available.");

  const [membership, enrollment] = await Promise.all([
    currentDigitalCourseMembership(userId),
    db.select().from(courseEnrollments).where(and(
      eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, id),
    )),
  ]);
  const enrolled = enrollment[0];
  const accessState = !membership ? "membership_required" : !enrolled ? "enrollment_required" : "ready";
  const lessons = await db.select().from(learningLessons)
    .where(eq(learningLessons.courseId, id)).orderBy(asc(learningLessons.position));
  const completedRows = enrolled
    ? await db.select({ lessonId: lessonProgress.lessonId }).from(lessonProgress)
      .where(eq(lessonProgress.enrollmentId, enrolled.id))
    : [];
  const completed = new Set(completedRows.map(row => row.lessonId));
  const summary = courseSummary(course, !!enrolled, completed.size, lessons.length);
  return {
    ...summary,
    accessState,
    lessons: lessons.map(lesson => ({
      id: lesson.id,
      position: lesson.position,
      localizedTitle: lesson.localizedTitle,
      localizedContent: accessState === "ready" ? lesson.localizedContent : null,
      durationMinutes: lesson.durationMinutes,
      mediaUrl: null,
      hasRecording: accessState === "ready" && isPrivateCourseRecordingPath(lesson.mediaUrl),
      completed: completed.has(lesson.id),
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
  res.json(GetMemberCoursesResponse.parse(published.map(course => {
    const enrollment = enrollmentByCourse.get(course.id);
    return courseSummary(course, !!enrollment, enrollment ? progressByEnrollment.get(enrollment.id) ?? 0 : 0, countByCourse.get(course.id) ?? 0);
  })));
});

router.get("/courses/:id", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to view this course." }); return; }
  res.json(GetMemberCourseResponse.parse(await getCourseDetail(userId, String(req.params.id))));
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
