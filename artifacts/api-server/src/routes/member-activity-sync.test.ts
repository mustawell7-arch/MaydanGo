import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  memberActivitySyncConsentEvents,
  memberActivitySyncSummaries,
  memberConsentEvents,
  pool,
} from "@workspace/db";
import { saveMemberConsentChoices } from "../lib/member-consents";
import { addCalendarDays, iraqToday } from "../lib/fitness-challenges";
import memberRouter from "./member";

const prefix = `activity-sync-test-${randomUUID()}`;
const memberId = `${prefix}-member`;
const otherMemberId = `${prefix}-other`;
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
app.use("/member", memberRouter);

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      "x-test-user": userId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    data: contentType.includes("application/json") ? await response.json() as unknown : null,
  };
}

async function addSummary(userId: string, day: string) {
  return db.insert(memberActivitySyncSummaries).values({
    id: randomUUID(),
    userId,
    provider: "apple_health",
    activityDate: day,
    steps: 4200,
    completedWorkouts: 1,
  }).returning({ id: memberActivitySyncSummaries.id });
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(memberActivitySyncSummaries)
    .where(inArray(memberActivitySyncSummaries.userId, [memberId, otherMemberId]));
  await db.delete(memberActivitySyncConsentEvents)
    .where(inArray(memberActivitySyncConsentEvents.userId, [memberId, otherMemberId]));
  await db.delete(memberConsentEvents)
    .where(inArray(memberConsentEvents.userId, [memberId, otherMemberId]));
  await pool.end();
});

test("activity sync consent is opt-in, private to each member, and revocation deletes summaries", async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/member/activity-sync", memberId)).status, 200);
  assert.equal((await call("/member/activity-sync/consent", memberId, "POST", {
    accept: true,
    policyVersion: "stale",
  })).status, 400);
  assert.equal((await call("/member/activity-sync/consent", memberId, "POST", {
    accept: true,
    policyVersion: "v1",
  })).status, 403);

  await saveMemberConsentChoices(memberId, {
    termsOfUseAccepted: true,
    privacyPolicyAccepted: true,
    marketingConsent: false,
  });
  assert.equal((await call("/member/activity-sync/apple-health/sync", memberId, "POST", {
    summaries: [{ activityDate: addCalendarDays(iraqToday(), -1), steps: 4200, completedWorkouts: 1 }],
  })).status, 403);
  const accepted = await call("/member/activity-sync/consent", memberId, "POST", {
    accept: true,
    policyVersion: "v1",
  });
  assert.equal(accepted.status, 200);
  assert.equal((accepted.data as { syncAvailable: boolean }).syncAvailable, true);
  assert.equal((accepted.data as { consent: { status: string } }).consent.status, "enabled");

  const activityDate = addCalendarDays(iraqToday(), -1);
  const syncBody = {
    summaries: [{ activityDate, steps: 4200, completedWorkouts: 1 }],
  };
  const firstSync = await call("/member/activity-sync/apple-health/sync", memberId, "POST", syncBody);
  assert.equal(firstSync.status, 200);
  assert.equal((firstSync.data as { records: unknown[] }).records.length, 1);
  const updatedSync = await call("/member/activity-sync/apple-health/sync", memberId, "POST", {
    summaries: [{ activityDate, steps: 5100, completedWorkouts: 2 }],
  });
  assert.equal(updatedSync.status, 200);
  const ownSyncedRecords = await db.select().from(memberActivitySyncSummaries).where(and(
    eq(memberActivitySyncSummaries.userId, memberId),
    eq(memberActivitySyncSummaries.activityDate, activityDate),
  ));
  assert.equal(ownSyncedRecords.length, 1);
  assert.equal(ownSyncedRecords[0]?.steps, 5100);
  assert.equal((await call("/member/activity-sync/apple-health/sync", memberId, "POST", {
    summaries: [{ activityDate: addCalendarDays(iraqToday(), -30), steps: 1, completedWorkouts: 0 }],
  })).status, 400);
  assert.equal((await call("/member/activity-sync/apple-health/sync", memberId, "POST", {
    summaries: [
      { activityDate, steps: 1, completedWorkouts: 0 },
      { activityDate, steps: 2, completedWorkouts: 0 },
    ],
  })).status, 400);

  await addSummary(memberId, "2026-05-01");
  await addSummary(otherMemberId, "2026-05-01");
  const visible = await call("/member/activity-sync", memberId);
  assert.equal((visible.data as { records: unknown[] }).records.length, 2);

  const deleted = await call("/member/activity-sync/data", memberId, "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal((deleted.data as { deletedRecords: number }).deletedRecords, 2);
  const otherRows = await db.select().from(memberActivitySyncSummaries).where(and(
    eq(memberActivitySyncSummaries.userId, otherMemberId),
    eq(memberActivitySyncSummaries.activityDate, "2026-05-01"),
  ));
  assert.equal(otherRows.length, 1);

  await addSummary(memberId, "2026-05-02");
  const revoked = await call("/member/activity-sync/consent", memberId, "DELETE");
  assert.equal(revoked.status, 200);
  assert.equal((revoked.data as { consent: { status: string } }).consent.status, "revoked");
  assert.equal((revoked.data as { records: unknown[] }).records.length, 0);
  assert.equal((await call("/member/activity-sync/apple-health/sync", memberId, "POST", syncBody)).status, 403);
  const history = await db.select().from(memberActivitySyncConsentEvents).where(
    eq(memberActivitySyncConsentEvents.userId, memberId),
  ).orderBy(desc(memberActivitySyncConsentEvents.recordedAt), desc(memberActivitySyncConsentEvents.id));
  assert.equal(history[0]?.action, "revoked");
});
