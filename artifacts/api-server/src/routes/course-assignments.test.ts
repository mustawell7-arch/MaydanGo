import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  courseAssignmentProgress, courseAssignments, courseEnrollments, db, instructorCourseAssignments,
  learningCourses, memberships, operators, pool,
} from "@workspace/db";
import instructorRouter from "./instructor";
import learningRouter from "./learning";

const prefix = `course-assignments-test-${randomUUID()}`;
const instructorId = `${prefix}-instructor`;
const unassignedInstructorId = `${prefix}-unassigned`;
const memberId = `${prefix}-member`;
const otherMemberId = `${prefix}-other-member`;
const courseId = randomUUID();
const enrollmentId = randomUUID();
let server: Server | null = null;

const localized = (en: string, ar: string, ku: string) => ({ en, ar, ku });
const rules = {
  quota: 12,
  dailyLimit: 2,
  trialAllowedTypes: ["live"],
  planTerms: {
    description: localized("Test plan", "خطة اختبار", "پلانی تاقیکردنەوە"),
    trialPeriodDays: 0,
    minimumContractMonths: 0,
    renewalPeriodDays: 30,
    cancellationPeriodDays: 0,
    automaticRenewal: false,
    pauseAllowanceDays: 0,
    priceProtectionMonths: 0,
    promotionalPriceIqd: null,
    corporatePriceIqd: null,
    digitalContentAccess: true,
    guestPasses: 0,
    eventAccess: false,
    additionalPaymentAllowed: false,
  },
};

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
app.use("/member", learningRouter);

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      "x-test-user": userId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() as unknown : null;
  return { status: response.status, data };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(learningCourses).where(eq(learningCourses.id, courseId));
  await db.delete(memberships).where(eq(memberships.userId, memberId));
  await db.delete(instructorCourseAssignments).where(eq(instructorCourseAssignments.courseId, courseId));
  await db.delete(operators).where(inArray(operators.userId, [instructorId, unassignedInstructorId]));
  await pool.end();
});

test("localized practice assignments are scoped to assigned instructors and private member progress", async () => {
  const now = new Date();
  await db.insert(operators).values([
    { userId: instructorId, role: "instructor", partnerId: null },
    { userId: unassignedInstructorId, role: "instructor", partnerId: null },
  ]);
  await db.insert(learningCourses).values({
    id: courseId,
    title: "Movement basics",
    localizedTitle: localized("Movement basics", "أساسيات الحركة", "بنەماکانی جووڵە"),
    localizedSummary: localized("A short course.", "دورة قصيرة.", "کۆرسێکی کورت."),
    localizedInstructor: localized("MaydanGo team", "فريق MaydanGo", "تیمی MaydanGo"),
    category: "mobility",
    level: "beginner",
    durationMinutes: 20,
    thumbnailUrl: null,
    published: true,
  });
  await db.insert(courseEnrollments).values({ id: enrollmentId, userId: memberId, courseId });
  await db.insert(memberships).values({
    userId: memberId,
    scope: "live",
    status: "active",
    paymentStatus: "not_required",
    tier: "trial",
    source: "trial",
    billingId: null,
    corporateId: null,
    startsAt: new Date(now.getTime() - 60_000),
    endsAt: new Date(now.getTime() + 86_400_000),
    rules,
  });
  await db.insert(instructorCourseAssignments).values({
    id: randomUUID(),
    userId: instructorId,
    courseId,
    assignedBy: `${prefix}-admin`,
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const collectionPath = `/instructor/courses/${courseId}/assignments`;
  assert.equal((await call(collectionPath, unassignedInstructorId)).status, 403);
  assert.deepEqual((await call(collectionPath, instructorId)).data, []);
  const input = {
    localizedTitle: localized("Practice steady breathing", "تدرّب على التنفس المنتظم", "ڕاهێنان لەسەر هەناسەدانی جێگیر"),
    localizedInstructions: localized(
      "Practice for five minutes at a comfortable pace.",
      "تدرّب لمدة خمس دقائق بإيقاع مريح.",
      "بۆ پێنج خولەک بە خێراییەکی گونجاو ڕاهێنان بکە.",
    ),
  };
  const created = await call(collectionPath, instructorId, "POST", input);
  assert.equal(created.status, 201);
  const assignment = created.data as { id: string; position: number };
  assert.ok(assignment.id);
  assert.equal(assignment.position, 1);

  const coursePath = `/member/courses/${courseId}`;
  const initialCourse = await call(coursePath, memberId);
  assert.equal(initialCourse.status, 200);
  const initialAssignments = (initialCourse.data as {
    assignments: Array<{ id: string; completed: boolean; localizedInstructions: { en: string } }>;
  }).assignments;
  assert.equal(initialAssignments[0]?.completed, false);
  assert.equal(initialAssignments[0]?.localizedInstructions.en, input.localizedInstructions.en);
  assert.equal((await call(
    `/member/courses/${courseId}/assignments/${assignment.id}/progress`,
    otherMemberId,
    "PUT",
    { completed: true },
  )).status, 403);

  const progressPath = `/member/courses/${courseId}/assignments/${assignment.id}/progress`;
  assert.equal((await call(progressPath, memberId, "PUT", { completed: true })).status, 200);
  const completedCourse = await call(coursePath, memberId);
  const completedAssignment = (completedCourse.data as {
    assignments: Array<{ id: string; completed: boolean; completedAt: string | null }>;
  }).assignments[0];
  assert.equal(completedAssignment?.completed, true);
  assert.ok(completedAssignment?.completedAt);

  const edited = await call(`${collectionPath}/${assignment.id}`, unassignedInstructorId, "PUT", input);
  assert.equal(edited.status, 403);
  const updatedInput = {
    ...input,
    localizedTitle: localized("Steady breathing practice", "تدريب التنفس المنتظم", "ڕاهێنانی هەناسەدانی جێگیر"),
  };
  const updated = await call(`${collectionPath}/${assignment.id}`, instructorId, "PUT", updatedInput);
  assert.equal(updated.status, 200);
  assert.equal((updated.data as { localizedTitle: { en: string } }).localizedTitle.en, updatedInput.localizedTitle.en);

  assert.equal((await call(progressPath, memberId, "PUT", { completed: false })).status, 200);
  const reopenedCourse = await call(coursePath, memberId);
  assert.equal((reopenedCourse.data as { assignments: Array<{ completed: boolean }> }).assignments[0]?.completed, false);
  assert.equal((await call(`${collectionPath}/${assignment.id}`, instructorId, "DELETE")).status, 204);
  const afterDelete = await call(coursePath, memberId);
  assert.deepEqual((afterDelete.data as { assignments: unknown[] }).assignments, []);
  assert.equal((await db.select().from(courseAssignmentProgress).where(eq(courseAssignmentProgress.enrollmentId, enrollmentId))).length, 0);
  assert.equal((await db.select().from(courseAssignments).where(eq(courseAssignments.courseId, courseId))).length, 0);
});
