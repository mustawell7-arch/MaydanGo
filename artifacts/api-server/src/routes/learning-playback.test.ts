import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import express from "express";
import { db, courseEnrollments, courseMaterials, learningCourses, learningLessons, memberships, pool } from "@workspace/db";
import learningRouter, { learningObjectStorage } from "./learning";
import {
  createCoursePlaybackToken,
  verifyCoursePlaybackToken,
} from "../lib/course-playback-token";

const prefix = `learning-playback-test-${randomUUID()}`;
const userId = `${prefix}-member`;
const courseId = randomUUID();
const lessonId = randomUUID();
const enrollmentId = randomUUID();
const materialId = randomUUID();
const recordingPath = "/objects/course-recordings/test-recording.mp4";
const materialPath = `/objects/course-materials/${courseId}/${materialId}.pdf`;
const courseRules = (digitalContentAccess: boolean) => ({
  quota: 12,
  dailyLimit: 2,
  trialAllowedTypes: ["live"],
  planTerms: {
    description: { en: "Test plan", ar: "خطة اختبار", ku: "پلانی تاقیکردنەوە" },
    trialPeriodDays: 0,
    minimumContractMonths: 0,
    renewalPeriodDays: 30,
    cancellationPeriodDays: 0,
    automaticRenewal: false,
    pauseAllowanceDays: 0,
    priceProtectionMonths: 0,
    promotionalPriceIqd: null,
    corporatePriceIqd: null,
    digitalContentAccess,
    guestPasses: 0,
    eventAccess: false,
    additionalPaymentAllowed: false,
  },
});
const app = express();
let server: Server | null = null;
const originalSecret = process.env.SESSION_SECRET;
const originalGetPrivateFile = learningObjectStorage.getPrivateFile.bind(learningObjectStorage);
process.env.SESSION_SECRET = "test-only-course-playback-secret";

const bytes = Buffer.from("recording");
const fakeFile = {
  getMetadata: async () => [{ size: String(bytes.length), contentType: "video/mp4" }],
  createReadStream: (options?: { start?: number; end?: number }) => {
    const start = options?.start ?? 0;
    const end = options?.end ?? bytes.length - 1;
    return Readable.from(bytes.subarray(start, end + 1));
  },
};
const pdfBytes = Buffer.from("%PDF-test");
const fakePdfFile = {
  getMetadata: async () => [{ size: String(pdfBytes.length), contentType: "application/pdf" }],
  createReadStream: () => Readable.from(pdfBytes),
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
    if (path === recordingPath) return fakeFile as unknown as Awaited<ReturnType<typeof originalGetPrivateFile>>;
    if (path === materialPath) return fakePdfFile as unknown as Awaited<ReturnType<typeof originalGetPrivateFile>>;
    throw new Error("Unexpected private course file.");
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
  await db.insert(courseMaterials).values({
    id: materialId,
    courseId,
    title: "Training plan",
    fileName: "training-plan.pdf",
    objectPath: materialPath,
    sizeBytes: pdfBytes.length,
    approvedBy: `${prefix}-admin`,
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
    rules: courseRules(false),
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const path = `/api/member/courses/${courseId}/lessons/${lessonId}/playback-link`;
  assert.equal((await call(path, userId, "POST")).response.status, 403);
  assert.equal((await call(`/api/member/courses/${courseId}/materials/${materialId}/download-link`, userId, "POST")).response.status, 403);

  await db.insert(courseEnrollments).values({ id: enrollmentId, userId, courseId });
  const restrictedDetails = await call(`/api/member/courses/${courseId}`, userId);
  assert.equal(restrictedDetails.response.status, 200);
  assert.equal((restrictedDetails.data as { accessState: string }).accessState, "membership_required");
  const restrictedLesson = (restrictedDetails.data as { lessons: Array<{ localizedContent: unknown; hasRecording: boolean }> }).lessons[0];
  assert.equal(restrictedLesson.localizedContent, null);
  assert.equal(restrictedLesson.hasRecording, false);
  assert.equal((restrictedDetails.data as { materials: unknown[] }).materials.length, 0);
  assert.equal((await call(path, userId, "POST")).response.status, 403);

  await db.update(memberships).set({ rules: courseRules(true) }).where(eq(memberships.userId, userId));
  const details = await call(`/api/member/courses/${courseId}`, userId);
  assert.equal(details.response.status, 200);
  assert.equal((details.data as { accessState: string }).accessState, "ready");
  const lesson = (details.data as { lessons: Array<{ mediaUrl: string | null; hasRecording: boolean }> }).lessons[0];
  assert.equal(lesson.mediaUrl, null);
  assert.equal(lesson.hasRecording, true);
  assert.equal((details.data as { materials: Array<{ id: string; title: string }> }).materials[0]?.title, "Training plan");

  const materialLinkResponse = await call(
    `/api/member/courses/${courseId}/materials/${materialId}/download-link`,
    userId,
    "POST",
  );
  assert.equal(materialLinkResponse.response.status, 200);
  const materialLink = (materialLinkResponse.data as { url: string }).url;
  assert.match(materialLink, /^\/api\/member\/course-material-download\?token=/);
  const materialDownloadUrl = new URL(materialLink, `http://127.0.0.1:${(server!.address() as { port: number }).port}`);
  const downloadedMaterial = await fetch(materialDownloadUrl);
  assert.equal(downloadedMaterial.status, 200);
  assert.equal(downloadedMaterial.headers.get("content-type"), "application/pdf");
  assert.match(downloadedMaterial.headers.get("content-disposition") ?? "", /attachment/);
  assert.deepEqual(Buffer.from(await downloadedMaterial.arrayBuffer()), pdfBytes);

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

  await db.update(memberships).set({ rules: courseRules(false) }).where(eq(memberships.userId, userId));
  assert.equal((await fetch(playbackUrl)).status, 403, "revoking course access blocks previously issued playback links");
  assert.equal((await fetch(materialDownloadUrl)).status, 403, "revoking course access blocks previously issued material links");
  await db.update(memberships).set({
    rules: courseRules(true),
    endsAt: new Date(Date.now() - 1000),
  }).where(eq(memberships.userId, userId));
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
