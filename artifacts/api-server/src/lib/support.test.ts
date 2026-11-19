import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  attendance, attendanceEvents, db, pool, memberNotificationPreferences, memberships, offerings,
  memberConsentEvents, operationAudit, operators, partners, pushDeliveries, pushDevices, reservations, supportTickets,
  supportResponseTemplates,
} from "@workspace/db";
import memberRouter from "../routes/member";
import staffSupportRouter from "../routes/support";
import {
  checkPendingPushReceipts, refreshUrgentAlertFallbackStatus, retryPendingPushDeliveries,
  sendMemberNotification, sendUrgentEscalationReminder, URGENT_UNASSIGNED_ESCALATION_DELAY_MS,
} from "./notifications";
import { MEMBER_POLICY_VERSIONS } from "./member-consents";

const prefix = `support-test-${randomUUID()}`;
const alice = `${prefix}-member`;
const bob = `${prefix}-other`;
const adminId = `${prefix}-admin`;
const supportId = `${prefix}-support`;
const partnerId = `${prefix}-partner`;
const newAgentId = `${prefix}-new-agent`;
const removableAgentId = `${prefix}-removable-agent`;
const livePartnerId = `${prefix}-live-partner`;
const ticketIds: string[] = [];
const responseTemplateIds: string[] = [];
const offeringIds: string[] = [];
const testReservationIds: string[] = [];
const testAttendanceIds: string[] = [];
let server: Server | null = null;
let restoreFetch: (() => void) | null = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { auth: Object.assign(
    () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true },
  ) });
  next();
});
app.use("/member", memberRouter);
app.use("/support/staff", staffSupportRouter);

const call = async (path: string, user?: string, method = "GET", body?: unknown) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) headers["x-test-user"] = user;
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as any };
};

after(async () => {
  restoreFetch?.();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (ticketIds.length) await db.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
  await db.delete(memberConsentEvents).where(eq(memberConsentEvents.userId, alice));
  if (responseTemplateIds.length) {
    await db.delete(supportResponseTemplates).where(inArray(supportResponseTemplates.id, responseTemplateIds));
  }
  const notificationUsers = [alice, adminId, supportId, partnerId];
  await db.delete(pushDeliveries).where(inArray(pushDeliveries.userId, notificationUsers));
  await db.delete(pushDevices).where(inArray(pushDevices.userId, notificationUsers));
  await db.delete(memberNotificationPreferences).where(inArray(memberNotificationPreferences.userId, notificationUsers));
  if (testReservationIds.length) {
    await db.delete(attendanceEvents).where(inArray(attendanceEvents.reservationId, testReservationIds));
  }
  if (testAttendanceIds.length) {
    await db.delete(attendance).where(inArray(attendance.id, testAttendanceIds));
  }
  if (testReservationIds.length) {
    await db.delete(reservations).where(inArray(reservations.id, testReservationIds));
  }
  await db.delete(reservations).where(eq(reservations.userId, alice));
  await db.delete(memberships).where(eq(memberships.userId, alice));
  if (offeringIds.length) await db.delete(offerings).where(inArray(offerings.id, offeringIds));
  await db.delete(partners).where(eq(partners.id, livePartnerId));
  await db.delete(operators).where(inArray(operators.userId, [adminId, supportId, partnerId, newAgentId, removableAgentId]));
  // operation_audit is append-only; randomized test records are intentionally retained.
  await pool.end();
});

test("support conversations are private, triaged, audited, and replyable", async () => {
  await db.insert(operators).values([
    { userId: adminId, role: "customer_support_admin", partnerId: null },
    { userId: supportId, role: "support", partnerId: null, receiveUrgentAlerts: true },
    { userId: partnerId, role: "partner", partnerId: null },
  ]);
  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const created = await call("/member/support/tickets", alice, "POST", {
    subject: "Booking needs help", category: "booking",
    message: "My reservation is not appearing in my account.", language: "ku",
  });
  assert.equal(created.status, 201);
  ticketIds.push(created.data.id);
  assert.equal(created.data.status, "open");
  assert.equal(created.data.messages[0].authorRole, "member");
  const pdfSupportCategories = [
    "membership", "payment", "booking", "checkin", "facility", "course", "live_class",
    "refund", "event", "corporate_membership", "technical_issue", "account_security",
    "account", "access", "safety", "other",
  ];
  for (const category of pdfSupportCategories) {
    const categoryTicket = await call("/member/support/tickets", alice, "POST", {
      subject: `Help with ${category}`,
      category,
      message: `Please help me with this ${category} question.`,
      language: "en",
    });
    assert.equal(categoryTicket.status, 201, `support category ${category} should be accepted`);
    assert.equal(categoryTicket.data.category, category);
    ticketIds.push(categoryTicket.data.id);
  }
  const invalidCategory = await call("/member/support/tickets", alice, "POST", {
    subject: "Help with something",
    category: "not_a_support_category",
    message: "Please help me with this question.",
    language: "en",
  });
  assert.equal(invalidCategory.status, 400);
  assert.equal((await call(`/member/support/tickets/${created.data.id}`, bob)).status, 404);
  assert.equal((await call(`/member/support/tickets/${created.data.id}`, undefined)).status, 401);
  assert.equal((await call("/support/staff/tickets", partnerId)).status, 403);
  const templatesPath = "/support/staff/response-templates";
  const translations = {
    en: { title: "Booking update", body: "We are checking your booking and will update you shortly." },
    ar: { title: "تحديث الحجز", body: "نتحقق من حجزك وسنوافيك بالتحديث قريباً." },
    ku: { title: "نوێکاریی حجز", body: "ئێستا حجزەکەت دەپشکنین و بەزوویی ئاگادارت دەکەینەوە." },
  };
  assert.equal((await call(templatesPath, alice)).status, 403);
  assert.equal((await call(templatesPath, supportId, "POST", { translations })).status, 403);
  assert.equal((await call(templatesPath, adminId, "POST", { translations: {
    ...translations, ku: { title: "", body: "" },
  } })).status, 400);
  const createdTemplate = await call(templatesPath, adminId, "POST", { translations });
  assert.equal(createdTemplate.status, 201);
  responseTemplateIds.push(createdTemplate.data.id);
  assert.equal(createdTemplate.data.active, true);
  assert.equal(createdTemplate.data.translations.ku.body, translations.ku.body);
  assert.equal((await call(templatesPath, supportId)).data.some(
    (template: { id: string }) => template.id === createdTemplate.data.id,
  ), true);
  const changedTranslations = {
    ...translations,
    en: { ...translations.en, body: "We are reviewing your booking details and will reply shortly." },
  };
  const updatedTemplate = await call(`${templatesPath}/${createdTemplate.data.id}`, adminId, "PATCH", {
    translations: changedTranslations, active: true,
  });
  assert.equal(updatedTemplate.status, 200);
  assert.equal(updatedTemplate.data.translations.en.body, changedTranslations.en.body);
  assert.equal((await call(`${templatesPath}/${createdTemplate.data.id}`, supportId, "PATCH", {
    translations, active: true,
  })).status, 403);
  const archivedTemplate = await call(`${templatesPath}/${createdTemplate.data.id}`, adminId, "DELETE");
  assert.equal(archivedTemplate.status, 200);
  assert.equal(archivedTemplate.data.active, false);
  assert.equal((await call(templatesPath, supportId)).data.find(
    (template: { id: string }) => template.id === createdTemplate.data.id,
  ).active, false);
  const reactivatedTemplate = await call(`${templatesPath}/${createdTemplate.data.id}`, adminId, "PATCH", {
    translations, active: true,
  });
  assert.equal(reactivatedTemplate.data.active, true);

  const linkOfferingId = `${prefix}-support-link-offering`;
  const bookingId = `${prefix}-support-link-booking`;
  const otherBookingId = `${prefix}-support-link-other-booking`;
  const checkinId = `${prefix}-support-link-checkin`;
  offeringIds.push(linkOfferingId);
  testReservationIds.push(bookingId, otherBookingId);
  testAttendanceIds.push(checkinId);
  const sessionStart = new Date(Date.now() - 60 * 60 * 1000);
  await db.insert(offerings).values({
    id: linkOfferingId, targetId: linkOfferingId, kind: "session", slot: "", title: "Support link session",
    scope: "live", accessType: "physical", active: true, city: "baghdad", facility: "Test facility",
    category: "fitness", tiers: ["M"], startsAt: sessionStart,
    endsAt: new Date(sessionStart.getTime() + 30 * 60 * 1000),
    cancellationDeadline: sessionStart, capacity: 4,
  });
  await db.insert(reservations).values([
    { id: bookingId, userId: alice, offeringId: linkOfferingId, status: "confirmed" },
    { id: otherBookingId, userId: bob, offeringId: linkOfferingId, status: "confirmed" },
  ]);
  await db.insert(attendance).values({
    id: checkinId, userId: alice, offeringId: linkOfferingId, checkedInAt: new Date(sessionStart.getTime() + 5 * 60 * 1000),
    verifiedBy: supportId, reservationId: bookingId, status: "confirmed", settlementEligible: false,
  });
  const availableRelatedRecords = await call(`/support/staff/tickets/${created.data.id}/related-records`, supportId);
  assert.equal(availableRelatedRecords.status, 200);
  assert.equal(availableRelatedRecords.data.records.length, 2);
  assert.ok(availableRelatedRecords.data.records.every((record: { id: string }) => record.id !== otherBookingId));
  assert.equal((await call(`/support/staff/tickets/${created.data.id}/related-records`, alice)).status, 403);

  const supportDeviceId = randomUUID();
  const supportToken = `ExpoPushToken[${randomUUID().replaceAll("-", "")}]`;
  const adminToken = `ExpoPushToken[${randomUUID().replaceAll("-", "")}]`;
  const partnerToken = `ExpoPushToken[${randomUUID().replaceAll("-", "")}]`;
  await db.insert(memberNotificationPreferences).values([
    { userId: adminId, pushEnabled: true, language: "en" },
    { userId: supportId, pushEnabled: true, language: "ku" },
    { userId: partnerId, pushEnabled: true, language: "en" },
  ]);
  await db.insert(pushDevices).values([
    { id: randomUUID(), userId: adminId, token: adminToken, platform: "ios", enabled: true },
    { id: supportDeviceId, userId: supportId, token: supportToken, platform: "ios", enabled: true },
    { id: randomUUID(), userId: partnerId, token: partnerToken, platform: "ios", enabled: true },
  ]);
  const agentRoster = await call("/support/staff/agents", adminId);
  const adminReadiness = agentRoster.data.find((agent: { userId: string }) => agent.userId === adminId);
  const supportReadiness = agentRoster.data.find((agent: { userId: string }) => agent.userId === supportId);
  assert.equal(adminReadiness?.receiveUrgentAlerts, false);
  assert.equal(adminReadiness?.pushEnabled, true);
  assert.equal(adminReadiness?.activeDeviceCount, 1);
  assert.equal(supportReadiness?.receiveUrgentAlerts, true);
  assert.equal(supportReadiness?.pushEnabled, true);
  assert.equal(supportReadiness?.activeDeviceCount, 1);
  assert.doesNotMatch(JSON.stringify(agentRoster.data), /ExpoPushToken/);
  await db.update(pushDevices).set({ enabled: false }).where(eq(pushDevices.id, supportDeviceId));
  const noActiveDeviceRoster = await call("/support/staff/agents", adminId);
  assert.equal(noActiveDeviceRoster.data.find((agent: { userId: string }) => agent.userId === supportId)?.activeDeviceCount, 0);
  await db.update(pushDevices).set({ enabled: true }).where(eq(pushDevices.id, supportDeviceId));
  const supportRoster = await call("/support/staff/agents", supportId);
  const supportRosterRow = supportRoster.data.find((agent: { userId: string }) => agent.userId === supportId);
  assert.equal(Object.hasOwn(supportRosterRow, "pushEnabled"), false);
  assert.equal(Object.hasOwn(supportRosterRow, "activeDeviceCount"), false);
  const originalFetch = globalThis.fetch;
  const urgentAlertPayloads: any[][] = [];
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://exp.host/--/api/v2/push/send")) {
      const messages = JSON.parse(String(init?.body)) as any[];
      urgentAlertPayloads.push(messages);
      return new Response(JSON.stringify({ data: messages.map((_, index) => ({
        status: "ok", id: `urgent-alert-${index}`,
      })) }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  let urgentSafety: { status: number; data: any } | null = null;
  try {
    urgentSafety = await call("/member/support/tickets", alice, "POST", {
      subject: "Urgent safety concern", category: "safety",
      message: "A serious safety concern needs MaydanGo support review.", language: "ar", urgent: true,
    });
    for (let attempt = 0; attempt < 50 && !urgentAlertPayloads.length; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(urgentSafety);
  assert.equal(urgentSafety.status, 201);
  ticketIds.push(urgentSafety.data.id);
  assert.equal(urgentSafety.data.urgent, true);
  for (let attempt = 0; attempt < 50; attempt++) {
    const alert = await db.select({ id: pushDeliveries.id }).from(pushDeliveries)
      .where(and(
        eq(pushDeliveries.userId, supportId),
        eq(pushDeliveries.kind, "support_urgent"),
        eq(pushDeliveries.dedupeKey, `support-urgent:${urgentSafety.data.id}:${supportDeviceId}`),
      )).limit(1);
    if (alert.length) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(urgentAlertPayloads.length, 1);
  assert.equal(urgentAlertPayloads[0][0].to, supportToken);
  assert.deepEqual(urgentAlertPayloads[0][0].data, {
    kind: "support_urgent",
    ticketId: urgentSafety.data.id,
  });
  assert.match(urgentAlertPayloads[0][0].body, /ڕاپۆرتێکی پەلەیی/);
  assert.equal((await db.select({ id: pushDeliveries.id }).from(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, partnerId), eq(pushDeliveries.kind, "support_urgent")))).length, 0);
  assert.equal((await db.select({ id: pushDeliveries.id }).from(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, adminId), eq(pushDeliveries.kind, "support_urgent")))).length, 0);
  const initialUrgentOutcomes = await call("/support/staff/urgent-alert-delivery-outcomes", adminId);
  assert.equal(initialUrgentOutcomes.status, 200);
  const acceptedUrgentOutcome = initialUrgentOutcomes.data.find((outcome: {
    ticketId: string; recipientUserId: string; kind: string;
  }) => outcome.ticketId === urgentSafety.data.id
    && outcome.recipientUserId === supportId && outcome.kind === "support_urgent");
  assert.equal(acceptedUrgentOutcome?.sendStatus, "accepted");
  assert.equal(acceptedUrgentOutcome?.acceptedDeviceCount, 1);
  assert.equal(acceptedUrgentOutcome?.receiptStatus, "pending");
  assert.equal((await call("/support/staff/urgent-alert-delivery-outcomes", supportId)).status, 403);
  assert.doesNotMatch(JSON.stringify(initialUrgentOutcomes.data), /ExpoPushToken|providerTicketId|deviceId|subject|body/);

  const retryTicketId = randomUUID();
  const retryDedupeKey = `support-urgent-retry:${retryTicketId}`;
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://exp.host/--/api/v2/push/send")) {
      assert.equal(JSON.parse(String(init?.body))[0].data.ticketId, retryTicketId);
      return new Response("rate limited", { status: 429 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    assert.equal((await sendMemberNotification(supportId, "support_urgent", {
      ticketId: retryTicketId, dedupeKey: retryDedupeKey,
    })).status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
  const [retryableUrgentDelivery] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.dedupeKey, `${retryDedupeKey}:${supportDeviceId}`));
  assert.equal(retryableUrgentDelivery?.status, "retry_pending");
  assert.deepEqual(retryableUrgentDelivery?.payloadData, { ticketId: retryTicketId });
  let retriedAlertData: unknown;
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://exp.host/--/api/v2/push/send")) {
      retriedAlertData = JSON.parse(String(init?.body))[0].data;
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "urgent-alert-retried" }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    assert.equal(await retryPendingPushDeliveries(new Date(Date.now() + 60_000)), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(retriedAlertData, { kind: "support_urgent", ticketId: retryTicketId });

  const regularSafety = await call("/member/support/tickets", bob, "POST", {
    subject: "Safety follow-up", category: "safety",
    message: "A non-urgent safety question for the support team.", language: "en",
  });
  assert.equal(regularSafety.status, 201);
  ticketIds.push(regularSafety.data.id);
  assert.equal(regularSafety.data.urgent, false);
  await db.update(supportTickets).set({ lastMessageAt: new Date(Date.now() + 60_000) })
    .where(eq(supportTickets.id, regularSafety.data.id));
  const rejectedUrgency = await call("/member/support/tickets", alice, "POST", {
    subject: "Urgent booking question", category: "booking",
    message: "Urgent priority must not be used for a booking-only request.", language: "en", urgent: true,
  });
  assert.equal(rejectedUrgency.status, 400);
  const queue = await call("/support/staff/tickets", supportId);
  assert.equal(queue.data[0].id, urgentSafety.data.id);
  assert.equal(queue.data[0].urgent, true);
  assert.equal(queue.data[0].urgentAlertStatus, "accepted");
  assert.equal((await call("/member/support/tickets", alice)).data[0].urgent, true);

  await db.update(memberNotificationPreferences).set({ pushEnabled: false })
    .where(eq(memberNotificationPreferences.userId, supportId));
  const noPushFallback = await call("/member/support/tickets", alice, "POST", {
    subject: "Safety alert without push", category: "safety",
    message: "This urgent report verifies the in-app fallback status.", language: "en", urgent: true,
  });
  assert.equal(noPushFallback.status, 201);
  ticketIds.push(noPushFallback.data.id);
  assert.equal(Object.hasOwn(noPushFallback.data, "urgentAlertStatus"), false);
  let fallbackDetail: { status: number; data: any } | null = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    fallbackDetail = await call(`/support/staff/tickets/${noPushFallback.data.id}`, supportId);
    if (fallbackDetail.data.urgentAlertStatus === "fallback_required") break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(fallbackDetail?.data.urgentAlertStatus, "fallback_required");
  await db.update(memberNotificationPreferences).set({ pushEnabled: true })
    .where(eq(memberNotificationPreferences.userId, supportId));

  const [urgentDelivery] = await db.select().from(pushDeliveries).where(and(
    eq(pushDeliveries.kind, "support_urgent"),
    eq(pushDeliveries.dedupeKey, `support-urgent:${urgentSafety.data.id}:${supportDeviceId}`),
  ));
  assert.ok(urgentDelivery?.providerTicketId);
  await db.update(pushDeliveries).set({
    status: "sent", receiptStatus: "ok", receiptError: null, receiptCheckedAt: new Date(),
  }).where(eq(pushDeliveries.id, urgentDelivery!.id));
  const receiptSuccessOutcomes = await call("/support/staff/urgent-alert-delivery-outcomes", adminId);
  const receiptSuccess = receiptSuccessOutcomes.data.find((outcome: { ticketId: string; kind: string }) =>
    outcome.ticketId === urgentSafety.data.id && outcome.kind === "support_urgent");
  assert.equal(receiptSuccess?.receiptStatus, "no_error");
  assert.equal(receiptSuccess?.receiptOkCount, 1);
  await db.update(pushDeliveries).set({
    status: "failed", error: "DeviceNotRegistered", receiptStatus: "error", receiptError: "DeviceNotRegistered",
  }).where(eq(pushDeliveries.id, urgentDelivery!.id));
  const receiptFailureOutcomes = await call("/support/staff/urgent-alert-delivery-outcomes", adminId);
  const receiptFailure = receiptFailureOutcomes.data.find((outcome: { ticketId: string; kind: string }) =>
    outcome.ticketId === urgentSafety.data.id && outcome.kind === "support_urgent");
  assert.equal(receiptFailure?.sendStatus, "failed");
  assert.equal(receiptFailure?.failedDeviceCount, 1);
  assert.equal(receiptFailure?.receiptStatus, "error");
  assert.equal(receiptFailure?.receiptErrorCount, 1);
  await refreshUrgentAlertFallbackStatus(urgentSafety.data.id);
  const receiptFallback = await call(`/support/staff/tickets/${urgentSafety.data.id}`, supportId);
  assert.equal(receiptFallback.data.urgentAlertStatus, "fallback_required");

  const assigned = await call(`/support/staff/tickets/${created.data.id}`, supportId, "PATCH", {
    assignedTo: supportId, status: "in_progress",
  });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.data.assignedTo, supportId);
  assert.equal(assigned.data.status, "in_progress");
  assert.ok(assigned.data.events.some((event: { action: string }) => event.action === "assigned"));
  assert.ok(assigned.data.events.some((event: { action: string }) => event.action === "status_changed"));

  const response = await call(`/support/staff/tickets/${created.data.id}/replies`, supportId, "POST", {
    message: "We are checking the reservation now.", language: "en",
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.status, "waiting_member");
  const linkedBooking = await call(`/support/staff/tickets/${created.data.id}/links`, supportId, "POST", {
    recordType: "booking", recordId: bookingId,
  });
  assert.equal(linkedBooking.status, 201);
  const bookingLinkId = linkedBooking.data.records.find((record: { id: string; recordType: string }) =>
    record.id === bookingId && record.recordType === "booking",
  )?.linkId;
  assert.ok(bookingLinkId);
  const linkedCheckin = await call(`/support/staff/tickets/${created.data.id}/links`, supportId, "POST", {
    recordType: "checkin", recordId: checkinId,
  });
  assert.equal(linkedCheckin.status, 201);
  assert.ok(linkedCheckin.data.records.find((record: { id: string; recordType: string }) =>
    record.id === checkinId && record.recordType === "checkin",
  )?.linkId);
  assert.equal((await call(`/support/staff/tickets/${created.data.id}/links`, supportId, "POST", {
    recordType: "booking", recordId: otherBookingId,
  })).status, 404);
  const unlinkedBooking = await call(
    `/support/staff/tickets/${created.data.id}/links/${bookingLinkId}`, supportId, "DELETE",
  );
  assert.equal(unlinkedBooking.status, 200);
  assert.equal(unlinkedBooking.data.records.find((record: { id: string; recordType: string }) =>
    record.id === bookingId && record.recordType === "booking",
  )?.linkId, null);
  const internalNote = await call(`/support/staff/tickets/${created.data.id}/notes`, supportId, "POST", {
    message: "Confirm the partner schedule before replying.",
  });
  assert.equal(internalNote.status, 201);
  assert.equal(internalNote.data.status, response.data.status);
  assert.equal(internalNote.data.lastMessageAt, response.data.lastMessageAt);
  assert.equal(internalNote.data.messages.at(-1).isInternal, true);
  assert.equal(internalNote.data.messages.at(-1).message, "Confirm the partner schedule before replying.");
  assert.equal((await call(`/support/staff/tickets/${created.data.id}/notes`, partnerId, "POST", {
    message: "This should be rejected.",
  })).status, 403);
  const escalationPath = `/support/staff/tickets/${created.data.id}/escalations`;
  const escalationReason = "Please review the partner schedule conflict internally.";
  assert.equal((await call(escalationPath, alice)).status, 403);
  assert.equal((await call(escalationPath, partnerId, "POST", {
    targetUserId: adminId, reason: escalationReason,
  })).status, 403);
  assert.equal((await call(escalationPath, supportId, "POST", {
    targetUserId: partnerId, reason: escalationReason,
  })).status, 400);
  assert.equal((await call(escalationPath, supportId, "POST", {
    targetUserId: adminId, reason: "          ",
  })).status, 400);
  const raisedCase = await call(escalationPath, supportId, "POST", {
    targetUserId: adminId, reason: escalationReason,
  });
  assert.equal(raisedCase.status, 201);
  const escalationId = raisedCase.data[0].id;
  assert.equal((await call(escalationPath, supportId)).data[0].id, escalationId);
  assert.equal((await call(escalationPath, supportId, "POST", {
    targetUserId: adminId, reason: escalationReason,
  })).status, 409);
  const escalatedQueue = await call("/support/staff/tickets", adminId);
  assert.equal(escalatedQueue.data.find((item: { id: string }) => item.id === created.data.id).hasActiveEscalation, true);
  assert.equal(escalatedQueue.data.find((item: { id: string }) => item.id === created.data.id).assignedTo, adminId);
  assert.equal((await call(`/support/staff/tickets/${created.data.id}`, adminId, "PATCH", { status: "closed" })).status, 409);
  assert.equal((await call(`/support/staff/tickets/${created.data.id}`, adminId, "PATCH", { assignedTo: supportId })).status, 409);
  assert.equal((await call(`${escalationPath}/${escalationId}/resolve`, supportId, "POST", {
    resolution: "This sender must not resolve the receiving administrator's escalation.",
  })).status, 403);
  const resolvedCase = await call(`${escalationPath}/${escalationId}/resolve`, adminId, "POST", {
    resolution: "Checked the schedule and explained the correction to support.",
  });
  assert.equal(resolvedCase.status, 200);
  assert.equal(resolvedCase.data[0].resolvedBy, adminId);
  assert.ok(resolvedCase.data[0].resolvedAt);
  assert.equal((await call(`${escalationPath}/${escalationId}/resolve`, adminId, "POST", {
    resolution: "This repeated resolution must be rejected.",
  })).status, 409);
  const toSupport = await call(escalationPath, adminId, "POST", { targetUserId: supportId, reason: escalationReason });
  const supportEscalation = toSupport.data.find((item: { resolvedAt: string | null }) => !item.resolvedAt);
  assert.equal((await call(`${escalationPath}/${supportEscalation.id}/resolve`, supportId, "POST", {
    resolution: "Confirmed the corrected schedule with the partner.",
  })).status, 200);
  assert.equal((await call("/support/staff/tickets", supportId)).data.find(
    (item: { id: string }) => item.id === created.data.id,
  ).hasActiveEscalation, false);
  const memberView = await call(`/member/support/tickets/${created.data.id}`, alice);
  assert.equal(memberView.status, 200);
  assert.equal(memberView.data.messages.length, 2);
  assert.equal(memberView.data.messages[1].authorRole, "support");
  assert.ok(memberView.data.messages.every((message: { message: string; isInternal?: boolean }) =>
    !message.isInternal && !message.message.includes("Confirm the partner schedule"),
  ));
  assert.equal("memberUserId" in memberView.data, false);
  assert.equal("records" in memberView.data, false);
  assert.equal("escalations" in memberView.data, false);
  assert.equal(JSON.stringify(memberView.data).includes(escalationReason), false);
  assert.equal(memberView.data.lastMessageAt, response.data.lastMessageAt);
  assert.equal((await call(`/member/support/tickets/${created.data.id}`, bob)).status, 404);

  const memberReply = await call(`/member/support/tickets/${created.data.id}/replies`, alice, "POST", {
    message: "Thank you, I can see it now.", language: "ar",
  });
  assert.equal(memberReply.status, 201);
  assert.equal(memberReply.data.status, "in_progress");
  assert.equal(memberReply.data.messages.at(-1).language, created.data.language);
  assert.ok(memberReply.data.events.some((event: { action: string; nextStatus: string | null }) =>
    event.action === "member_reopened" && event.nextStatus === "in_progress"));
  assert.equal((await call(`/member/support/tickets/${created.data.id}/replies`, bob, "POST", {
    message: "This reply must not be added to another account's ticket.", language: "en",
  })).status, 404);

  const closed = await call(`/support/staff/tickets/${created.data.id}`, adminId, "PATCH", { status: "closed" });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, "closed");
  assert.equal((await call(escalationPath, supportId, "POST", {
    targetUserId: adminId, reason: escalationReason,
  })).status, 409);
  assert.ok(closed.data.events.some((event: { nextStatus: string | null }) => event.nextStatus === "closed"));
  const auditRows = await db.select().from(operationAudit)
    .where(and(eq(operationAudit.actorId, adminId), eq(operationAudit.targetId, created.data.id)));
  assert.ok(auditRows.some(row => row.action === "support.ticket.update"));
  const supportAuditRows = await db.select().from(operationAudit)
    .where(and(eq(operationAudit.actorId, supportId), eq(operationAudit.targetId, created.data.id)));
  assert.ok(supportAuditRows.some(row => row.action === "support.ticket.internal_note"));
  assert.ok(supportAuditRows.some(row => row.action === "support.ticket.link_record"));
  assert.ok(supportAuditRows.some(row => row.action === "support.ticket.unlink_record"));
  assert.equal((await call("/support/staff/agents", supportId)).status, 200);
  const newAgent = await call("/support/staff/agents", adminId, "POST", { userId: newAgentId });
  assert.equal(newAgent.status, 201);
  assert.equal(newAgent.data.receiveUrgentAlerts, false);
  assert.equal((await call(`/support/staff/agents/${newAgentId}/urgent-alerts`, supportId, "PATCH", {
    receiveUrgentAlerts: true,
  })).status, 403);
  const enabledNewAgent = await call(`/support/staff/agents/${newAgentId}/urgent-alerts`, adminId, "PATCH", {
    receiveUrgentAlerts: true,
  });
  assert.equal(enabledNewAgent.status, 200);
  assert.equal(enabledNewAgent.data.receiveUrgentAlerts, true);
  const disabledNewAgent = await call(`/support/staff/agents/${newAgentId}/urgent-alerts`, adminId, "PATCH", {
    receiveUrgentAlerts: false,
  });
  assert.equal(disabledNewAgent.status, 200);
  assert.equal(disabledNewAgent.data.receiveUrgentAlerts, false);
  const recipientHistory = await call("/support/staff/urgent-alert-recipient-history", adminId);
  assert.equal(recipientHistory.status, 200);
  const newAgentHistory = recipientHistory.data.filter((event: { recipientUserId: string }) =>
    event.recipientUserId === newAgentId);
  assert.deepEqual(newAgentHistory.map((event: { fromReceiving: boolean; toReceiving: boolean }) => [
    event.fromReceiving, event.toReceiving,
  ]).sort((left: boolean[], right: boolean[]) => Number(left[0]) - Number(right[0])), [
    [false, true],
    [true, false],
  ]);
  assert.ok(newAgentHistory.every((event: { actorId: string }) => event.actorId === adminId));
  assert.ok(newAgentHistory.every((event: Record<string, unknown>) => !("detail" in event)));
  assert.equal((await call("/support/staff/urgent-alert-recipient-history", supportId)).status, 403);
  const protectedLastRecipient = await call(`/support/staff/agents/${supportId}/urgent-alerts`, adminId, "PATCH", {
    receiveUrgentAlerts: false,
  });
  assert.equal(protectedLastRecipient.status, 409);
  assert.equal((await call(`/support/staff/agents/${supportId}`, adminId, "DELETE")).status, 409);
  assert.equal((await call("/support/staff/agents", adminId, "POST", { userId: newAgentId })).status, 409);
  const grantAudit = await db.select().from(operationAudit)
    .where(and(eq(operationAudit.actorId, adminId), eq(operationAudit.targetId, newAgentId)));
  assert.ok(grantAudit.some(row => row.action === "support.agent.add"));
  assert.equal((await call("/support/staff/agents", supportId, "POST", { userId: `${prefix}-forbidden-agent` })).status, 403);
  assert.equal((await call("/support/staff/agents", adminId, "POST", { userId: "invalid/agent-id" })).status, 400);

  const removableAgent = await call("/support/staff/agents", adminId, "POST", { userId: removableAgentId });
  assert.equal(removableAgent.status, 201);
  const assignedToRemovable = await call(`/support/staff/tickets/${created.data.id}`, adminId, "PATCH", {
    assignedTo: removableAgentId,
  });
  assert.equal(assignedToRemovable.status, 200);
  assert.equal(assignedToRemovable.data.assignedTo, removableAgentId);
  assert.equal((await call(`/support/staff/agents/${encodeURIComponent(adminId)}`, adminId, "DELETE")).status, 409);
  assert.equal((await call(`/support/staff/agents/${encodeURIComponent(removableAgentId)}`, supportId, "DELETE")).status, 403);

  const removed = await call(`/support/staff/agents/${encodeURIComponent(removableAgentId)}`, adminId, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal(removed.data.userId, removableAgentId);
  assert.equal((await call("/support/staff/tickets", removableAgentId)).status, 403);
  const rosterAfterRemoval = await call("/support/staff/agents", adminId);
  assert.equal(rosterAfterRemoval.data.some((agent: { userId: string }) => agent.userId === removableAgentId), false);
  const retainedTicket = await call(`/support/staff/tickets/${created.data.id}`, adminId);
  assert.equal(retainedTicket.status, 200);
  assert.equal(retainedTicket.data.assignedTo, removableAgentId);
  assert.equal((await call(`/support/staff/tickets/${created.data.id}`, adminId, "PATCH", {
    assignedTo: removableAgentId,
  })).status, 400);
  const revokeAudit = await db.select().from(operationAudit)
    .where(and(eq(operationAudit.actorId, adminId), eq(operationAudit.targetId, removableAgentId)));
  assert.ok(revokeAudit.some(row => row.action === "support.agent.remove"));
  const accessHistory = await call("/support/staff/access-history", adminId);
  assert.equal(accessHistory.status, 200);
  const newAgentAccess = accessHistory.data.filter((event: { targetUserId: string }) =>
    event.targetUserId === newAgentId);
  assert.deepEqual(newAgentAccess.map((event: { action: string }) => event.action), ["granted"]);
  const removableAgentAccess = accessHistory.data.filter((event: { targetUserId: string }) =>
    event.targetUserId === removableAgentId);
  assert.deepEqual(removableAgentAccess.map((event: { action: string }) => event.action), ["removed", "granted"]);
  assert.ok([...newAgentAccess, ...removableAgentAccess].every((event: { actorId: string }) => event.actorId === adminId));
  assert.ok(accessHistory.data.every((event: Record<string, unknown>) => !("detail" in event)));
  assert.equal((await call("/support/staff/access-history", supportId)).status, 403);
});

test("push opt-out is respected, and provider failure stays visible without changing live booking state", async () => {
  const offeringId = `${prefix}-offering`;
  offeringIds.push(offeringId);
  await db.insert(partners).values({
    id: livePartnerId, name: "Support test partner", groupId: prefix,
    ownerUserId: partnerId, approved: true,
  });
  await db.insert(offerings).values({
    id: offeringId, targetId: offeringId, kind: "session", slot: "", title: "Test session",
    scope: "live", partnerId: livePartnerId, partnerGroup: prefix, accessType: "physical",
    active: true, city: "baghdad", facility: "test", category: "fitness",
    tiers: ["M"], startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000),
    cancellationDeadline: new Date(Date.now() + 80000000), capacity: 3,
  });
  await db.insert(memberships).values({
    userId: alice, scope: "live", status: "trial", paymentStatus: "not_required", source: "trial", tier: "M",
    startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 7 * 86400000),
    rules: { quota: 8, dailyLimit: 3, trialAllowedTypes: ["physical"] },
  });
  await db.insert(memberConsentEvents).values((["terms_of_use", "privacy_policy"] as const).map(purpose => ({
    id: `${prefix}-consent-${purpose}`,
    userId: alice,
    purpose,
    policyVersion: MEMBER_POLICY_VERSIONS[purpose],
    choice: "accepted" as const,
  })));

  const originalFetch = globalThis.fetch;
  let expoCalls = 0;
  let simulateFailure = false;
  let receiptResponses: Record<string, { status: string; message?: string; details?: { error?: string } }> = {};
  const payloads: Array<Array<{ title: string; body: string }>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/push/getReceipts")) {
      return new Response(JSON.stringify({ data: receiptResponses }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/push/send")) {
      expoCalls++;
      const messages = JSON.parse(String(init?.body)) as Array<{ title: string; body: string }>;
      payloads.push(messages);
      if (simulateFailure) throw new Error("Simulated Expo transport failure.");
      return new Response(JSON.stringify({ data: messages.map((_, index) => ({
        status: "ok", id: `accepted-${expoCalls}-${index}`,
      })) }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  restoreFetch = () => { globalThis.fetch = originalFetch; };

  const registered = await call("/member/notifications/devices", alice, "POST", {
    token: `ExpoPushToken[${randomUUID().replaceAll("-", "")}]`, platform: "ios", language: "ar",
  });
  assert.equal(registered.status, 200);
  assert.equal(registered.data.pushEnabled, true);
  assert.equal(registered.data.registeredDevices, 1);
  assert.equal((await sendMemberNotification(alice, "support_reply")).status, "sent");
  assert.match(payloads[0][0].body, /رد جديد/);
  const languageChanged = await call("/member/notifications/settings", alice, "PUT", { pushEnabled: true, language: "ku" });
  assert.equal(languageChanged.status, 200);
  assert.equal((await sendMemberNotification(alice, "attendance_updated")).status, "sent");
  assert.match(payloads[1][0].body, /تۆماری ئامادەبوونت/);
  const reminderContext = { remainingMinutes: 7, dedupeKey: `waitlist-reminder:${randomUUID()}` };
  assert.equal((await sendMemberNotification(alice, "waitlist_reminder", reminderContext)).status, "sent");
  assert.match(payloads[2][0].body, /خولەک/);
  const callsAfterReminder = expoCalls;
  const duplicateReminder = await sendMemberNotification(alice, "waitlist_reminder", reminderContext);
  assert.deepEqual(duplicateReminder, { status: "skipped", reason: "already_recorded" });
  assert.equal(expoCalls, callsAfterReminder);
  await call("/member/notifications/settings", alice, "PUT", { pushEnabled: true, language: "en" });
  assert.equal((await sendMemberNotification(alice, "waitlist_reminder", {
    remainingMinutes: 7, dedupeKey: `waitlist-reminder:${randomUUID()}`,
  })).status, "sent");
  assert.match(payloads[3][0].body, /7 minutes/);
  await call("/member/notifications/settings", alice, "PUT", { pushEnabled: true, language: "ar" });
  assert.equal((await sendMemberNotification(alice, "waitlist_reminder", {
    remainingMinutes: 7, dedupeKey: `waitlist-reminder:${randomUUID()}`,
  })).status, "sent");
  assert.match(payloads[4][0].body, /دقائق/);

  simulateFailure = true;
  const booking = await call("/member/bookings", alice, "POST", { kind: "session", targetId: offeringId, slot: "" });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.ok(booking.data.bookings.some((row: { targetId: string; status: string }) => row.targetId === offeringId && row.status === "reserved"));
  let failed: { status: number; data: any } | null = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await call("/support/staff/notification-failures", supportId);
    if (result.data.some((row: { userId: string }) => row.userId === alice)) { failed = result; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(expoCalls > 0);

  assert.ok(failed);
  assert.equal(failed.status, 200);
  const visibleFailure = failed.data.find((row: { userId: string }) => row.userId === alice);
  assert.ok(visibleFailure);
  assert.equal(visibleFailure.status, "failed");
  assert.match(visibleFailure.error, /Simulated Expo transport failure/);
  assert.doesNotMatch(JSON.stringify(visibleFailure), /ExpoPushToken/);

  simulateFailure = false;
  const retryDedupeKey = `notification-retry:${randomUUID()}`;
  assert.equal((await sendMemberNotification(alice, "support_status", { dedupeKey: retryDedupeKey })).status, "sent");
  const [retryDelivery] = await db.select().from(pushDeliveries)
    .where(and(eq(pushDeliveries.userId, alice), eq(pushDeliveries.kind, "support_status")));
  assert.ok(retryDelivery?.providerTicketId);
  receiptResponses = {
    [retryDelivery.providerTicketId!]: {
      status: "error", message: "Rate limited.", details: { error: "MessageRateExceeded" },
    },
  };
  await checkPendingPushReceipts(new Date(Date.now() + 16 * 60_000));
  const [scheduledRetry] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.id, retryDelivery.id));
  assert.equal(scheduledRetry?.status, "retry_pending");
  assert.equal(scheduledRetry?.attemptCount, 1);
  assert.equal(scheduledRetry?.receiptStatus, "error");
  const visibleRetry = await call("/support/staff/notification-failures", supportId);
  const visibleScheduledRetry = visibleRetry.data.find((row: { id: string }) => row.id === retryDelivery.id);
  assert.equal(visibleScheduledRetry?.status, "retry_pending");
  assert.ok(visibleScheduledRetry?.nextAttemptAt);

  const [reservedBeforeRetry] = await db.select().from(reservations)
    .where(and(eq(reservations.userId, alice), eq(reservations.offeringId, offeringId)));
  assert.equal(reservedBeforeRetry?.status, "reserved");
  const [membershipBeforeRetry] = await db.select().from(memberships)
    .where(and(eq(memberships.userId, alice), eq(memberships.scope, "live")));
  assert.equal(membershipBeforeRetry?.paymentStatus, "not_required");
  const attendanceBeforeRetry = await db.select().from(attendance)
    .where(eq(attendance.reservationId, reservedBeforeRetry!.id));
  const attendanceEventsBeforeRetry = await db.select().from(attendanceEvents)
    .where(eq(attendanceEvents.reservationId, reservedBeforeRetry!.id));
  const retryCount = await retryPendingPushDeliveries(new Date(Date.now() + 20 * 60_000));
  assert.equal(retryCount, 1);
  const [retriedDelivery] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.id, retryDelivery.id));
  assert.equal(retriedDelivery?.status, "sent");
  assert.equal(retriedDelivery?.attemptCount, 2);
  assert.notEqual(retriedDelivery?.providerTicketId, retryDelivery.providerTicketId);
  const duplicateRetry = await sendMemberNotification(alice, "support_status", { dedupeKey: retryDedupeKey });
  assert.deepEqual(duplicateRetry, { status: "skipped", reason: "already_recorded" });
  const rowsForRetry = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.dedupeKey, `${retryDedupeKey}:${retryDelivery.deviceId}`));
  assert.equal(rowsForRetry.length, 1);

  receiptResponses = {
    [retriedDelivery!.providerTicketId!]: { status: "ok" },
  };
  await checkPendingPushReceipts(new Date(Date.now() + 37 * 60_000));
  const [receiptVerifiedDelivery] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.id, retryDelivery.id));
  assert.equal(receiptVerifiedDelivery?.receiptStatus, "ok");

  const unresolvedDedupeKey = `notification-unresolved:${randomUUID()}`;
  assert.equal((await sendMemberNotification(alice, "support_reply", {
    dedupeKey: unresolvedDedupeKey,
  })).status, "sent");
  const [unresolvedDelivery] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.dedupeKey, `${unresolvedDedupeKey}:${retryDelivery.deviceId}`));
  receiptResponses = {};
  for (const minutesAhead of [16, 32, 48]) {
    await checkPendingPushReceipts(new Date(Date.now() + minutesAhead * 60_000));
  }
  const [unresolvedReceipt] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.id, unresolvedDelivery!.id));
  assert.equal(unresolvedReceipt?.receiptStatus, "unavailable");
  const visibleUnresolved = await call("/support/staff/notification-failures", supportId);
  assert.ok(visibleUnresolved.data.some((row: { id: string; receiptStatus: string }) =>
    row.id === unresolvedDelivery?.id && row.receiptStatus === "unavailable"));

  const permanentDedupeKey = `notification-permanent:${randomUUID()}`;
  assert.equal((await sendMemberNotification(alice, "attendance_updated", {
    dedupeKey: permanentDedupeKey,
  })).status, "sent");
  const [permanentDelivery] = await db.select().from(pushDeliveries)
    .where(eq(pushDeliveries.dedupeKey, `${permanentDedupeKey}:${retryDelivery.deviceId}`));
  assert.ok(permanentDelivery?.providerTicketId);
  receiptResponses = {
    [permanentDelivery.providerTicketId!]: {
      status: "error", message: "Device is no longer registered.", details: { error: "DeviceNotRegistered" },
    },
  };
  await checkPendingPushReceipts(new Date(Date.now() + 20 * 60_000));
  const [disabledDevice] = await db.select().from(pushDevices).where(eq(pushDevices.id, retryDelivery.deviceId));
  assert.equal(disabledDevice?.enabled, false);
  const [disabledPreferences] = await db.select().from(memberNotificationPreferences)
    .where(eq(memberNotificationPreferences.userId, alice));
  assert.equal(disabledPreferences?.pushEnabled, false);
  const visiblePermanentFailure = await call("/support/staff/notification-failures", supportId);
  const permanentFailure = visiblePermanentFailure.data.find((row: { id: string }) => row.id === permanentDelivery?.id);
  assert.equal(permanentFailure?.status, "failed");
  assert.equal(permanentFailure?.receiptStatus, "error");
  assert.match(permanentFailure?.error ?? "", /DeviceNotRegistered/);

  const [reservedAfterRetry] = await db.select().from(reservations)
    .where(eq(reservations.id, reservedBeforeRetry!.id));
  assert.equal(reservedAfterRetry?.status, reservedBeforeRetry?.status);
  const attendanceAfterRetry = await db.select().from(attendance)
    .where(eq(attendance.reservationId, reservedBeforeRetry!.id));
  const attendanceEventsAfterRetry = await db.select().from(attendanceEvents)
    .where(eq(attendanceEvents.reservationId, reservedBeforeRetry!.id));
  assert.deepEqual(attendanceAfterRetry, attendanceBeforeRetry);
  assert.deepEqual(attendanceEventsAfterRetry, attendanceEventsBeforeRetry);

  const membership = await db.select().from(memberships).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live"))).limit(1);
  assert.equal(membership[0]?.paymentStatus, membershipBeforeRetry?.paymentStatus);
  const beforeOptOutCalls = expoCalls;
  const disabled = await call("/member/notifications/settings", alice, "PUT", { pushEnabled: false, language: "ku" });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.data.pushEnabled, false);
  const delivery = await sendMemberNotification(alice, "support_status");
  assert.equal(delivery.status, "skipped");
  assert.equal(expoCalls, beforeOptOutCalls);
  assert.equal((await call("/member/notifications/settings", bob, "GET")).data.pushEnabled, false);

  const [urgentTicketForEscalation] = await db.select().from(supportTickets).where(and(
    eq(supportTickets.userId, alice),
    eq(supportTickets.urgent, true),
  )).limit(1);
  assert.ok(urgentTicketForEscalation);
  const escalationTicketId = urgentTicketForEscalation.id;
  const tooEarlyAt = new Date(Date.now() - URGENT_UNASSIGNED_ESCALATION_DELAY_MS + 60_000);
  await db.update(supportTickets).set({ createdAt: tooEarlyAt }).where(eq(supportTickets.id, escalationTicketId));
  assert.equal(await sendUrgentEscalationReminder(escalationTicketId, [supportId]), false);

  const overdueAt = new Date(Date.now() - URGENT_UNASSIGNED_ESCALATION_DELAY_MS - 60_000);
  await db.update(supportTickets).set({ createdAt: overdueAt, assignedTo: supportId })
    .where(eq(supportTickets.id, escalationTicketId));
  assert.equal(await sendUrgentEscalationReminder(escalationTicketId, [supportId]), false);
  await db.update(supportTickets).set({ assignedTo: null }).where(eq(supportTickets.id, escalationTicketId));
  const overdueQueue = await call("/support/staff/tickets", supportId);
  const overdueTicket = overdueQueue.data.find((ticket: { id: string }) => ticket.id === escalationTicketId);
  assert.equal(overdueTicket?.urgentOverdue, true);
  const memberTicket = await call(`/member/support/tickets/${escalationTicketId}`, alice);
  assert.equal(Object.hasOwn(memberTicket.data, "urgentOverdue"), false);

  const escalationPayloads: any[][] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://exp.host/--/api/v2/push/send")) {
      const messages = JSON.parse(String(init?.body)) as any[];
      escalationPayloads.push(messages);
      return new Response(JSON.stringify({ data: messages.map((_, index) => ({
        status: "ok", id: `urgent-escalation-${index}`,
      })) }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return previousFetch(input, init);
  }) as typeof fetch;
  try {
    assert.equal(await sendUrgentEscalationReminder(escalationTicketId, [supportId]), true);
    assert.equal(escalationPayloads.length, 1);
    assert.equal(escalationPayloads[0][0].data.kind, "support_urgent_escalation");
    assert.equal(escalationPayloads[0][0].data.ticketId, escalationTicketId);
    assert.match(escalationPayloads[0][0].body, /30 خولەک/);
    assert.doesNotMatch(escalationPayloads[0][0].body, /serious safety concern/);
    assert.equal(await sendUrgentEscalationReminder(escalationTicketId, [supportId]), false);
    const [escalatedTicket] = await db.select().from(supportTickets)
      .where(eq(supportTickets.id, escalationTicketId));
    assert.ok(escalatedTicket?.urgentEscalatedAt);
    const escalationAudit = await db.select().from(operationAudit).where(and(
      eq(operationAudit.targetId, escalationTicketId),
      eq(operationAudit.action, "support.ticket.urgent_escalation"),
    ));
    assert.equal(escalationAudit.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
