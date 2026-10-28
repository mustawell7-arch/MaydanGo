import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  db, courseEnrollments, learningCourses, learningLessons, lessonProgress,
  memberships, offerings, partners, reservations,
} from "@workspace/db";
import {
  CreateLiveClassJoinResponse, EnrollMemberCourseResponse, GetMemberCourseResponse,
  GetMemberCoursesResponse, GetMemberLiveClassesResponse, UpdateCourseProgressBody,
  UpdateCourseProgressResponse,
} from "@workspace/api-zod";
import { BookingError } from "../lib/reservations";

const router = Router();
const joinLeadMs = 15 * 60 * 1000;

async function currentLiveMembership(userId: string) {
  const [membership] = await db.select().from(memberships).where(
    and(eq(memberships.userId, userId), eq(memberships.scope, "live")),
  );
  const now = new Date();
  if (!membership || !["active", "trial"].includes(membership.status)
      || membership.startsAt > now || membership.endsAt <= now) return null;
  // Match existing booking policy. Preview memberships and unpaid activation never grant content access.
  if (!((["trial", "corporate"].includes(membership.source)) && membership.paymentStatus === "not_required")) return null;
  if (membership.source === "trial" && !membership.rules.trialAllowedTypes?.includes("live")) return null;
  if (membership.source === "corporate" &&
      (!membership.rules.corporateId || membership.corporateId !== membership.rules.corporateId)) return null;
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
    currentLiveMembership(userId),
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
      mediaUrl: accessState === "ready" ? lesson.mediaUrl : null,
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
  if (!await currentLiveMembership(userId)) {
    throw new BookingError(403, "An eligible live membership is required to enroll in courses.");
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
  const parsed = UpdateCourseProgressBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a valid lesson and completion state." }); return; }
  const courseId = String(req.params.id);
  if (!await currentLiveMembership(userId)) {
    throw new BookingError(403, "An eligible live membership is required to access course lessons.");
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
