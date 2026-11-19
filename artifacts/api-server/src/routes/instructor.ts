import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import {
  courseAssignments, courseCertificates, courseEnrollments, db, instructorCourseAssignments,
  instructorOfferingAssignments, instructorPortalRequests, learningCourses, learningLessons,
  lessonProgress, offerings, operators,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  GetInstructorCourseCertificateCandidatesResponse, GetInstructorPortalResponse, IssueInstructorCourseCertificateResponse,
  CreateInstructorCourseAssignmentBody, CreateInstructorCourseAssignmentParams,
  CreateInstructorCourseAssignmentResponse, DeleteInstructorCourseAssignmentParams,
  GetInstructorCourseAssignmentsParams, GetInstructorCourseAssignmentsResponse,
  SubmitInstructorAccessRequestBody, SubmitInstructorAccessRequestResponse,
  UpdateInstructorCourseAssignmentBody, UpdateInstructorCourseAssignmentParams,
  UpdateInstructorCourseAssignmentResponse,
} from "@workspace/api-zod";
import { instructorSupportRouter } from "./instructor-support";
import instructorContentRouter from "./instructor-content";

const router = Router();
router.use("/support", instructorSupportRouter);

router.use((req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }
  next();
});
router.use("/content-drafts", instructorContentRouter);

router.get("/portal", async (req, res) => {
  const userId = getAuth(req).userId!;
  const [[request], [operator]] = await Promise.all([
    db.select().from(instructorPortalRequests).where(eq(instructorPortalRequests.userId, userId)).limit(1),
    db.select().from(operators).where(eq(operators.userId, userId)).limit(1),
  ]);

  const isApprovedInstructor = operator?.role === "instructor";
  if ((request?.status === "approved") !== isApprovedInstructor) {
    if (request?.status === "approved" || isApprovedInstructor) {
      res.status(409).json({ message: "Instructor access records are inconsistent. Contact MaydanGo support." });
      return;
    }
  }

  if (!isApprovedInstructor) {
    res.json(GetInstructorPortalResponse.parse({
      accessStatus: request?.status ?? "not_requested",
      request: request ? {
        id: request.id,
        status: request.status,
        message: request.message,
        decisionReason: request.decisionReason,
        submittedAt: request.submittedAt,
      } : null,
      courses: [],
      upcomingSessions: [],
    }));
    return;
  }

  const [courseAssignments, offeringAssignments] = await Promise.all([
    db.select({ courseId: instructorCourseAssignments.courseId })
      .from(instructorCourseAssignments)
      .where(eq(instructorCourseAssignments.userId, userId)),
    db.select({ offeringId: instructorOfferingAssignments.offeringId })
      .from(instructorOfferingAssignments)
      .where(eq(instructorOfferingAssignments.userId, userId)),
  ]);
  const [courses, upcomingSessions] = await Promise.all([
    courseAssignments.length
      ? db.select({
        id: learningCourses.id,
        title: learningCourses.title,
        localizedTitle: learningCourses.localizedTitle,
        localizedSummary: learningCourses.localizedSummary,
        localizedInstructor: learningCourses.localizedInstructor,
        category: learningCourses.category,
        level: learningCourses.level,
        durationMinutes: learningCourses.durationMinutes,
        published: learningCourses.published,
      }).from(learningCourses)
        .where(inArray(learningCourses.id, courseAssignments.map(row => row.courseId)))
      : Promise.resolve([]),
    offeringAssignments.length
      ? db.select({
        id: offerings.id,
        kind: offerings.kind,
        title: offerings.title,
        localizedTitle: offerings.localizedTitle,
        city: offerings.city,
        facility: offerings.facility,
        startsAt: offerings.startsAt,
        endsAt: offerings.endsAt,
      }).from(offerings)
        .where(and(
          inArray(offerings.id, offeringAssignments.map(row => row.offeringId)),
          eq(offerings.approvalStatus, "published"),
          eq(offerings.active, true),
          isNull(offerings.cancelledAt),
          eq(offerings.additionalPayment, false),
          gt(offerings.startsAt, new Date()),
        ))
        .orderBy(asc(offerings.startsAt))
      : Promise.resolve([]),
  ]);

  res.json(GetInstructorPortalResponse.parse({
    accessStatus: "approved",
    request: request ? {
      id: request.id,
      status: request.status,
      message: request.message,
      decisionReason: request.decisionReason,
      submittedAt: request.submittedAt,
    } : null,
    courses,
    upcomingSessions,
  }));
});

async function assignedInstructor(userId: string, courseId: string) {
  const [[operator], [assignment]] = await Promise.all([
    db.select({ role: operators.role }).from(operators).where(eq(operators.userId, userId)).limit(1),
    db.select({ id: instructorCourseAssignments.id }).from(instructorCourseAssignments).where(and(
      eq(instructorCourseAssignments.userId, userId),
      eq(instructorCourseAssignments.courseId, courseId),
    )).limit(1),
  ]);
  return operator?.role === "instructor" && !!assignment;
}

router.get("/courses/:courseId/certificate-candidates", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const courseId = String(req.params.courseId);
  if (!await assignedInstructor(userId, courseId)) {
    res.status(403).json({ message: "You can review certificates only for courses assigned to you." });
    return;
  }

  const [course] = await db.select({ id: learningCourses.id }).from(learningCourses)
    .where(eq(learningCourses.id, courseId)).limit(1);
  if (!course) {
    res.status(404).json({ message: "This course is not available." });
    return;
  }
  const [lessonTotal] = await db.select({ value: count() }).from(learningLessons)
    .where(eq(learningLessons.courseId, courseId));
  if (!lessonTotal || lessonTotal.value === 0) {
    res.json(GetInstructorCourseCertificateCandidatesResponse.parse([]));
    return;
  }

  const completed = await db.select({
    enrollmentId: courseEnrollments.id,
    userId: courseEnrollments.userId,
    completedAt: sql<Date | null>`coalesce(${courseCertificates.completedAt}, max(${lessonProgress.completedAt}))`,
    certificateId: courseCertificates.id,
    certificateIssuedAt: courseCertificates.issuedAt,
  }).from(courseEnrollments)
    .innerJoin(learningLessons, eq(learningLessons.courseId, courseId))
    .leftJoin(lessonProgress, and(
      eq(lessonProgress.enrollmentId, courseEnrollments.id),
      eq(lessonProgress.lessonId, learningLessons.id),
    ))
    .leftJoin(courseCertificates, eq(courseCertificates.enrollmentId, courseEnrollments.id))
    .where(eq(courseEnrollments.courseId, courseId))
    .groupBy(
      courseEnrollments.id,
      courseEnrollments.userId,
      courseCertificates.id,
      courseCertificates.completedAt,
      courseCertificates.issuedAt,
    )
    .having(sql`count(${lessonProgress.id}) = ${lessonTotal.value} or ${courseCertificates.id} is not null`)
    .orderBy(asc(max(lessonProgress.completedAt)));
  if (!completed.length) {
    res.json(GetInstructorCourseCertificateCandidatesResponse.parse([]));
    return;
  }

  const userIds = [...new Set(completed.map(row => row.userId))];
  const chunks = Array.from({ length: Math.ceil(userIds.length / 100) }, (_, index) =>
    userIds.slice(index * 100, (index + 1) * 100));
  const pages = await Promise.all(chunks.map(ids =>
    clerkClient.users.getUserList({ userId: ids, limit: ids.length })));
  const names = new Map<string, string>();
  for (const page of pages) {
    for (const learner of page.data) {
      names.set(learner.id, [learner.firstName, learner.lastName].filter(Boolean).join(" ").trim() || "Member");
    }
  }
  res.json(GetInstructorCourseCertificateCandidatesResponse.parse(completed.map(row => ({
    enrollmentId: row.enrollmentId,
    learnerName: names.get(row.userId) ?? "Member",
    completedAt: row.completedAt,
    certificateId: row.certificateId,
    certificateIssuedAt: row.certificateIssuedAt,
  }))));
});

router.post("/courses/:courseId/enrollments/:enrollmentId/certificate", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const courseId = String(req.params.courseId);
  const enrollmentId = String(req.params.enrollmentId);
  if (!await assignedInstructor(userId, courseId)) {
    res.status(403).json({ message: "You can issue certificates only for courses assigned to you." });
    return;
  }
  const [enrollment] = await db.select({ id: courseEnrollments.id })
    .from(courseEnrollments).where(and(
      eq(courseEnrollments.id, enrollmentId),
      eq(courseEnrollments.courseId, courseId),
    )).limit(1);
  if (!enrollment) {
    res.status(404).json({ message: "This learner is not enrolled in the assigned course." });
    return;
  }
  const [existingCertificate] = await db.select({
    id: courseCertificates.id,
    issuedAt: courseCertificates.issuedAt,
  }).from(courseCertificates).where(eq(courseCertificates.enrollmentId, enrollmentId)).limit(1);
  if (existingCertificate) {
    res.json(IssueInstructorCourseCertificateResponse.parse(existingCertificate));
    return;
  }
  const [lessonTotal] = await db.select({ value: count() }).from(learningLessons)
    .where(eq(learningLessons.courseId, courseId));
  const [completed] = await db.select({
    value: count(),
    completedAt: max(lessonProgress.completedAt),
  }).from(lessonProgress)
    .innerJoin(learningLessons, eq(lessonProgress.lessonId, learningLessons.id))
    .where(and(
      eq(lessonProgress.enrollmentId, enrollmentId),
      eq(learningLessons.courseId, courseId),
    ));
  if (!lessonTotal || lessonTotal.value === 0 || completed.value !== lessonTotal.value || !completed.completedAt) {
    res.status(409).json({ message: "The learner must complete every lesson before a certificate can be approved." });
    return;
  }

  await db.insert(courseCertificates).values({
    id: randomUUID(),
    enrollmentId,
    instructorUserId: userId,
    completedAt: completed.completedAt,
  }).onConflictDoNothing({ target: courseCertificates.enrollmentId });
  const [certificate] = await db.select({
    id: courseCertificates.id,
    issuedAt: courseCertificates.issuedAt,
  }).from(courseCertificates).where(eq(courseCertificates.enrollmentId, enrollmentId)).limit(1);
  res.json(IssueInstructorCourseCertificateResponse.parse({ id: certificate.id, issuedAt: certificate.issuedAt }));
});

router.get("/courses/:courseId/assignments", async (req, res): Promise<void> => {
  const parsed = GetInstructorCourseAssignmentsParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ message: "Choose a valid course." }); return; }
  const userId = getAuth(req).userId!;
  const { courseId } = parsed.data;
  if (!await assignedInstructor(userId, courseId)) {
    res.status(403).json({ message: "You can manage assignments only for courses assigned to you." });
    return;
  }
  const assignments = await db.select().from(courseAssignments)
    .where(eq(courseAssignments.courseId, courseId))
    .orderBy(asc(courseAssignments.position), asc(courseAssignments.createdAt));
  res.json(GetInstructorCourseAssignmentsResponse.parse(assignments));
});

router.post("/courses/:courseId/assignments", async (req, res): Promise<void> => {
  const params = CreateInstructorCourseAssignmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid course." }); return; }
  const body = CreateInstructorCourseAssignmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Provide a title and instructions in English, Arabic, and Sorani Kurdish." });
    return;
  }
  const userId = getAuth(req).userId!;
  const { courseId } = params.data;
  if (!await assignedInstructor(userId, courseId)) {
    res.status(403).json({ message: "You can manage assignments only for courses assigned to you." });
    return;
  }
  const [latest] = await db.select({ position: courseAssignments.position }).from(courseAssignments)
    .where(eq(courseAssignments.courseId, courseId))
    .orderBy(desc(courseAssignments.position))
    .limit(1);
  const [assignment] = await db.insert(courseAssignments).values({
    id: randomUUID(),
    courseId,
    position: (latest?.position ?? 0) + 1,
    localizedTitle: body.data.localizedTitle,
    localizedInstructions: body.data.localizedInstructions,
    createdBy: userId,
  }).returning();
  res.status(201).json(CreateInstructorCourseAssignmentResponse.parse(assignment));
});

router.put("/courses/:courseId/assignments/:assignmentId", async (req, res): Promise<void> => {
  const params = UpdateInstructorCourseAssignmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid course assignment." }); return; }
  const body = UpdateInstructorCourseAssignmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Provide a title and instructions in English, Arabic, and Sorani Kurdish." });
    return;
  }
  const userId = getAuth(req).userId!;
  const { courseId, assignmentId } = params.data;
  if (!await assignedInstructor(userId, courseId)) {
    res.status(403).json({ message: "You can manage assignments only for courses assigned to you." });
    return;
  }
  const [assignment] = await db.update(courseAssignments).set({
    localizedTitle: body.data.localizedTitle,
    localizedInstructions: body.data.localizedInstructions,
    updatedAt: new Date(),
  }).where(and(
    eq(courseAssignments.id, assignmentId),
    eq(courseAssignments.courseId, courseId),
  )).returning();
  if (!assignment) { res.status(404).json({ message: "This assignment is not part of the course." }); return; }
  res.json(UpdateInstructorCourseAssignmentResponse.parse(assignment));
});

router.delete("/courses/:courseId/assignments/:assignmentId", async (req, res): Promise<void> => {
  const params = DeleteInstructorCourseAssignmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid course assignment." }); return; }
  const userId = getAuth(req).userId!;
  const { courseId, assignmentId } = params.data;
  if (!await assignedInstructor(userId, courseId)) {
    res.status(403).json({ message: "You can manage assignments only for courses assigned to you." });
    return;
  }
  const [removed] = await db.delete(courseAssignments).where(and(
    eq(courseAssignments.id, assignmentId),
    eq(courseAssignments.courseId, courseId),
  )).returning({ id: courseAssignments.id });
  if (!removed) { res.status(404).json({ message: "This assignment is not part of the course." }); return; }
  res.status(204).end();
});

router.post("/access-request", async (req, res) => {
  const parsed = SubmitInstructorAccessRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Write a short message about your instructor access request." });
    return;
  }
  const userId = getAuth(req).userId!;
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (operator && operator.role !== "instructor") {
    res.status(409).json({ message: "This account already has a different staff role. Contact MaydanGo support." });
    return;
  }
  if (operator?.role === "instructor") {
    res.status(409).json({ message: "Instructor portal access is already active." });
    return;
  }

  const [existing] = await db.select().from(instructorPortalRequests)
    .where(eq(instructorPortalRequests.userId, userId)).limit(1);
  if (existing?.status === "pending") {
    res.status(409).json({ message: "Your instructor access request is already waiting for review." });
    return;
  }
  if (existing?.status === "approved") {
    res.status(409).json({ message: "Instructor portal access is already active." });
    return;
  }

  const [saved] = existing
    ? await db.update(instructorPortalRequests).set({
      message: parsed.data.message,
      status: "pending",
      decisionReason: null,
      decidedAt: null,
      decidedBy: null,
      submittedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(instructorPortalRequests.id, existing.id)).returning()
    : await db.insert(instructorPortalRequests).values({
      id: randomUUID(),
      userId,
      message: parsed.data.message,
    }).returning();
  res.status(201).json(SubmitInstructorAccessRequestResponse.parse(saved));
});

export default router;
