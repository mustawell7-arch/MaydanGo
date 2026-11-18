import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import { db, learningCourses, learningLessons, operators, partners, pool } from "@workspace/db";
import operationsRouter, { operationsObjectStorage } from "./operations";

const prefix = `learning-admin-test-${randomUUID()}`;
const adminUserId = `${prefix}-admin`;
const financeUserId = `${prefix}-finance`;
const partnerUserId = `${prefix}-partner`;
const partnerId = `${prefix}-partner-record`;
let server: Server | null = null;
let courseIds: string[] = [];
const originalCreateCourseMaterialUpload = operationsObjectStorage.createCourseMaterialUpload.bind(operationsObjectStorage);
const originalGetPrivateFile = operationsObjectStorage.getPrivateFile.bind(operationsObjectStorage);
const originalPromoteCourseMaterialUpload = operationsObjectStorage.promoteCourseMaterialUpload.bind(operationsObjectStorage);
const fakePdf = {
  getMetadata: async () => [{ size: "8", contentType: "application/pdf" }],
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
  courseLanguages: ["en", "ar", "ku"],
  subtitleLanguages: [],
  requiredEquipment: localized("A mat", "بساط", "مەت"),
  disclaimers: localized("Train at your own pace.", "تمرّن حسب قدرتك.", "بەپێی توانای خۆت ڕاهێنان بکە."),
  supportingMaterials: localized("Printable guide.", "دليل قابل للطباعة.", "ڕێبەری چاپکراو."),
  published,
});

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  operationsObjectStorage.createCourseMaterialUpload = originalCreateCourseMaterialUpload;
  operationsObjectStorage.getPrivateFile = originalGetPrivateFile;
  operationsObjectStorage.promoteCourseMaterialUpload = originalPromoteCourseMaterialUpload;
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
  operationsObjectStorage.createCourseMaterialUpload = async (courseId, materialId) => ({
    uploadURL: `https://upload.example.test/${materialId}`,
    documentPath: `/objects/course-material-uploads/${courseId}/${materialId}.pdf`,
  });
  operationsObjectStorage.getPrivateFile = async path => {
    assert.match(path, /^\/objects\/course-material-uploads\/[0-9a-f-]+\/[0-9a-f-]+\.pdf$/i);
    return fakePdf as unknown as Awaited<ReturnType<typeof originalGetPrivateFile>>;
  };
  operationsObjectStorage.promoteCourseMaterialUpload = async (_stagingPath, courseId, materialId) =>
    `/objects/course-materials/${courseId}/${materialId}.pdf`;
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
  const course = created.data as {
    id: string;
    published: boolean;
    lessonCount: number;
    courseLanguages: string[];
    subtitleLanguages: string[];
    requiredEquipment: { en: string; ar: string; ku: string };
  };
  courseIds = [course.id];
  assert.equal(course.published, false);
  assert.equal(course.lessonCount, 1);
  assert.deepEqual(course.courseLanguages, ["en", "ar", "ku"]);
  assert.deepEqual(course.subtitleLanguages, []);
  assert.equal(course.requiredEquipment.en, "A mat");

  assert.equal((await call(`/operations/courses/${course.id}/materials`, financeUserId)).status, 403);
  assert.equal((await call(`/operations/courses/${course.id}/materials/upload-url`, adminUserId, "POST", {
    fileName: "guide.txt",
  })).status, 400);
  const uploadRequest = await call(`/operations/courses/${course.id}/materials/upload-url`, adminUserId, "POST", {
    fileName: "beginner-plan.pdf",
  });
  assert.equal(uploadRequest.status, 200);
  const upload = uploadRequest.data as { id: string; uploadURL: string };
  assert.match(upload.uploadURL, /^https:\/\/upload\.example\.test\//);
  const materialComplete = await call(
    `/operations/courses/${course.id}/materials/${upload.id}/complete`,
    adminUserId,
    "POST",
    { title: "Beginner plan", fileName: "beginner-plan.pdf" },
  );
  assert.equal(materialComplete.status, 201);
  const materialsListing = await call(`/operations/courses/${course.id}/materials`, adminUserId);
  assert.equal(
    (materialsListing.data as { materials: Array<{ title: string; approvedBy: string }> }).materials[0]?.title,
    "Beginner plan",
  );
  assert.equal(
    (materialsListing.data as { materials: Array<{ title: string; approvedBy: string }> }).materials[0]?.approvedBy,
    adminUserId,
  );

  const listing = await call("/operations/courses", adminUserId);
  assert.equal(listing.status, 200);
  const courses = (listing.data as {
    courses: Array<{ id: string; lessonCount: number; supportingMaterials: { en: string } | null }>;
  }).courses;
  const listedCourse = courses.find(item => item.id === course.id);
  assert.equal(listedCourse?.lessonCount, 1);
  assert.equal(listedCourse?.supportingMaterials?.en, "Printable guide.");

  assert.equal((await call(`/operations/courses/${course.id}`, financeUserId, "PUT", courseMetadata(true))).status, 403);
  assert.equal((await call(`/operations/courses/${course.id}/lessons`, partnerUserId, "POST", {
    ...initialLesson,
    position: 2,
  })).status, 403);

  const published = await call(`/operations/courses/${course.id}`, adminUserId, "PUT", courseMetadata(true));
  assert.equal(published.status, 200);
  assert.equal((published.data as { published: boolean }).published, true);
  const [publishedCourse] = await db.select({ publishedAt: learningCourses.publishedAt })
    .from(learningCourses).where(eq(learningCourses.id, course.id)).limit(1);
  assert.ok(publishedCourse?.publishedAt instanceof Date);

  const legacyCourseId = randomUUID();
  courseIds.push(legacyCourseId);
  await db.insert(learningCourses).values({
    id: legacyCourseId,
    title: "Legacy published course",
    localizedTitle: localized("Legacy course", "دورة قديمة", "کۆرسی کۆن"),
    localizedSummary: localized("Existing course.", "دورة قائمة.", "کۆرسێکی هەبوو."),
    localizedInstructor: localized("MaydanGo team", "فريق ميدان", "تیمی مەیدان"),
    category: "mobility",
    level: "beginner",
    durationMinutes: 30,
    published: true,
  });
  await db.insert(learningLessons).values({
    id: randomUUID(),
    courseId: legacyCourseId,
    ...initialLesson,
  });
  assert.equal((await call(`/operations/courses/${legacyCourseId}`, adminUserId, "PUT", courseMetadata(true))).status, 200);
  const [legacyCourse] = await db.select({ publishedAt: learningCourses.publishedAt })
    .from(learningCourses).where(eq(learningCourses.id, legacyCourseId)).limit(1);
  assert.equal(legacyCourse?.publishedAt, null);

  const addedLesson = await call(`/operations/courses/${course.id}/lessons`, adminUserId, "POST", {
    ...initialLesson,
    position: 2,
    localizedTitle: localized("Second lesson", "الدرس الثاني", "وانەی دووەم"),
  });
  assert.equal(addedLesson.status, 201, JSON.stringify(addedLesson.data));

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
