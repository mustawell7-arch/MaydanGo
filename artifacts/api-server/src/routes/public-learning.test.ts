import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import { db, learningCourses, learningLessons, pool } from "@workspace/db";
import publicLearningRouter from "./public-learning";

const prefix = `public-courses-${randomUUID()}`;
const publishedId = `${prefix}-published`;
const unreportedId = `${prefix}-unreported`;
const hiddenId = `${prefix}-hidden`;
let server: Server | null = null;

const app = express();
app.use("/public", publicLearningRouter);

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(learningLessons).where(inArray(learningLessons.courseId, [publishedId, unreportedId, hiddenId]));
  await db.delete(learningCourses).where(inArray(learningCourses.id, [publishedId, unreportedId, hiddenId]));
  await pool.end();
});

test("public course catalogue returns published metadata without lesson media", async () => {
  await db.insert(learningCourses).values([
    {
      id: publishedId,
      title: "Public course test",
      localizedTitle: { en: "Public course", ar: "دورة عامة", ku: "کۆرسی گشتی" },
      localizedSummary: { en: "A public summary", ar: "ملخص عام", ku: "پوختەی گشتی" },
      localizedInstructor: { en: "Instructor", ar: "المدرب", ku: "ڕاهێنەر" },
      category: "mobility",
      level: "beginner",
      durationMinutes: 45,
      courseLanguages: ["en", "ar"],
      subtitleLanguages: [],
      requiredEquipment: { en: "A mat", ar: "بساط", ku: "مەت" },
      disclaimers: { en: "Train within your comfort.", ar: "تمرّن ضمن حدود راحتك.", ku: "لە سنووری ئاسوودەیی خۆت ڕاهێنان بکە." },
      supportingMaterials: null,
      published: true,
    },
    {
      id: unreportedId,
      title: "Course details not supplied test",
      localizedTitle: { en: "Details not supplied", ar: "التفاصيل غير متوفرة", ku: "وردەکاری بەردەست نییە" },
      localizedSummary: { en: "A summary", ar: "ملخص", ku: "پوختە" },
      localizedInstructor: { en: "Instructor", ar: "المدرب", ku: "ڕاهێنەر" },
      category: "pilates",
      level: "all-levels",
      durationMinutes: 20,
      published: true,
    },
    {
      id: hiddenId,
      title: "Hidden course test",
      localizedTitle: { en: "Hidden course", ar: "دورة مخفية", ku: "کۆرسی شاراوە" },
      localizedSummary: { en: "Not public", ar: "غير منشورة", ku: "بڵاونەکراوە" },
      localizedInstructor: { en: "Instructor", ar: "المدرب", ku: "ڕاهێنەر" },
      category: "strength",
      level: "beginner",
      durationMinutes: 30,
      courseLanguages: ["ku"],
      subtitleLanguages: ["ar"],
      requiredEquipment: null,
      disclaimers: null,
      supportingMaterials: null,
      published: false,
    },
  ]);
  await db.insert(learningLessons).values({
    id: `${prefix}-lesson`,
    courseId: publishedId,
    position: 1,
    localizedTitle: { en: "Private lesson", ar: "درس خاص", ku: "وانەی تایبەت" },
    localizedContent: { en: "Private content", ar: "محتوى خاص", ku: "ناوەڕۆکی تایبەت" },
    durationMinutes: 45,
    mediaUrl: "https://private.example.test/recording",
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}/public/courses`);
  assert.equal(response.status, 200);
  const data = await response.json() as Array<Record<string, unknown>>;
  assert.equal(data.length, 2);
  const publishedCourse = data.find(course => course.id === publishedId)!;
  const unreportedCourse = data.find(course => course.id === unreportedId)!;
  assert.equal(publishedCourse.category, "mobility");
  assert.equal(publishedCourse.lessonCount, 1);
  assert.deepEqual(publishedCourse.courseLanguages, ["en", "ar"]);
  assert.deepEqual(publishedCourse.subtitleLanguages, []);
  assert.deepEqual(publishedCourse.requiredEquipment, { en: "A mat", ar: "بساط", ku: "مەت" });
  assert.equal(unreportedCourse.lessonCount, 0);
  assert.equal(unreportedCourse.courseLanguages, null);
  assert.equal(unreportedCourse.subtitleLanguages, null);
  assert.equal(unreportedCourse.requiredEquipment, null);
  assert.deepEqual(Object.keys(publishedCourse).sort(), [
    "category", "courseLanguages", "disclaimers", "durationMinutes", "id", "lessonCount", "level",
    "localizedInstructor", "localizedSummary", "localizedTitle", "requiredEquipment", "subtitleLanguages",
    "supportingMaterials",
  ]);
  assert.ok(!JSON.stringify(data).includes("private.example.test"));
  assert.ok(!JSON.stringify(data).includes("Private lesson"));
  assert.ok(!JSON.stringify(data).includes(hiddenId));
});
