import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import express from "express";
import { db, learningCourses, operators, partners, pool } from "@workspace/db";
import operationsRouter from "./operations";

const prefix = `learning-admin-test-${randomUUID()}`;
const adminUserId = `${prefix}-admin`;
const financeUserId = `${prefix}-finance`;
const partnerUserId = `${prefix}-partner`;
const partnerId = `${prefix}-partner-record`;
let server: Server | null = null;
let courseIds: string[] = [];

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
app.use("/operations", operationsRouter);

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json() as unknown;
  return { status: response.status, data };
}

const localized = (en: string, ar: string, ku: string) => ({ en, ar, ku });
const initialLesson = {
  position: 1,
  localizedTitle: localized("Breath and movement", "التنفس والحركة", "هەناسەدان و جووڵە"),
  localizedContent: localized("A short introduction.", "مقدمة قصيرة.", "پێشەکییەکی کورت."),
  durationMinutes: 12,
  mediaUrl: "/objects/course-recordings/lesson-1.mp4",
};
const courseMetadata = (published: boolean) => ({
  localizedTitle: localized("Movement basics", "أساسيات الحركة", "بنەماکانی جووڵە"),
  localizedSummary: localized("A beginner course.", "دورة للمبتدئين.", "کۆرسێک بۆ دەستپێکەران."),
  localizedInstructor: localized("MaydanGo team", "فريق ميدان", "تیمی مەیدان"),
  category: "mobility",
  level: "beginner",
  durationMinutes: 30,
  thumbnailUrl: null,
  published,
});

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (courseIds.length) await db.delete(learningCourses).where(
    inArray(learningCourses.id, courseIds),
  );
  await db.delete(operators).where(
    inArray(operators.userId, [adminUserId, financeUserId, partnerUserId]),
  );
  await db.delete(partners).where(
    inArray(partners.id, [partnerId]),
  );
  await pool.end();
});

test("only administrators can list, edit, publish, or add lessons to courses", async () => {
  await db.insert(partners).values({
    id: partnerId,
    name: prefix,
    groupId: prefix,
    ownerUserId: partnerUserId,
    approved: true,
  });
  await db.insert(operators).values([
    { userId: adminUserId, role: "content_admin", partnerId: null },
    { userId: financeUserId, role: "finance", partnerId: null },
    { userId: partnerUserId, role: "partner", partnerId },
  ]);

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/courses", financeUserId)).status, 403);
  assert.equal((await call("/operations/courses", partnerUserId)).status, 403);
  const publicRecording = await call("/operations/courses", adminUserId, "POST", {
    ...courseMetadata(false),
    lessons: [{ ...initialLesson, mediaUrl: "https://example.com/course/lesson-1.mp4" }],
  });
  assert.equal(publicRecording.status, 400);

  const created = await call("/operations/courses", adminUserId, "POST", {
    ...courseMetadata(false),
    lessons: [initialLesson],
  });
  assert.equal(created.status, 201);
  const course = created.data as { id: string; published: boolean; lessonCount: number };
  courseIds = [course.id];
  assert.equal(course.published, false);
  assert.equal(course.lessonCount, 1);

  const listing = await call("/operations/courses", adminUserId);
  assert.equal(listing.status, 200);
  const courses = (listing.data as { courses: Array<{ id: string; lessonCount: number }> }).courses;
  assert.equal(courses.find(item => item.id === course.id)?.lessonCount, 1);

  assert.equal((await call(`/operations/courses/${course.id}`, financeUserId, "PUT", courseMetadata(true))).status, 403);
  assert.equal((await call(`/operations/courses/${course.id}/lessons`, partnerUserId, "POST", {
    ...initialLesson,
    position: 2,
  })).status, 403);

  const published = await call(`/operations/courses/${course.id}`, adminUserId, "PUT", courseMetadata(true));
  assert.equal(published.status, 200);
  assert.equal((published.data as { published: boolean }).published, true);

  const addedLesson = await call(`/operations/courses/${course.id}/lessons`, adminUserId, "POST", {
    ...initialLesson,
    position: 2,
    localizedTitle: localized("Second lesson", "الدرس الثاني", "وانەی دووەم"),
  });
  assert.equal(addedLesson.status, 201);

  const unpublished = await call(`/operations/courses/${course.id}`, adminUserId, "PUT", courseMetadata(false));
  assert.equal(unpublished.status, 200);
  assert.equal((unpublished.data as { published: boolean }).published, false);
  const refreshedListing = await call("/operations/courses", adminUserId);
  const refreshedCourse = (refreshedListing.data as {
    courses: Array<{ id: string; published: boolean; lessonCount: number }>;
  }).courses.find(item => item.id === course.id);
  assert.deepEqual(
    { published: refreshedCourse?.published, lessonCount: refreshedCourse?.lessonCount },
    { published: false, lessonCount: 2 },
  );
});
