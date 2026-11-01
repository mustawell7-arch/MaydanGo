import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import express from "express";
import { db, courseEnrollments, learningCourses, learningLessons, memberships, pool } from "@workspace/db";
import learningRouter, { learningObjectStorage } from "./learning";
import {
  createCoursePlaybackToken,
  verifyCoursePlaybackToken,
} from "../lib/course-playback-token";

const prefix = `learning-playback-test-${randomUUID()}`;
const userId = `${prefix}-member`;
const courseId = `${prefix}-course`;
const lessonId = `${prefix}-lesson`;
const enrollmentId = `${prefix}-enrollment`;
const recordingPath = "/objects/course-recordings/test-recording.mp4";
const app = express();
let server: Server | null = null;
const originalSecret = process.env.SESSION_SECRET;
const originalGetPrivateFile = learningObjectStorage.getPrivateFile.bind(learningObjectStorage);
process.env.SESSION_SECRET = "test-only-course-playback-secret";

const bytes = Buffer.from("recording");
const fakeFile = {
  getMetadata: async () => [{ size: String(bytes.length) }],
  createReadStream: (options?: { start?: number; end?: number }) => {
    const start = options?.start ?? 0;
    const end = options?.end ?? bytes.length - 1;
    return Readable.from(bytes.subarray(start, end + 1));
  },
};

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
app.use("/api/member", learningRouter);

async function call(path: string, memberId: string, method = "GET") {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "x-test-user": memberId },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json() as unknown
    : await response.text();
  return { response, data };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  learningObjectStorage.getPrivateFile = originalGetPrivateFile;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  await db.delete(learningCourses).where(
    eq(learningCourses.id, courseId),
  );
  await db.delete(memberships).where(eq(memberships.userId, userId));
  await pool.end();
});

test("private course recordings require current membership and enrollment", async () => {
  learningObjectStorage.getPrivateFile = async path => {
    assert.equal(path, recordingPath);
    return fakeFile as unknown as Awaited<ReturnType<typeof originalGetPrivateFile>>;
  };
  await db.insert(learningCourses).values({
    id: courseId,
    title: "Movement basics",
    localizedTitle: { en: "Movement basics", ar: "أساسيات الحركة", ku: "بنەماکانی جووڵە" },
    localizedSummary: { en: "A course.", ar: "دورة.", ku: "کۆرسێک." },
    localizedInstructor: { en: "MaydanGo", ar: "ميدان", ku: "مەیدان" },
    category: "mobility",
    level: "beginner",
    durationMinutes: 30,
    thumbnailUrl: null,
    published: true,
  });
  await db.insert(learningLessons).values({
    id: lessonId,
    courseId,
    position: 1,
    localizedTitle: { en: "Start", ar: "ابدأ", ku: "دەستپێبکە" },
    localizedContent: { en: "Lesson text.", ar: "نص الدرس.", ku: "دەقی وانە." },
    durationMinutes: 9,
    mediaUrl: recordingPath,
  });
  await db.insert(memberships).values({
    userId,
    scope: "live",
    status: "trial",
    source: "trial",
    paymentStatus: "not_required",
    tier: "M",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60 * 60_000),
    rules: { quota: 12, dailyLimit: 2, trialAllowedTypes: ["live"] },
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const path = `/api/member/courses/${courseId}/lessons/${lessonId}/playback-link`;
  assert.equal((await call(path, userId, "POST")).response.status, 403);

  await db.insert(courseEnrollments).values({ id: enrollmentId, userId, courseId });
  const details = await call(`/api/member/courses/${courseId}`, userId);
  assert.equal(details.response.status, 200);
  const lesson = (details.data as { lessons: Array<{ mediaUrl: string | null; hasRecording: boolean }> }).lessons[0];
  assert.equal(lesson.mediaUrl, null);
  assert.equal(lesson.hasRecording, true);

  const linkResponse = await call(path, userId, "POST");
  assert.equal(linkResponse.response.status, 200);
  const link = (linkResponse.data as { url: string; validUntil: string }).url;
  assert.match(link, /^\/api\/member\/course-playback\?token=/);
  const playbackUrl = new URL(link, `http://127.0.0.1:${(server!.address() as { port: number }).port}`);
  const ranged = await fetch(playbackUrl, { headers: { Range: "bytes=1-3" } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-type"), "video/mp4");
  assert.equal(ranged.headers.get("cache-control"), "private, no-store");
  assert.equal(await ranged.text(), "eco");

  await db.update(memberships).set({ endsAt: new Date(Date.now() - 1000) })
    .where(eq(memberships.userId, userId));
  assert.equal((await call(path, userId, "POST")).response.status, 403);
  assert.equal((await fetch(playbackUrl)).status, 403);
});

test("course playback tokens expire and reject tampering", () => {
  const now = Date.now();
  const { token, expiresAt } = createCoursePlaybackToken({
    userId,
    courseId,
    lessonId,
  }, now);
  assert.equal(verifyCoursePlaybackToken(token, now)?.userId, userId);
  assert.equal(verifyCoursePlaybackToken(token, expiresAt), null);
  const [payload, signature] = token.split(".");
  assert.equal(verifyCoursePlaybackToken(`${payload}x.${signature}`, now), null);
});
