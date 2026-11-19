import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  courseCertificates, courseEnrollments, db, instructorCourseAssignments, instructorOfferingAssignments,
  instructorPortalRequests, learningCourses, learningLessons, lessonProgress, operators, pool, supportTickets,
} from "@workspace/db";
import instructorRouter from "./instructor";
import operationsRouter from "./operations";
import learningRouter from "./learning";

const prefix = `instructor-access-test-${randomUUID()}`;
const adminUserId = `${prefix}-admin`;
const financeUserId = `${prefix}-finance`;
const instructorUserId = `${prefix}-instructor`;
const otherInstructorUserId = `${prefix}-other-instructor`;
const learnerUserId = `${prefix}-learner`;
const courseId = randomUUID();
const enrollmentId = randomUUID();
const lessonIds = [randomUUID(), randomUUID()];
let server: Server | null = null;
const originalGetUserList = clerkClient.users.getUserList.bind(clerkClient.users);
const originalGetUser = clerkClient.users.getUser.bind(clerkClient.users);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, {
    auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ),
  });
  next();
});
app.use("/instructor", instructorRouter);
app.use("/operations", operationsRouter);
app.use("/member", learningRouter);

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as unknown };
}

const localized = (en: string, ar: string, ku: string) => ({ en, ar, ku });

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(instructorOfferingAssignments).where(
    // This test never assigns offerings; deleting by user still protects cleanup if a failure occurs mid-test.
    eq(instructorOfferingAssignments.userId, instructorUserId),
  );
  await db.delete(instructorCourseAssignments).where(
    eq(instructorCourseAssignments.userId, instructorUserId),
  );
  await db.delete(instructorPortalRequests).where(
    eq(instructorPortalRequests.userId, instructorUserId),
  );
  await db.delete(supportTickets).where(
    inArray(supportTickets.userId, [instructorUserId, otherInstructorUserId]),
  );
  await db.delete(learningCourses).where(
    eq(learningCourses.id, courseId),
  );
  await db.delete(operators).where(
    inArray(operators.userId, [adminUserId, financeUserId, instructorUserId, otherInstructorUserId]),
  );
  clerkClient.users.getUserList = originalGetUserList;
  clerkClient.users.getUser = originalGetUser;
  await pool.end();
});

test("instructor access is requested, reviewed by admin, and limited to assigned courses", async () => {
  await db.insert(operators).values([
    { userId: adminUserId, role: "content_admin", partnerId: null },
    { userId: financeUserId, role: "finance", partnerId: null },
  ]);
  await db.insert(learningCourses).values({
    id: courseId,
    title: "Movement basics",
    localizedTitle: localized("Movement basics", "أساسيات الحركة", "بنەماکانی جووڵە"),
    localizedSummary: localized("A short course.", "دورة قصيرة.", "کۆرسێکی کورت."),
    localizedInstructor: localized("MaydanGo team", "فريق MaydanGo", "تیمی MaydanGo"),
    category: "mobility",
    level: "beginner",
    durationMinutes: 30,
    thumbnailUrl: null,
    published: true,
  });
  await db.insert(learningLessons).values(lessonIds.map((id, index) => ({
    id,
    courseId,
    position: index + 1,
    localizedTitle: localized(`Lesson ${index + 1}`, `الدرس ${index + 1}`, `وانە ${index + 1}`),
    localizedContent: localized("Lesson content", "محتوى الدرس", "ناوەڕۆکی وانە"),
    durationMinutes: 10,
    mediaUrl: null,
  })));
  await db.insert(courseEnrollments).values({
    id: enrollmentId,
    userId: learnerUserId,
    courseId,
  });
  await db.insert(lessonProgress).values({
    id: randomUUID(),
    enrollmentId,
    lessonId: lessonIds[0],
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const initial = await call("/instructor/portal", instructorUserId);
  assert.equal(initial.status, 200);
  assert.equal((initial.data as { accessStatus: string }).accessStatus, "not_requested");
  assert.equal((await call("/instructor/support/tickets", instructorUserId)).status, 403);

  const request = await call("/instructor/access-request", instructorUserId, "POST", {
    message: "I teach mobility and beginner strength classes.",
  });
  assert.equal(request.status, 201);
  assert.equal((request.data as { status: string }).status, "pending");
  assert.equal((await call("/instructor/portal", instructorUserId)).status, 200);

  assert.equal((await call("/operations/instructor-access-requests", financeUserId)).status, 403);
  assert.equal((await call("/operations/instructor-access-requests", instructorUserId)).status, 403);
  const queue = await call("/operations/instructor-access-requests", adminUserId);
  assert.equal(queue.status, 200);
  assert.ok((queue.data as { requests: Array<{ userId: string }> }).requests.some(row => row.userId === instructorUserId));

  const deniedDecision = await call(
    `/operations/instructor-access-requests/${(request.data as { id: string }).id}/decision`,
    instructorUserId,
    "POST",
    { decision: "approve", courseIds: [courseId], offeringIds: [] },
  );
  assert.equal(deniedDecision.status, 403);

  const decision = await call(
    `/operations/instructor-access-requests/${(request.data as { id: string }).id}/decision`,
    adminUserId,
    "POST",
    { decision: "approve", courseIds: [courseId], offeringIds: [] },
  );
  assert.equal(decision.status, 200);
  assert.equal((decision.data as { status: string; courseCount: number }).status, "approved");
  assert.equal((decision.data as { courseCount: number }).courseCount, 1);

  const portal = await call("/instructor/portal", instructorUserId);
  assert.equal(portal.status, 200);
  const result = portal.data as {
    accessStatus: string;
    courses: Array<{ id: string; published: boolean }>;
    upcomingSessions: unknown[];
  };
  assert.equal(result.accessStatus, "approved");
  assert.deepEqual(result.courses.map(course => course.id), [courseId]);
  assert.equal(result.courses[0].published, true);
  assert.deepEqual(result.upcomingSessions, []);
  assert.equal((await call("/operations", instructorUserId)).status, 403);

  await db.insert(operators).values({ userId: otherInstructorUserId, role: "instructor", partnerId: null });
  clerkClient.users.getUserList = (async (...args: Parameters<typeof originalGetUserList>) => {
    const userIds = (Array.isArray(args[0]?.userId) ? args[0]?.userId : []) as string[];
    return {
      data: userIds.map(id => ({ id, firstName: "Amira", lastName: "Member" })),
      totalCount: userIds.length,
    } as Awaited<ReturnType<typeof originalGetUserList>>;
  }) as typeof clerkClient.users.getUserList;
  clerkClient.users.getUser = (async userId => ({
    id: userId,
    firstName: "Amira",
    lastName: "Member",
  })) as typeof clerkClient.users.getUser;
  const candidatesPath = `/instructor/courses/${courseId}/certificate-candidates`;
  assert.equal((await call(candidatesPath, otherInstructorUserId)).status, 403);
  const initiallyEligible = await call(candidatesPath, instructorUserId);
  assert.equal(initiallyEligible.status, 200);
  assert.deepEqual(initiallyEligible.data, []);
  const certificatePath = `/instructor/courses/${courseId}/enrollments/${enrollmentId}/certificate`;
  assert.equal((await call(certificatePath, instructorUserId, "POST")).status, 409);
  assert.equal((await call(certificatePath, otherInstructorUserId, "POST")).status, 403);

  await db.insert(lessonProgress).values({
    id: randomUUID(),
    enrollmentId,
    lessonId: lessonIds[1],
  });
  const eligible = await call(candidatesPath, instructorUserId);
  assert.equal(eligible.status, 200);
  const eligibleRows = eligible.data as Array<Record<string, unknown>>;
  assert.equal(eligibleRows.length, 1);
  assert.equal(eligibleRows[0].learnerName, "Amira Member");
  assert.equal(eligibleRows[0].enrollmentId, enrollmentId);
  assert.equal("email" in eligibleRows[0], false);
  const issued = await call(certificatePath, instructorUserId, "POST");
  assert.equal(issued.status, 200);
  const certificate = issued.data as { id: string; issuedAt: string };
  assert.ok(certificate.id);
  const repeatedIssue = await call(certificatePath, instructorUserId, "POST");
  assert.deepEqual(repeatedIssue.data, certificate);
  const memberCertificate = await call(`/member/courses/${courseId}/certificate`, learnerUserId);
  assert.equal(memberCertificate.status, 200);
  assert.equal((memberCertificate.data as { learnerName: string }).learnerName, "Amira Member");
  assert.equal((await call(`/member/courses/${courseId}/certificate`, otherInstructorUserId)).status, 404);
  assert.equal((await db.select().from(courseCertificates).where(eq(courseCertificates.enrollmentId, enrollmentId))).length, 1);

  const support = await call("/instructor/support/tickets", instructorUserId, "POST", {
    subject: "Course schedule question",
    message: "Could you confirm the planned class schedule?",
    language: "en",
  });
  assert.equal(support.status, 201);
  const supportData = support.data as { id: string; subject: string; category: string; messages: Array<{ message: string }> };
  assert.match(supportData.subject, /^Instructor portal:/);
  assert.equal(supportData.category, "other");
  assert.equal(supportData.messages.length, 1);
  assert.equal((await call(`/instructor/support/tickets/${supportData.id}`, otherInstructorUserId)).status, 404);
  const reply = await call(`/instructor/support/tickets/${supportData.id}/replies`, instructorUserId, "POST", {
    message: "Thank you for the update.",
    language: "en",
  });
  assert.equal(reply.status, 201);
  assert.equal((reply.data as { messages: unknown[] }).messages.length, 2);
});
