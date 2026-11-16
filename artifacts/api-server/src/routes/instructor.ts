import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, instructorCourseAssignments, instructorOfferingAssignments, instructorPortalRequests, learningCourses, offerings, operators } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { GetInstructorPortalResponse, SubmitInstructorAccessRequestBody, SubmitInstructorAccessRequestResponse } from "@workspace/api-zod";
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
