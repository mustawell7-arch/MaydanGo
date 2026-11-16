import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  attendance, attendanceEvents, db, facilityProfiles, memberNotificationPreferences,
  operationAudit, offerings, operators, partners, pool, pushDeliveries, pushDevices,
  reservations, waitlistEntries,
} from "@workspace/db";
import operationsRouter from "./operations";

const prefix = `recurring-offering-test-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const partnerUserId = `${prefix}-operator`;
const adminUserId = `${prefix}-admin`;
const profileId = `${prefix}-facility`;
const memberOne = `${prefix}-member-one`;
const memberTwo = `${prefix}-member-two`;
const deviceId = `${prefix}-device`;
const actorIds = [partnerUserId, adminUserId];
const memberIds = [memberOne, memberTwo];
let server: Server | null = null;
let createdOfferingIds: string[] = [];
const originalFetch = globalThis.fetch;

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

const localDate = (value: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  globalThis.fetch = originalFetch;
  if (createdOfferingIds.length) {
    await db.delete(attendanceEvents).where(inArray(attendanceEvents.reservationId,
      db.select({ id: reservations.id }).from(reservations).where(inArray(reservations.offeringId, createdOfferingIds))));
    await db.delete(attendance).where(inArray(attendance.offeringId, createdOfferingIds));
    await db.delete(waitlistEntries).where(inArray(waitlistEntries.offeringId, createdOfferingIds));
    await db.delete(reservations).where(inArray(reservations.offeringId, createdOfferingIds));
    await db.delete(pushDeliveries).where(inArray(pushDeliveries.userId, memberIds));
    await db.delete(offerings).where(inArray(offerings.id, createdOfferingIds));
  }
  await db.delete(pushDevices).where(inArray(pushDevices.id, [deviceId]));
  await db.delete(memberNotificationPreferences).where(inArray(memberNotificationPreferences.userId, memberIds));
  // operation_audit is append-only; randomized test records are intentionally retained.
  await db.delete(facilityProfiles).where(eq(facilityProfiles.id, profileId));
  await db.delete(operators).where(inArray(operators.userId, actorIds));
  await db.delete(partners).where(eq(partners.id, partnerId));
  await pool.end();
});

test("recurring sessions stay bounded, approved, booking-safe, editable, cancellable, and notify members", async () => {
  await db.insert(partners).values({
    id: partnerId, name: prefix, groupId: prefix, ownerUserId: partnerUserId, approved: true,
  });
  await db.insert(operators).values([
    { userId: partnerUserId, role: "partner", partnerId },
    { userId: adminUserId, role: "admin", partnerId: null },
  ]);
  await db.insert(facilityProfiles).values({
    id: profileId,
    partnerId,
    city: "Baghdad",
    facility: "Studio",
    localizedName: { en: "Test studio", ar: "استوديو اختبار", ku: "ستۆدیۆی تاقیکردنەوە" },
    localizedDistrict: { en: "Test district", ar: "منطقة اختبار", ku: "ناوچەی تاقیکردنەوە" },
    localizedAddress: { en: "Test address", ar: "عنوان اختبار", ku: "ناونیشانی تاقیکردنەوە" },
    localizedDescription: { en: "Test facility", ar: "مرفق اختبار", ku: "شوێنی تاقیکردنەوە" },
    activities: [{ en: "fitness", ar: "لياقة", ku: "وەرزش" }], amenities: [], accessibility: [],
    openingHours: Array.from({ length: 7 }, (_, day) => ({ day, closed: true, opensAt: null, closesAt: null })),
    contactPhone: null, websiteUrl: null, latitude: null, longitude: null,
  });
  await db.insert(memberNotificationPreferences).values({ userId: memberOne, pushEnabled: true, language: "en" });
  await db.insert(pushDevices).values({
    id: deviceId, userId: memberOne, token: `ExponentPushToken[${prefix}]`, platform: "ios", enabled: true,
  });

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://exp.host/--/api/v2/push/send") {
      return new Response(JSON.stringify({ data: [{ status: "ok", id: `${prefix}-ticket` }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const template = {
    partnerId,
    title: "Recurring test class",
    kind: "session",
    city: "Baghdad",
    facility: "Studio",
    category: "fitness",
    accessType: "physical",
    tiers: ["M"],
    startsAt: "2099-01-04T09:00:00+03:00",
    endsAt: "2099-01-04T10:00:00+03:00",
    cancellationDeadline: "2099-01-04T08:00:00+03:00",
    capacity: 2,
    active: false,
  };
  const schedule = {
    mode: "daily",
    interval: 1,
    repeatUntil: "2099-01-07",
    excludedDates: ["2099-01-05"],
  };

  const activationAttempt = await call("/operations/offerings/recurring", partnerUserId, "POST", {
    template: { ...template, active: true }, schedule,
  });
  assert.equal(activationAttempt.status, 403);
  const missingFacility = await call("/operations/offerings/recurring", partnerUserId, "POST", {
    template: { ...template, facility: "Unapproved facility" }, schedule,
  });
  assert.equal(missingFacility.status, 400);

  const created = await call("/operations/offerings/recurring", partnerUserId, "POST", { template, schedule });
  assert.equal(created.status, 201);
  const createdRows = created.data as Array<{
    id: string; active: boolean; recurrenceGroupId: string; startsAt: string;
  }>;
  createdOfferingIds = createdRows.map(row => row.id);
  assert.equal(createdRows.length, 3);
  assert.ok(createdRows.every(row => row.active === false));
  assert.equal(new Set(createdRows.map(row => row.recurrenceGroupId)).size, 1);
  assert.deepEqual(createdRows.map(row => localDate(row.startsAt)), ["2099-01-04", "2099-01-06", "2099-01-07"]);

  const beforeConflict = await db.select({ id: offerings.id }).from(offerings).where(eq(offerings.partnerId, partnerId));
  const conflictAttempt = await call("/operations/offerings/recurring", partnerUserId, "POST", {
    template: {
      ...template,
      startsAt: "2099-01-05T09:00:00+03:00",
      endsAt: "2099-01-05T10:00:00+03:00",
      cancellationDeadline: "2099-01-05T08:00:00+03:00",
    },
    schedule: { mode: "dates", interval: 1, repeatUntil: "2099-01-08", dates: ["2099-01-06", "2099-01-08"] },
  });
  assert.equal(conflictAttempt.status, 409);
  assert.deepEqual(conflictAttempt.data, { conflictingDates: ["2099-01-06"] });
  const crossPartnerAttempt = await call("/operations/offerings/recurring", partnerUserId, "POST", {
    template: { ...template, partnerId: `${prefix}-other-partner` },
    schedule,
  });
  assert.equal(crossPartnerAttempt.status, 403);
  const afterConflict = await db.select({ id: offerings.id }).from(offerings).where(eq(offerings.partnerId, partnerId));
  assert.equal(afterConflict.length, beforeConflict.length);

  await db.insert(reservations).values([
    { id: `${prefix}-reservation-one`, userId: memberOne, offeringId: createdRows[0].id, status: "reserved" },
    { id: `${prefix}-reservation-two`, userId: memberTwo, offeringId: createdRows[0].id, status: "reserved" },
  ]);
  const capacityConflict = await call(`/operations/offerings/${createdRows[0].id}/series`, partnerUserId, "PATCH", {
    capacity: 1,
  });
  assert.equal(capacityConflict.status, 409);

  const firstStart = new Date(createdRows[0].startsAt);
  const shift = 60 * 60 * 1000;
  const seriesUpdate = await call(`/operations/offerings/${createdRows[0].id}/series`, partnerUserId, "PATCH", {
    capacity: 2,
    startsAt: new Date(firstStart.getTime() + shift).toISOString(),
    endsAt: new Date(firstStart.getTime() + shift + 60 * 60 * 1000).toISOString(),
    cancellationDeadline: new Date(firstStart.getTime() + shift - 60 * 60 * 1000).toISOString(),
  });
  assert.equal(seriesUpdate.status, 200);
  const shiftedRows = seriesUpdate.data as Array<{ id: string; startsAt: string }>;
  assert.equal(shiftedRows.length, 3);
  assert.ok(shiftedRows.every(row => new Date(row.startsAt).getTime() - new Date(createdRows.find(item => item.id === row.id)!.startsAt).getTime() === shift));
  const [booking] = await db.select().from(reservations).where(eq(reservations.id, `${prefix}-reservation-one`));
  assert.equal(booking.status, "reserved");
  assert.equal(booking.offeringId, createdRows[0].id);
  const scheduleDeliveries = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.userId, memberOne));
  assert.ok(scheduleDeliveries.some(delivery => delivery.kind === "schedule_changed" && delivery.status === "sent"));

  const last = shiftedRows[2];
  const lastStart = new Date(last.startsAt);
  const singleUpdate = await call(`/operations/offerings/${last.id}`, partnerUserId, "PATCH", {
    capacity: 2,
    startsAt: new Date(lastStart.getTime() + 30 * 60 * 1000).toISOString(),
    endsAt: new Date(lastStart.getTime() + 90 * 60 * 1000).toISOString(),
    cancellationDeadline: new Date(lastStart.getTime() - 30 * 60 * 1000).toISOString(),
  });
  assert.equal(singleUpdate.status, 200);
  const rowsAfterSingleEdit = await db.select().from(offerings).where(inArray(offerings.id, createdOfferingIds));
  assert.equal(rowsAfterSingleEdit.find(row => row.id === last.id)!.startsAt.getTime(), lastStart.getTime() + 30 * 60 * 1000);
  assert.equal(rowsAfterSingleEdit.find(row => row.id === shiftedRows[0].id)!.startsAt.getTime(), new Date(shiftedRows[0].startsAt).getTime());

  await db.insert(attendance).values({
    id: `${prefix}-attendance-protected`,
    userId: memberTwo,
    offeringId: shiftedRows[1].id,
    checkedInAt: new Date(shiftedRows[1].startsAt),
    verifiedBy: partnerUserId,
    status: "confirmed",
    settlementEligible: false,
  });
  const blockedSeriesEdit = await call(`/operations/offerings/${shiftedRows[0].id}/series`, partnerUserId, "PATCH", {
    capacity: 2,
    startsAt: new Date(firstStart.getTime() + shift + 30 * 60 * 1000).toISOString(),
    endsAt: new Date(firstStart.getTime() + shift + 90 * 60 * 1000).toISOString(),
    cancellationDeadline: new Date(firstStart.getTime() + shift - 30 * 60 * 1000).toISOString(),
  });
  assert.equal(blockedSeriesEdit.status, 409);
  const afterBlockedEdit = await db.select().from(offerings).where(inArray(offerings.id, createdOfferingIds));
  assert.ok(rowsAfterSingleEdit.every(row =>
    afterBlockedEdit.find(after => after.id === row.id)!.startsAt.getTime() === row.startsAt.getTime(),
  ));
  const cancellation = await call(`/operations/offerings/${shiftedRows[0].id}/series/cancel`, partnerUserId, "POST");
  assert.equal(cancellation.status, 200);
  assert.deepEqual(cancellation.data, {
    ok: true,
    cancelledDates: ["2099-01-07"],
    preservedDates: ["2099-01-04", "2099-01-06"],
  });
  const finalRows = await db.select().from(offerings).where(inArray(offerings.id, createdOfferingIds));
  assert.equal(finalRows.find(row => row.id === shiftedRows[0].id)!.cancelledAt, null);
  assert.equal(finalRows.find(row => row.id === shiftedRows[1].id)!.cancelledAt, null);
  assert.ok(finalRows.find(row => row.id === shiftedRows[2].id)!.cancelledAt);
  const finalReservations = await db.select().from(reservations).where(inArray(reservations.offeringId, createdOfferingIds));
  assert.ok(finalReservations.every(row => row.status === "reserved"));
  const finalAttendance = await db.select().from(attendance).where(inArray(attendance.offeringId, createdOfferingIds));
  assert.equal(finalAttendance.length, 1);
  assert.equal(finalAttendance[0].status, "confirmed");
  const cancellationAudits = (await db.select().from(operationAudit).where(eq(operationAudit.actorId, partnerUserId)))
    .filter(event => event.action === "offering.cancel.series");
  assert.deepEqual(cancellationAudits.map(event => event.targetId), [shiftedRows[2].id]);
  const cancellationDeliveries = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.userId, memberOne));
  assert.equal(cancellationDeliveries.some(delivery => delivery.kind === "booking_cancelled"), false);
});
