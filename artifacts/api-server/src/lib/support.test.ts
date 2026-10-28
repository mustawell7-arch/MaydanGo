import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, pool, memberNotificationPreferences, memberships, offerings, operationAudit, operators, partners,
  pushDeliveries, pushDevices, reservations, supportTickets,
} from "@workspace/db";
import memberRouter from "../routes/member";
import staffSupportRouter from "../routes/support";
import { sendMemberNotification } from "./notifications";

const prefix = `support-test-${randomUUID()}`;
const alice = `${prefix}-member`;
const bob = `${prefix}-other`;
const adminId = `${prefix}-admin`;
const supportId = `${prefix}-support`;
const partnerId = `${prefix}-partner`;
const newAgentId = `${prefix}-new-agent`;
const livePartnerId = `${prefix}-live-partner`;
const ticketIds: string[] = [];
const offeringIds: string[] = [];
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
  await db.delete(pushDeliveries).where(eq(pushDeliveries.userId, alice));
  await db.delete(pushDevices).where(eq(pushDevices.userId, alice));
  await db.delete(memberNotificationPreferences).where(eq(memberNotificationPreferences.userId, alice));
  await db.delete(reservations).where(eq(reservations.userId, alice));
  await db.delete(memberships).where(eq(memberships.userId, alice));
  if (offeringIds.length) await db.delete(offerings).where(inArray(offerings.id, offeringIds));
  await db.delete(partners).where(eq(partners.id, livePartnerId));
  await db.delete(operators).where(inArray(operators.userId, [adminId, supportId, partnerId, newAgentId]));
  await db.delete(operationAudit).where(inArray(operationAudit.actorId, [adminId, supportId]));
  await pool.end();
});

test("support conversations are private, triaged, audited, and replyable", async () => {
  await db.insert(operators).values([
    { userId: adminId, role: "admin", partnerId: null },
    { userId: supportId, role: "support", partnerId: null },
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
  assert.equal((await call(`/member/support/tickets/${created.data.id}`, bob)).status, 404);
  assert.equal((await call(`/member/support/tickets/${created.data.id}`, undefined)).status, 401);
  assert.equal((await call("/support/staff/tickets", partnerId)).status, 403);

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
  const memberView = await call(`/member/support/tickets/${created.data.id}`, alice);
  assert.equal(memberView.status, 200);
  assert.equal(memberView.data.messages.length, 2);
  assert.equal(memberView.data.messages[1].authorRole, "support");
  assert.equal("memberUserId" in memberView.data, false);
  assert.equal((await call(`/member/support/tickets/${created.data.id}`, bob)).status, 404);

  const memberReply = await call(`/member/support/tickets/${created.data.id}/replies`, alice, "POST", {
    message: "Thank you, I can see it now.", language: "ar",
  });
  assert.equal(memberReply.status, 201);
  assert.equal(memberReply.data.status, "in_progress");

  const closed = await call(`/support/staff/tickets/${created.data.id}`, adminId, "PATCH", { status: "closed" });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, "closed");
  assert.ok(closed.data.events.some((event: { nextStatus: string | null }) => event.nextStatus === "closed"));
  const auditRows = await db.select().from(operationAudit)
    .where(and(eq(operationAudit.actorId, adminId), eq(operationAudit.targetId, created.data.id)));
  assert.ok(auditRows.some(row => row.action === "support.ticket.update"));
  assert.equal((await call("/support/staff/agents", supportId)).status, 200);
  const newAgent = await call("/support/staff/agents", adminId, "POST", { userId: newAgentId });
  assert.equal(newAgent.status, 201);
  assert.equal((await call("/support/staff/agents", supportId, "POST", { userId: `${prefix}-forbidden-agent` })).status, 403);
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

  const originalFetch = globalThis.fetch;
  let expoCalls = 0;
  let simulateFailure = false;
  const payloads: Array<Array<{ title: string; body: string }>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://exp.host/")) {
      expoCalls++;
      const messages = JSON.parse(String(init?.body)) as Array<{ title: string; body: string }>;
      payloads.push(messages);
      if (simulateFailure) throw new Error("Simulated Expo transport failure.");
      return new Response(JSON.stringify({ data: messages.map((_, index) => ({ status: "ok", id: `accepted-${index}` })) }), {
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

  simulateFailure = true;
  const booking = await call("/member/bookings", alice, "POST", { kind: "session", targetId: offeringId, slot: "" });
  assert.equal(booking.status, 201);
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

  const membership = await db.select().from(memberships).where(and(eq(memberships.userId, alice), eq(memberships.scope, "live"))).limit(1);
  assert.equal(membership[0]?.paymentStatus, "not_required");
  const beforeOptOutCalls = expoCalls;
  const disabled = await call("/member/notifications/settings", alice, "PUT", { pushEnabled: false, language: "ku" });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.data.pushEnabled, false);
  const delivery = await sendMemberNotification(alice, "support_status");
  assert.equal(delivery.status, "skipped");
  assert.equal(expoCalls, beforeOptOutCalls);
  assert.equal((await call("/member/notifications/settings", bob, "GET")).data.pushEnabled, false);
});
