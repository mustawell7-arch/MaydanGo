import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import express from "express";
import { db, learningCourses, memberSavedCourses, pool } from "@workspace/db";
import learningRouter from "./learning";

const prefix = `learning-favorites-test-${randomUUID()}`;
const userId = `${prefix}-member`;
const otherUserId = `${prefix}-other`;
const courseId = randomUUID();
const app = express();
let server: Server | null = null;

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

async function call(path: string, memberId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      "x-test-user": memberId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json() as unknown
    : await response.text();
  return { response, data };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(learningCourses).where(eq(learningCourses.id, courseId));
  await pool.end();
});

test("saved courses persist per member without granting course access", async () => {
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
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const listPath = "/api/member/courses";
  const detailPath = `/api/member/courses/${courseId}`;
  const favoritePath = `/api/member/courses/${courseId}/favorite`;
  const initialList = await call(listPath, userId);
  assert.equal(initialList.response.status, 200);
  assert.equal((initialList.data as Array<{ isSaved: boolean; enrolled: boolean }>)[0]?.isSaved, false);

  const saved = await call(favoritePath, userId, "PUT", { isSaved: true });
  assert.equal(saved.response.status, 200);
  assert.equal((saved.data as { isSaved: boolean }).isSaved, true);
  const savedAt = (saved.data as { savedAt: string }).savedAt;
  assert.ok(savedAt);

  const repeatedSave = await call(favoritePath, userId, "PUT", { isSaved: true });
  assert.equal(repeatedSave.response.status, 200);
  assert.equal((repeatedSave.data as { savedAt: string }).savedAt, savedAt);
  const savedRows = await db.select().from(memberSavedCourses).where(eq(memberSavedCourses.userId, userId));
  assert.equal(savedRows.length, 1, "saving the same course twice does not create duplicate bookmarks");

  const savedList = await call(listPath, userId);
  const savedCourse = (savedList.data as Array<{ isSaved: boolean; enrolled: boolean }>)[0];
  assert.equal(savedCourse?.isSaved, true);
  assert.equal(savedCourse?.enrolled, false);
  const savedDetail = await call(detailPath, userId);
  assert.equal((savedDetail.data as { isSaved: boolean }).isSaved, true);
  assert.equal((savedDetail.data as { accessState: string }).accessState, "membership_required");

  const otherMemberList = await call(listPath, otherUserId);
  assert.equal((otherMemberList.data as Array<{ isSaved: boolean }>)[0]?.isSaved, false);
  const otherMemberDetail = await call(detailPath, otherUserId);
  assert.equal((otherMemberDetail.data as { isSaved: boolean }).isSaved, false);

  const removed = await call(favoritePath, userId, "PUT", { isSaved: false });
  assert.equal(removed.response.status, 200);
  assert.equal((removed.data as { isSaved: boolean; savedAt: string | null }).isSaved, false);
  assert.equal((removed.data as { savedAt: string | null }).savedAt, null);
  const removedList = await call(listPath, userId);
  assert.equal((removedList.data as Array<{ isSaved: boolean }>)[0]?.isSaved, false);
  assert.equal((await db.select().from(memberSavedCourses).where(eq(memberSavedCourses.userId, userId))).length, 0);
});
