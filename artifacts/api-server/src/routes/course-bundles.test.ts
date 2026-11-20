import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, learningCourseBundles, learningCourseBundleItems, learningCourses, operators, pool,
} from "@workspace/db";
import learningRouter from "./learning";
import operationsRouter from "./operations";
import publicLearningRouter from "./public-learning";

const prefix = `course-bundle-test-${randomUUID()}`;
const adminId = `${prefix}-content-admin`;
const financeId = `${prefix}-finance`;
const memberId = `${prefix}-member`;
const courseIds = [randomUUID(), randomUUID(), randomUUID()];
const bundleIds: string[] = [];
let server: Server | null = null;

const localized = (en: string, ar: string, ku: string) => ({ en, ar, ku });
const bundleInput = (selectedCourseIds: string[], published: boolean) => ({
  localizedTitle: localized("Movement foundations", "أساسيات الحركة", "بنەماکانی جووڵە"),
  localizedSummary: localized(
    "A considered path through related movement courses.",
    "مسار متدرج عبر دورات مترابطة في الحركة.",
    "ڕێڕەوێکی ڕێکخراو لە نێوان کۆرسە پەیوەندیدارەکانی جووڵە.",
  ),
  courseIds: selectedCourseIds,
  published,
});

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
app.use("/member", learningRouter);
app.use("/public", publicLearningRouter);

async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as unknown };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (bundleIds.length) {
    await db.delete(learningCourseBundles).where(inArray(learningCourseBundles.id, bundleIds));
  }
  await db.delete(learningCourses).where(inArray(learningCourses.id, courseIds));
  await db.delete(operators).where(inArray(operators.userId, [adminId, financeId]));
  await pool.end();
});

test("localized course bundles are managed by content admins and never grant access", async () => {
  await db.insert(operators).values([
    { userId: adminId, role: "content_admin", partnerId: null },
    { userId: financeId, role: "finance", partnerId: null },
  ]);
  await db.insert(learningCourses).values(courseIds.map((id, index) => ({
    id,
    title: `Bundle course ${index + 1}`,
    localizedTitle: localized(`Bundle course ${index + 1}`, `دورة ${index + 1}`, `کۆرسی ${index + 1}`),
    localizedSummary: localized("Course summary.", "ملخص الدورة.", "پوختەی کۆرس."),
    localizedInstructor: localized("MaydanGo team", "فريق MaydanGo", "تیمی MaydanGo"),
    category: "movement",
    level: "beginner",
    durationMinutes: 20,
    thumbnailUrl: null,
    published: index !== 2,
  })));

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/member/course-bundles")).status, 401);
  assert.equal((await call("/operations/course-bundles", financeId)).status, 403);

  const invalid = await call(
    "/operations/course-bundles",
    adminId,
    "POST",
    bundleInput([courseIds[0], courseIds[0]], false),
  );
  assert.equal(invalid.status, 400, "a course may appear only once in a collection");

  const draft = await call(
    "/operations/course-bundles",
    adminId,
    "POST",
    bundleInput([courseIds[0], courseIds[1]], false),
  );
  assert.equal(draft.status, 201);
  const created = draft.data as { id: string; courseIds: string[]; published: boolean; courseCount: number };
  bundleIds.push(created.id);
  assert.equal(created.published, false);
  assert.equal(created.courseCount, 2);
  assert.deepEqual(created.courseIds, [courseIds[0], courseIds[1]]);
  assert.deepEqual((await call("/member/course-bundles", memberId)).data, []);
  assert.deepEqual((await call("/public/course-bundles")).data, []);

  const cannotPublishDraftCourse = await call(
    `/operations/course-bundles/${created.id}`,
    adminId,
    "PUT",
    bundleInput([courseIds[0], courseIds[2]], true),
  );
  assert.equal(cannotPublishDraftCourse.status, 409);

  const published = await call(
    `/operations/course-bundles/${created.id}`,
    adminId,
    "PUT",
    bundleInput([courseIds[1], courseIds[0]], true),
  );
  assert.equal(published.status, 200);
  assert.deepEqual((published.data as { courseIds: string[] }).courseIds, [courseIds[1], courseIds[0]]);

  const memberBundles = await call("/member/course-bundles", memberId);
  assert.equal(memberBundles.status, 200);
  const visible = memberBundles.data as Array<{
    localizedTitle: { en: string };
    courses: Array<{ id: string; enrolled: boolean }>;
  }>;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].localizedTitle.en, "Movement foundations");
  assert.deepEqual(visible[0].courses.map(course => course.id), [courseIds[1], courseIds[0]]);
  assert.equal(visible[0].courses[0].enrolled, false);
  const publicBundles = await call("/public/course-bundles");
  assert.equal(publicBundles.status, 200);
  const publicVisible = publicBundles.data as Array<{ courses: Array<{ id: string }> }>;
  assert.deepEqual(publicVisible[0]?.courses.map(course => course.id), [courseIds[1], courseIds[0]]);

  const lockedCourse = await call(`/member/courses/${courseIds[0]}`, memberId);
  assert.equal(lockedCourse.status, 200);
  assert.equal((lockedCourse.data as { accessState: string }).accessState, "membership_required");

  await db.update(learningCourses).set({ published: false }).where(eq(learningCourses.id, courseIds[0]));
  assert.deepEqual((await call("/member/course-bundles", memberId)).data, [], "hide an incomplete published collection");
  assert.deepEqual((await call("/public/course-bundles")).data, [], "do not expose an incomplete public learning path");

  const adminListing = await call("/operations/course-bundles", adminId);
  assert.equal(adminListing.status, 200);
  const listed = adminListing.data as { bundles: Array<{ id: string; published: boolean; courseIds: string[] }> };
  assert.deepEqual(listed.bundles.find(bundle => bundle.id === created.id)?.courseIds, [courseIds[1], courseIds[0]]);
  assert.equal(listed.bundles.find(bundle => bundle.id === created.id)?.published, true);

  const storedItems = await db.select().from(learningCourseBundleItems)
    .where(eq(learningCourseBundleItems.bundleId, created.id))
    .orderBy(learningCourseBundleItems.position);
  assert.deepEqual(storedItems.map(item => item.courseId), [courseIds[1], courseIds[0]]);
});
