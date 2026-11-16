import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  instructorContentDrafts,
  instructorProfiles,
  operators,
  pool,
} from "@workspace/db";
import instructorRouter from "./instructor";
import instructorContentReviewRouter from "./instructor-content-review";
import publicLearningRouter from "./public-learning";

const prefix = `instructor-content-test-${randomUUID()}`;
const adminUserId = `${prefix}-admin`;
const financeUserId = `${prefix}-finance`;
const instructorUserId = `${prefix}-instructor`;
const otherInstructorUserId = `${prefix}-other`;
let server: Server | null = null;

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
app.use("/operations/instructor-content-drafts", instructorContentReviewRouter);
app.use("/public", publicLearningRouter);

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text) as unknown; } catch { data = text; }
  return { status: response.status, data };
}

function profilePayload(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Instructor Example",
    biography: "A qualified instructor focused on safe, inclusive movement for adults at every level.",
    qualifications: ["Certified movement coach"],
    languages: ["Arabic", "Kurdish", "English"],
    specialties: ["Mobility", "Strength"],
    photoUploadId: null,
    ...overrides,
  };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(instructorProfiles).where(eq(instructorProfiles.userId, instructorUserId));
  await db.delete(instructorContentDrafts).where(
    inArray(instructorContentDrafts.instructorUserId, [instructorUserId, otherInstructorUserId]),
  );
  await db.delete(operators).where(
    inArray(operators.userId, [adminUserId, financeUserId, instructorUserId, otherInstructorUserId]),
  );
  await pool.end();
});

test("profile drafts are private, moderated, and public only after approval", async () => {
  await db.insert(operators).values([
    { userId: adminUserId, role: "content_admin", partnerId: null },
    { userId: financeUserId, role: "finance", partnerId: null },
    { userId: instructorUserId, role: "instructor", partnerId: null },
    { userId: otherInstructorUserId, role: "instructor", partnerId: null },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const denied = await call("/instructor/content-drafts", financeUserId, "POST", {
    contentType: "profile",
    payload: profilePayload(),
  });
  assert.equal(denied.status, 403);

  const created = await call("/instructor/content-drafts", instructorUserId, "POST", {
    contentType: "profile",
    payload: profilePayload({ biography: "Short" }),
  });
  assert.equal(created.status, 201);
  const draftId = (created.data as { id: string }).id;
  assert.equal((await call(`/instructor/content-drafts/${draftId}/uploads`, otherInstructorUserId, "POST", {
    purpose: "profile_photo",
    fileName: "profile.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1024,
  })).status, 404);
  assert.equal((await call("/instructor/content-drafts", otherInstructorUserId, "PUT", {
    contentType: "profile",
    payload: profilePayload(),
  })).status, 404);
  assert.equal((await call(`/instructor/content-drafts/${draftId}`, otherInstructorUserId, "PUT", {
    contentType: "profile",
    payload: profilePayload(),
  })).status, 404);

  const notReady = await call(`/instructor/content-drafts/${draftId}/submit`, instructorUserId, "POST");
  assert.equal(notReady.status, 400);
  const updated = await call(`/instructor/content-drafts/${draftId}`, instructorUserId, "PUT", {
    contentType: "profile",
    payload: profilePayload(),
  });
  assert.equal(updated.status, 200);
  const submitted = await call(`/instructor/content-drafts/${draftId}/submit`, instructorUserId, "POST");
  assert.equal(submitted.status, 200);
  assert.equal((submitted.data as { status: string }).status, "submitted");

  assert.equal((await call("/operations/instructor-content-drafts", financeUserId)).status, 403);
  const queue = await call("/operations/instructor-content-drafts", adminUserId);
  assert.equal(queue.status, 200);
  assert.ok((queue.data as { drafts: Array<{ id: string }> }).drafts.some(row => row.id === draftId));

  const returned = await call(
    `/operations/instructor-content-drafts/${draftId}/decision`,
    adminUserId,
    "POST",
    { decision: "request_changes", reason: "Please add more detail about your qualifications." },
  );
  assert.equal(returned.status, 200);
  assert.equal((returned.data as { status: string }).status, "changes_requested");

  const resubmittedEdit = await call(`/instructor/content-drafts/${draftId}`, instructorUserId, "PUT", {
    contentType: "profile",
    payload: profilePayload({ biography: "A qualified instructor with more detail about coaching safely and welcoming people of all abilities." }),
  });
  assert.equal(resubmittedEdit.status, 200);
  assert.equal((await call(`/instructor/content-drafts/${draftId}/submit`, instructorUserId, "POST")).status, 200);

  const approved = await call(
    `/operations/instructor-content-drafts/${draftId}/decision`,
    adminUserId,
    "POST",
    { decision: "approve" },
  );
  assert.equal(approved.status, 200);
  assert.equal((approved.data as { status: string }).status, "approved");

  const publicProfiles = await call("/public/instructors", adminUserId);
  assert.equal(publicProfiles.status, 200);
  const profile = (publicProfiles.data as Array<{
    id: string;
    displayName: string;
    photoUrl: string | null;
    courses: unknown[];
    userId?: string;
  }>).find(row => row.displayName === "Instructor Example");
  assert.ok(profile);
  assert.equal(profile.photoUrl, null);
  assert.deepEqual(profile.courses, []);
  assert.equal("userId" in profile, false);

  const ownDrafts = await call("/instructor/content-drafts", instructorUserId);
  assert.equal(ownDrafts.status, 200);
  assert.equal(
    (ownDrafts.data as { drafts: Array<{ id: string; status: string }> }).drafts.find(row => row.id === draftId)?.status,
    "approved",
  );

  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const cancellationDeadline = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  const meetingUrl = "https://private-meeting.example/secret-room";
  const liveClass = await call("/instructor/content-drafts", instructorUserId, "POST", {
    contentType: "live_class",
    payload: {
      localizedTitle: { en: "Mobility online", ar: "حركة عبر الإنترنت", ku: "جووڵەی ئۆنلاین" },
      localizedDescription: { en: "A guided online session.", ar: "حصة مباشرة عبر الإنترنت.", ku: "وانەیەکی ڕاستەوخۆی ئۆنلاین." },
      localizedInstructor: { en: "Instructor Example", ar: "المدرّب", ku: "مامۆستا" },
      city: "Erbil",
      category: "mobility",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      cancellationDeadline: cancellationDeadline.toISOString(),
      capacity: 20,
      tiers: ["M"],
      difficultyLevel: "all-levels",
      instructionLanguage: "en",
      requiredEquipment: null,
      joinUrl: meetingUrl,
    },
  });
  assert.equal(liveClass.status, 201);
  const liveClassId = (liveClass.data as { id: string }).id;
  assert.equal((await call(`/instructor/content-drafts/${liveClassId}/submit`, instructorUserId, "POST")).status, 200);
  const reviewQueue = await call("/operations/instructor-content-drafts", adminUserId);
  const liveReview = (reviewQueue.data as { drafts: Array<{ id: string; payload: Record<string, unknown> }> }).drafts
    .find(row => row.id === liveClassId);
  assert.ok(liveReview);
  assert.equal("joinUrl" in liveReview.payload, false);
  assert.equal(JSON.stringify(reviewQueue.data).includes(meetingUrl), false);
  const instructorDrafts = await call("/instructor/content-drafts", instructorUserId);
  const ownLiveDraft = (instructorDrafts.data as { drafts: Array<{ id: string; payload: Record<string, unknown> }> }).drafts
    .find(row => row.id === liveClassId);
  assert.equal((ownLiveDraft?.payload as Record<string, unknown>)?.joinUrl, meetingUrl);
});
