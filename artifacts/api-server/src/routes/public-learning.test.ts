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
const hiddenId = `${prefix}-hidden`;
let server: Server | null = null;

const app = express();
app.use("/public", publicLearningRouter);

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(learningLessons).where(inArray(learningLessons.courseId, [publishedId, hiddenId]));
  await db.delete(learningCourses).where(inArray(learningCourses.id, [publishedId, hiddenId]));
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
  assert.equal(data.length, 1);
  assert.equal(data[0].id, publishedId);
  assert.equal(data[0].category, "mobility");
  assert.deepEqual(Object.keys(data[0]).sort(), [
    "category", "durationMinutes", "id", "level", "localizedInstructor", "localizedSummary", "localizedTitle",
  ]);
  assert.ok(!JSON.stringify(data).includes("private.example.test"));
  assert.ok(!JSON.stringify(data).includes("Private lesson"));
});
