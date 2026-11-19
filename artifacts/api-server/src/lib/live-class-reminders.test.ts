import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  db, memberNotificationPreferences, offerings, pushDeliveries, pushDevices, reservations,
} from "@workspace/db";
import { processLiveClassReminders } from "./live-class-reminders";

test("live-class reminders notify eligible bookings once and skip canceled or ineligible bookings", async () => {
  const prefix = `test-live-reminder-${randomUUID()}`;
  const offeringIds: string[] = [];
  const reservationIds: string[] = [];
  const userIds: string[] = [];
  const originalFetch = globalThis.fetch;
  const pushPayloads: Array<Array<{ title: string; body: string; data: Record<string, string> }>> = [];
  let fetchCalls = 0;

  const now = new Date();
  const startsAt = new Date(now.getTime() + 35 * 60_000);
  const insertOffering = async (suffix: string, additionalPayment = false, start = startsAt) => {
    const id = `${prefix}-${suffix}`;
    offeringIds.push(id);
    await db.insert(offerings).values({
      id,
      targetId: id,
      kind: "session",
      slot: "",
      title: "Live class reminder test",
      scope: "live",
      active: true,
      accessType: "live",
      bookingModel: "live_class",
      city: "baghdad",
      facility: "test",
      category: "wellness",
      tiers: ["M"],
      startsAt: start,
      endsAt: new Date(start.getTime() + 60 * 60_000),
      cancellationDeadline: new Date(start.getTime() - 10 * 60_000),
      capacity: 10,
      additionalPayment,
    });
    return id;
  };
  const insertReservation = async (offeringId: string, suffix: string, status: "reserved" | "requested" | "cancelled") => {
    const id = `${prefix}-reservation-${suffix}`;
    const userId = `${prefix}-user-${suffix}`;
    reservationIds.push(id);
    userIds.push(userId);
    await db.insert(reservations).values({ id, userId, offeringId, status });
    return { id, userId };
  };

  try {
    globalThis.fetch = (async (input, init) => {
      if (String(input).startsWith("https://exp.host/--/api/v2/push/send")) {
        fetchCalls++;
        pushPayloads.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: [{ status: "ok", id: `test-ticket-${fetchCalls}` }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const eligibleOffering = await insertOffering("eligible");
    const paidOffering = await insertOffering("paid", true);
    const outsideWindowOffering = await insertOffering("outside", false, new Date(now.getTime() + 90 * 60_000));
    const eligible = await insertReservation(eligibleOffering, "eligible", "reserved");
    await insertReservation(paidOffering, "paid", "reserved");
    await insertReservation(outsideWindowOffering, "outside", "reserved");
    await insertReservation(eligibleOffering, "requested", "requested");
    await insertReservation(eligibleOffering, "cancelled", "cancelled");

    const deviceId = `${prefix}-device`;
    await db.insert(memberNotificationPreferences).values({
      userId: eligible.userId, pushEnabled: true, language: "ku",
    });
    await db.insert(pushDevices).values({
      id: deviceId,
      userId: eligible.userId,
      token: `ExpoPushToken[${randomUUID().replaceAll("-", "")}]`,
      platform: "ios",
      enabled: true,
    });

    const first = await processLiveClassReminders(now);
    assert.deepEqual(first, { candidates: 1, sent: 1, failed: 0, skipped: 0 });
    assert.match(pushPayloads[0][0].title, /بیرخستنەوە/);
    assert.match(pushPayloads[0][0].body, /ماوەی کاتژمێرێکی داهاتوودا/);
    assert.equal(pushPayloads[0][0].data.reservationId, eligible.id);
    assert.equal(pushPayloads[0][0].data.kind, "live_class_reminder");

    const duplicate = await processLiveClassReminders(now);
    assert.deepEqual(duplicate, { candidates: 1, sent: 0, failed: 0, skipped: 1 });
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (userIds.length) {
      await db.delete(pushDeliveries).where(inArray(pushDeliveries.userId, userIds));
      await db.delete(pushDevices).where(inArray(pushDevices.userId, userIds));
      await db.delete(memberNotificationPreferences).where(inArray(memberNotificationPreferences.userId, userIds));
    }
    if (reservationIds.length) await db.delete(reservations).where(inArray(reservations.id, reservationIds));
    if (offeringIds.length) await db.delete(offerings).where(inArray(offerings.id, offeringIds));
  }
});
