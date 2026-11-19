import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  attendance,
  courseEnrollments,
  db,
  learningCourses,
  learningLessons,
  lessonProgress,
  memberConsentEvents,
  offerings,
  pool,
  reservations,
} from "@workspace/db";
import { saveMemberConsentChoices } from "../lib/member-consents";
import memberRouter from "./member";

const prefix = `loyalty-points-test-${randomUUID()}`;
const memberId = `${prefix}-member`;
const otherMemberId = `${prefix}-other`;
const noConsentMemberId = `${prefix}-no-consent`;
const offeringIds = Array.from({ length: 4 }, () => randomUUID());
const reservationIds = Array.from({ length: 4 }, () => randomUUID());
const attendanceIds = Array.from({ length: 4 }, () => randomUUID());
const courseIds = [`${prefix}-complete`, `${prefix}-partial`, `${prefix}-other`];
const enrollmentIds = [`${prefix}-enrollment-complete`, `${prefix}-enrollment-partial`, `${prefix}-enrollment-other`];
const lessonIds = Array.from({ length: 5 }, (_, index) => `${prefix}-lesson-${index}`);
let server: Server | null = null;

const localized = (en: string, ar: string, ku: string) => ({ en, ar, ku });

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
app.use("/member", memberRouter);

async function call(path: string, userId: string) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    headers: { "x-test-user": userId },
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    data: contentType.includes("application/json") ? await response.json() as unknown : null,
  };
}

async function createVisit(index: number, status: string, settlementEligible: boolean, scope: string) {
  const offeringId = offeringIds[index]!;
  const checkedInAt = new Date(`2026-11-${10 + index}T10:00:00.000Z`);
  await db.insert(offerings).values({
    id: offeringId,
    targetId: offeringId,
    kind: "session",
    title: `${prefix} class ${index}`,
    localizedTitle: localized(`Class ${index}`, `الحصة ${index}`, `وانە ${index}`),
    scope,
    city: "Erbil",
    facility: `${prefix} facility`,
    category: "fitness",
    tiers: ["M"],
    startsAt: checkedInAt,
    endsAt: new Date(checkedInAt.getTime() + 60 * 60_000),
    cancellationDeadline: checkedInAt,
    capacity: 10,
  });
  await db.insert(reservations).values({
    id: reservationIds[index]!,
    userId: memberId,
    offeringId,
    status: "confirmed",
  });
  await db.insert(attendance).values({
    id: attendanceIds[index]!,
    reservationId: reservationIds[index]!,
    userId: memberId,
    offeringId,
    checkedInAt,
    verifiedBy: `${prefix}-partner`,
    status,
    settlementEligible,
  });
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(attendance).where(inArray(attendance.id, attendanceIds));
  await db.delete(reservations).where(inArray(reservations.id, reservationIds));
  await db.delete(offerings).where(inArray(offerings.id, offeringIds));
  await db.delete(learningCourses).where(inArray(learningCourses.id, courseIds));
  await db.delete(memberConsentEvents).where(inArray(memberConsentEvents.userId, [
    memberId,
    otherMemberId,
    noConsentMemberId,
  ]));
  await pool.end();
});

test("loyalty points are private and count only confirmed eligible visits and fully completed courses", async () => {
  await saveMemberConsentChoices(memberId, {
    termsOfUseAccepted: true,
    privacyPolicyAccepted: true,
    marketingConsent: false,
  });
  await saveMemberConsentChoices(otherMemberId, {
    termsOfUseAccepted: true,
    privacyPolicyAccepted: true,
    marketingConsent: false,
  });

  await createVisit(0, "confirmed", true, "live");
  await createVisit(1, "confirmed", false, "live");
  await createVisit(2, "pending", false, "live");
  await createVisit(3, "confirmed", true, "preview");

  await db.insert(learningCourses).values(courseIds.map((id, index) => ({
    id,
    title: `Course ${index}`,
    localizedTitle: localized(`Course ${index}`, `الدورة ${index}`, `کۆرس ${index}`),
    localizedSummary: localized("Summary", "ملخص", "پوختە"),
    localizedInstructor: localized("Instructor", "المدرب", "ڕاهێنەر"),
    category: "fitness",
    level: "beginner",
    durationMinutes: 30,
    published: true,
  })));
  await db.insert(learningLessons).values([
    ...[0, 1].map((index) => ({
      id: lessonIds[index]!,
      courseId: courseIds[0]!,
      position: index + 1,
      localizedTitle: localized(`Lesson ${index}`, `الدرس ${index}`, `وانە ${index}`),
      localizedContent: localized("Content", "محتوى", "ناوەڕۆک"),
      durationMinutes: 10,
    })),
    ...[2, 3].map((index) => ({
      id: lessonIds[index]!,
      courseId: courseIds[1]!,
      position: index - 1,
      localizedTitle: localized(`Lesson ${index}`, `الدرس ${index}`, `وانە ${index}`),
      localizedContent: localized("Content", "محتوى", "ناوەڕۆک"),
      durationMinutes: 10,
    })),
    {
      id: lessonIds[4]!,
      courseId: courseIds[2]!,
      position: 1,
      localizedTitle: localized("Other member lesson", "درس عضو آخر", "وانەی ئەندامێکی تر"),
      localizedContent: localized("Content", "محتوى", "ناوەڕۆک"),
      durationMinutes: 10,
    },
  ]);
  await db.insert(courseEnrollments).values([
    { id: enrollmentIds[0]!, userId: memberId, courseId: courseIds[0]! },
    { id: enrollmentIds[1]!, userId: memberId, courseId: courseIds[1]! },
    { id: enrollmentIds[2]!, userId: otherMemberId, courseId: courseIds[2]! },
  ]);
  await db.insert(lessonProgress).values([
    { id: `${prefix}-progress-0`, enrollmentId: enrollmentIds[0]!, lessonId: lessonIds[0]!, completedAt: new Date("2026-11-12T10:00:00.000Z") },
    { id: `${prefix}-progress-1`, enrollmentId: enrollmentIds[0]!, lessonId: lessonIds[1]!, completedAt: new Date("2026-11-13T10:00:00.000Z") },
    { id: `${prefix}-progress-2`, enrollmentId: enrollmentIds[1]!, lessonId: lessonIds[2]!, completedAt: new Date("2026-11-14T10:00:00.000Z") },
    { id: `${prefix}-progress-3`, enrollmentId: enrollmentIds[2]!, lessonId: lessonIds[4]!, completedAt: new Date("2026-11-15T10:00:00.000Z") },
  ]);

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const response = await call("/member/loyalty-points", memberId);
  assert.equal(response.status, 200);
  const points = response.data as {
    balance: number;
    entries: Array<{ source: string; points: number; localizedTitle: { en: string }; facility: string | null }>;
  };
  assert.equal(points.balance, 2);
  assert.equal(points.entries.length, 2);
  assert.deepEqual(points.entries.map(entry => entry.source), ["course_completion", "confirmed_visit"]);
  assert.deepEqual(points.entries.map(entry => entry.points), [1, 1]);
  assert.equal(points.entries[0]?.localizedTitle.en, "Course 0");
  assert.equal(points.entries[0]?.facility, null);
  assert.equal(points.entries[1]?.facility, `${prefix} facility`);
  assert.equal(JSON.stringify(response.data).includes(otherMemberId), false);

  const otherMember = await call("/member/loyalty-points", otherMemberId);
  assert.equal(otherMember.status, 200);
  assert.equal((otherMember.data as { balance: number }).balance, 1);
  assert.equal((otherMember.data as { entries: Array<{ localizedTitle: { en: string } }> }).entries[0]?.localizedTitle.en, "Course 2");
  assert.equal((await call("/member/loyalty-points", noConsentMemberId)).status, 403);
});
