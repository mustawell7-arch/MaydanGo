import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  attendance, db, fitnessChallengeParticipants, fitnessChallengeSelfReports, fitnessChallenges,
  memberConsentEvents, offerings, operators, pool, reservations,
} from "@workspace/db";
import { saveMemberConsentChoices } from "../lib/member-consents";
import { addCalendarDays, iraqDayBounds, iraqToday } from "../lib/fitness-challenges";
import memberRouter from "./member";
import superAdminRouter from "./super-admin";

const prefix = `fitness-challenge-test-${randomUUID()}`;
const memberId = `${prefix}-member`;
const otherMemberId = `${prefix}-other-member`;
const superAdminId = `${prefix}-super-admin`;
let createdChallengeId = "";
const offerIds = [randomUUID(), randomUUID(), randomUUID()];
const reservationIds = [randomUUID(), randomUUID(), randomUUID()];
const attendanceIds = [randomUUID(), randomUUID(), randomUUID()];
let server: Server | null = null;

const localizedTitle = { en: "Move with care", ar: "تحرّك بعناية", ku: "بجووڵەیەکی ئاگادارانە" };
const localizedDescription = {
  en: "Choose a comfortable activity and build a steady routine.",
  ar: "اختر نشاطاً مريحاً وابنِ روتيناً منتظماً.",
  ku: "چالاکییەکی گونجاو هەڵبژێرە و ڕۆتینێکی بەردەوام دروست بکە.",
};
const input = (startDate: string, endDate: string, goalActiveDays: number) => ({
  localizedTitle,
  localizedDescription,
  startDate,
  endDate,
  goalActiveDays,
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
app.use("/member", memberRouter);
app.use("/super-admin", superAdminRouter);

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

async function addAttendance(index: number, userId: string, checkedInAt: Date, status: "pending" | "confirmed", settlementEligible: boolean) {
  const id = offerIds[index];
  await db.insert(offerings).values({
    id,
    targetId: id,
    kind: "session",
    title: `${prefix} session ${index}`,
    scope: "live",
    city: "Baghdad",
    facility: `${prefix} facility`,
    category: "fitness",
    tiers: ["M"],
    startsAt: checkedInAt,
    endsAt: new Date(checkedInAt.getTime() + 60 * 60_000),
    cancellationDeadline: checkedInAt,
    capacity: 10,
  });
  await db.insert(reservations).values({
    id: reservationIds[index],
    userId,
    offeringId: id,
    status: "confirmed",
  });
  await db.insert(attendance).values({
    id: attendanceIds[index],
    reservationId: reservationIds[index],
    userId,
    offeringId: id,
    checkedInAt,
    verifiedBy: `${prefix}-partner`,
    status,
    settlementEligible,
  });
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (createdChallengeId) await db.delete(fitnessChallenges).where(eq(fitnessChallenges.id, createdChallengeId));
  await db.delete(attendance).where(inArray(attendance.id, attendanceIds));
  await db.delete(reservations).where(inArray(reservations.id, reservationIds));
  await db.delete(offerings).where(inArray(offerings.id, offerIds));
  await db.delete(memberConsentEvents).where(inArray(memberConsentEvents.userId, [memberId, otherMemberId]));
  await db.delete(operators).where(eq(operators.userId, superAdminId));
  await pool.end();
});

test("fitness challenges keep progress private, count one day across sources, and require Super Admin management", async () => {
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
  await db.insert(operators).values({ userId: superAdminId, role: "super_admin", partnerId: null });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const today = iraqToday();
  const startDate = addCalendarDays(today, -3);
  const endDate = addCalendarDays(today, 2);
  const adminPath = "/super-admin/fitness-challenges";
  const memberPath = "/member/fitness-challenges";
  assert.equal((await call(adminPath, memberId)).status, 403);
  assert.equal((await call(memberPath, otherMemberId)).status, 200);

  const invalid = await call(adminPath, superAdminId, "POST", input(startDate, today, 8));
  assert.equal(invalid.status, 400);
  const created = await call(adminPath, superAdminId, "POST", input(startDate, endDate, 4));
  assert.equal(created.status, 201);
  assert.equal((created.data as { status: string }).status, "draft");
  // The id is server-generated, so publish the created row's actual ID.
  const id = (created.data as { id: string }).id;
  assert.ok(id);
  createdChallengeId = id;
  assert.equal((await call(`${adminPath}/${id}/publish`, superAdminId, "POST")).status, 200);
  assert.equal((await call(`${adminPath}/${id}`, superAdminId, "PUT", input(startDate, endDate, 4))).status, 409);

  const beforeJoin = await call(memberPath, memberId);
  const visible = beforeJoin.data as Array<{
    id: string; joined: boolean; activeDays: number; canJoin: boolean;
  }>;
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.joined, false);
  assert.equal(visible[0]?.activeDays, 0);
  assert.equal(visible[0]?.canJoin, true);

  const joinPath = `/member/fitness-challenges/${id}/join`;
  assert.equal((await call(joinPath, memberId, "POST")).status, 200);
  const participant = await db.select().from(fitnessChallengeParticipants).where(and(
    eq(fitnessChallengeParticipants.challengeId, id),
    eq(fitnessChallengeParticipants.userId, memberId),
  ));
  assert.equal(participant.length, 1);
  await db.update(fitnessChallengeParticipants).set({
    joinedAt: iraqDayBounds(startDate).start,
  }).where(eq(fitnessChallengeParticipants.id, participant[0]!.id));

  const logPath = `/member/fitness-challenges/${id}/log-today`;
  assert.equal((await call(logPath, memberId, "POST")).status, 200);
  const todayBounds = iraqDayBounds(today);
  await addAttendance(0, memberId, new Date(todayBounds.start.getTime() + 2 * 60 * 60_000), "confirmed", true);
  await addAttendance(1, memberId, iraqDayBounds(addCalendarDays(today, -1)).start, "confirmed", true);
  await addAttendance(2, memberId, iraqDayBounds(addCalendarDays(today, -2)).start, "pending", false);
  assert.equal((await call(logPath, memberId, "POST")).status, 409);
  const afterAttendance = await call(memberPath, memberId);
  const memberChallenge = (afterAttendance.data as Array<{
    id: string; activeDays: number; selfLoggedDates: string[]; verifiedAttendanceDates: string[];
  }>).find(challenge => challenge.id === id);
  assert.equal(memberChallenge?.activeDays, 2);
  assert.deepEqual(memberChallenge?.verifiedAttendanceDates, [addCalendarDays(today, -1), today]);
  assert.deepEqual(memberChallenge?.selfLoggedDates, [today]);
  const otherMemberView = await call(memberPath, otherMemberId);
  const otherMemberChallenge = (otherMemberView.data as Array<{
    id: string; joined: boolean; activeDays: number; selfLoggedDates: string[];
  }>).find(challenge => challenge.id === id);
  assert.equal(otherMemberChallenge?.joined, false);
  assert.equal(otherMemberChallenge?.activeDays, 0);
  assert.deepEqual(otherMemberChallenge?.selfLoggedDates, []);

  assert.equal((await call(logPath, memberId, "DELETE")).status, 204);
  const afterUndo = await call(memberPath, memberId);
  const stillCounted = (afterUndo.data as Array<{ id: string; activeDays: number; selfLoggedDates: string[] }>)
    .find(challenge => challenge.id === id);
  assert.equal(stillCounted?.activeDays, 2);
  assert.deepEqual(stillCounted?.selfLoggedDates, []);

  const adminList = await call(adminPath, superAdminId);
  assert.equal(adminList.status, 200);
  assert.equal((adminList.data as unknown[]).length, 1);
  assert.equal(JSON.stringify(adminList.data).includes(memberId), false);
  assert.equal((await call(`${adminPath}/${id}/archive`, superAdminId, "POST")).status, 200);
  const archivedView = await call(memberPath, memberId);
  const archivedChallenge = (archivedView.data as Array<{
    id: string; status: string; activeDays: number; canLogToday: boolean;
  }>).find(challenge => challenge.id === id);
  assert.equal(archivedChallenge?.status, "archived");
  assert.equal(archivedChallenge?.activeDays, 2);
  assert.equal(archivedChallenge?.canLogToday, false);
  assert.equal((await call(`/member/fitness-challenges/${id}/participation`, memberId, "DELETE")).status, 204);
  assert.deepEqual(await call(memberPath, memberId), { status: 200, data: [] });
  assert.equal(
    (await db.select().from(fitnessChallengeSelfReports).where(eq(fitnessChallengeSelfReports.userId, memberId))).length,
    0,
  );
});
