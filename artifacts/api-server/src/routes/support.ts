import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  memberNotificationPreferences,
  operationAudit,
  operators,
  pushDeliveries,
  pushDevices,
  supportMessages,
  supportTicketEvents,
  supportTickets,
} from "@workspace/db";
import { BookingError } from "../lib/reservations";
import {
  sendMemberNotification,
  URGENT_UNASSIGNED_ESCALATION_DELAY_MS,
} from "../lib/notifications";
import {
  approveMemberDeviceChange,
  DeviceSecurityError,
  listPendingMemberDeviceChanges,
} from "../lib/member-device-security";

export const memberSupportRouter = Router();
const staffRouter = Router();
const languageSchema = z.enum(["en", "ar", "ku"]);
const ticketStatusSchema = z.enum(["open", "in_progress", "waiting_member", "resolved", "closed"]);
const ticketCategorySchema = z.enum(["booking", "account", "access", "safety", "other"]);
const activeTicketStatuses = new Set(["open", "in_progress", "waiting_member"]);

function isUrgentOverdue(ticket: typeof supportTickets.$inferSelect, now = new Date()) {
  return ticket.urgent
    && !ticket.assignedTo
    && activeTicketStatuses.has(ticket.status)
    && now.getTime() - ticket.createdAt.getTime() >= URGENT_UNASSIGNED_ESCALATION_DELAY_MS;
}

function parseUrgentRecipientTransition(detail: string) {
  const match = detail.match(/from=(true|false);to=(true|false)$/);
  if (match) {
    return { fromReceiving: match[1] === "true", toReceiving: match[2] === "true" };
  }
  if (detail.includes("Urgent safety alerts enabled for staff member.")) {
    return { fromReceiving: false, toReceiving: true };
  }
  if (detail.includes("Urgent safety alerts disabled for staff member.")) {
    return { fromReceiving: true, toReceiving: false };
  }
  return null;
}

function userId(req: Request) {
  const id = getAuth(req).userId;
  if (!id) throw new BookingError(401, "Sign in to contact MaydanGO support.");
  return id;
}

async function memberTicketDetail(ownerId: string, id: string) {
  const [ticket] = await db.select().from(supportTickets)
    .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, ownerId))).limit(1);
  if (!ticket) throw new BookingError(404, "Support request not found.");
  const [messages, events] = await Promise.all([
    db.select().from(supportMessages).where(eq(supportMessages.ticketId, id)).orderBy(asc(supportMessages.createdAt)),
    db.select().from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, id)).orderBy(asc(supportTicketEvents.createdAt)),
  ]);
  return {
    id: ticket.id, subject: ticket.subject, category: ticket.category, urgent: ticket.urgent, status: ticket.status,
    language: ticket.language, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, lastMessageAt: ticket.lastMessageAt,
    messages: messages.map(m => ({ id: m.id, authorRole: m.authorRole, message: m.body, language: m.language, createdAt: m.createdAt })),
    events: events.map(e => ({
      action: e.action, previousStatus: e.previousStatus, nextStatus: e.nextStatus, createdAt: e.createdAt,
    })),
  };
}

async function staffTicketDetail(id: string) {
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  if (!ticket) throw new BookingError(404, "Support request not found.");
  const [messages, events] = await Promise.all([
    db.select().from(supportMessages).where(eq(supportMessages.ticketId, id)).orderBy(asc(supportMessages.createdAt)),
    db.select().from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, id)).orderBy(asc(supportTicketEvents.createdAt)),
  ]);
  return {
    id: ticket.id, subject: ticket.subject, category: ticket.category, urgent: ticket.urgent,
    urgentAlertStatus: ticket.urgentAlertStatus, urgentOverdue: isUrgentOverdue(ticket), status: ticket.status,
    language: ticket.language, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, lastMessageAt: ticket.lastMessageAt,
    memberUserId: ticket.userId, assignedTo: ticket.assignedTo,
    messages: messages.map(m => ({
      id: m.id, authorId: m.authorId, authorRole: m.authorRole, message: m.body, language: m.language, createdAt: m.createdAt,
    })),
    events: events.map(e => ({
      action: e.action, actorId: e.actorId, previousStatus: e.previousStatus, nextStatus: e.nextStatus,
      previousAssignee: e.previousAssignee, nextAssignee: e.nextAssignee, detail: e.detail, createdAt: e.createdAt,
    })),
  };
}

async function getNotificationSettings(ownerId: string) {
  const [preference, count] = await Promise.all([
    db.select().from(memberNotificationPreferences)
      .where(eq(memberNotificationPreferences.userId, ownerId)).limit(1),
    db.select({ count: sql<number>`count(*)::int` }).from(pushDevices)
      .where(and(eq(pushDevices.userId, ownerId), eq(pushDevices.enabled, true))),
  ]);
  return {
    pushEnabled: preference[0]?.pushEnabled ?? false,
    language: preference[0]?.language ?? "en",
    registeredDevices: count[0]?.count ?? 0,
  };
}

memberSupportRouter.get("/support/tickets", async (req, res) => {
  const ownerId = userId(req);
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.userId, ownerId))
    .orderBy(desc(supportTickets.lastMessageAt)).limit(100);
  res.json(rows.map(t => ({
    id: t.id, subject: t.subject, category: t.category, urgent: t.urgent, status: t.status, language: t.language,
    createdAt: t.createdAt, updatedAt: t.updatedAt, lastMessageAt: t.lastMessageAt,
  })));
});

memberSupportRouter.post("/support/tickets", async (req, res) => {
  const parsed = z.object({
    subject: z.string().trim().min(4).max(120),
    category: ticketCategorySchema,
    message: z.string().trim().min(10).max(5000),
    language: languageSchema,
    urgent: z.boolean().optional().default(false),
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Add a subject and a message, then try again." }); return; }
  if (parsed.data.urgent && parsed.data.category !== "safety") {
    res.status(400).json({ message: "Urgent priority is only available for safety reports." });
    return;
  }
  const ownerId = userId(req);
  const id = randomUUID();
  const now = new Date();
  await db.transaction(async tx => {
    await tx.insert(supportTickets).values({
      id, userId: ownerId, subject: parsed.data.subject, category: parsed.data.category, urgent: parsed.data.urgent,
      urgentAlertStatus: parsed.data.urgent ? "pending" : "not_applicable",
      language: parsed.data.language, status: "open", createdAt: now, updatedAt: now, lastMessageAt: now,
    });
    await tx.insert(supportMessages).values({
      id: randomUUID(), ticketId: id, authorId: ownerId, authorRole: "member",
      body: parsed.data.message, language: parsed.data.language, createdAt: now,
    });
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(), ticketId: id, actorId: ownerId, action: "created", nextStatus: "open",
      detail: parsed.data.urgent ? "Urgent safety report submitted." : "", createdAt: now,
    });
  });
  if (parsed.data.urgent) {
    void (async () => {
      const staff = await db.select({ userId: operators.userId }).from(operators)
        .where(and(
          inArray(operators.role, ["admin", "support"]),
          eq(operators.receiveUrgentAlerts, true),
        ));
      const outcomes = await Promise.all(staff.map(member => sendMemberNotification(member.userId, "support_urgent", {
        dedupeKey: `support-urgent:${id}`,
        ticketId: id,
      })));
      const anyAccepted = outcomes.some(outcome => outcome.status === "sent");
      if (!anyAccepted) {
        await db.update(supportTickets).set({ urgentAlertStatus: "fallback_required" })
          .where(and(eq(supportTickets.id, id), eq(supportTickets.urgentAlertStatus, "pending")));
      }
    })().catch(async error => {
      await db.update(supportTickets).set({ urgentAlertStatus: "fallback_required" })
        .where(eq(supportTickets.id, id))
        .catch(updateError => req.log.error({ err: updateError, ticketId: id }, "Urgent alert fallback status could not be recorded"));
      req.log.error({ err: error, ticketId: id }, "Urgent support alert fan-out failed");
    });
  }
  res.status(201).json(await memberTicketDetail(ownerId, id));
});

memberSupportRouter.get("/support/tickets/:id", async (req, res) => {
  res.json(await memberTicketDetail(userId(req), String(req.params.id)));
});

memberSupportRouter.post("/support/tickets/:id/replies", async (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(5000), language: languageSchema }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Write a reply before sending." }); return; }
  const ownerId = userId(req);
  const id = String(req.params.id);
  await db.transaction(async tx => {
    const [ticket] = await tx.select().from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.userId, ownerId))).for("update");
    if (!ticket) throw new BookingError(404, "Support request not found.");
    const now = new Date();
    const nextStatus = ticket.status === "closed" || ticket.status === "resolved" ? "open"
      : ticket.status === "waiting_member" ? "in_progress" : ticket.status;
    await tx.insert(supportMessages).values({
      id: randomUUID(), ticketId: id, authorId: ownerId, authorRole: "member",
      body: parsed.data.message, language: parsed.data.language, createdAt: now,
    });
    await tx.update(supportTickets).set({
      status: nextStatus, updatedAt: now, lastMessageAt: now, closedAt: null,
    }).where(eq(supportTickets.id, id));
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(), ticketId: id, actorId: ownerId,
      action: nextStatus !== ticket.status ? "member_reopened" : "member_reply",
      previousStatus: ticket.status, nextStatus, createdAt: now,
    });
  });
  res.status(201).json(await memberTicketDetail(ownerId, id));
});

memberSupportRouter.get("/notifications/settings", async (req, res) => {
  res.json(await getNotificationSettings(userId(req)));
});

memberSupportRouter.put("/notifications/settings", async (req, res) => {
  const parsed = z.object({ pushEnabled: z.boolean(), language: languageSchema }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a language and notification preference." }); return; }
  const ownerId = userId(req);
  if (parsed.data.pushEnabled) {
    const [device] = await db.select({ id: pushDevices.id }).from(pushDevices)
      .where(and(eq(pushDevices.userId, ownerId), eq(pushDevices.enabled, true))).limit(1);
    if (!device) throw new BookingError(409, "Register this device before enabling push notifications.");
  }
  await db.transaction(async tx => {
    await tx.insert(memberNotificationPreferences).values({
      userId: ownerId, pushEnabled: parsed.data.pushEnabled, language: parsed.data.language, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: memberNotificationPreferences.userId,
      set: { pushEnabled: parsed.data.pushEnabled, language: parsed.data.language, updatedAt: new Date() },
    });
    await tx.update(pushDevices).set({ enabled: parsed.data.pushEnabled, updatedAt: new Date() })
      .where(eq(pushDevices.userId, ownerId));
  });
  res.json(await getNotificationSettings(ownerId));
});

memberSupportRouter.post("/notifications/devices", async (req, res) => {
  const parsed = z.object({
    token: z.string().min(20).max(512).regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/),
    platform: z.enum(["ios", "android"]),
    language: languageSchema,
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "This device did not provide a valid push token." }); return; }
  const ownerId = userId(req);
  const now = new Date();
  await db.transaction(async tx => {
    await tx.delete(pushDevices).where(and(eq(pushDevices.token, parsed.data.token), sql`${pushDevices.userId} <> ${ownerId}`));
    await tx.insert(pushDevices).values({
      id: randomUUID(), userId: ownerId, token: parsed.data.token, platform: parsed.data.platform,
      enabled: true, createdAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: pushDevices.token,
      set: { userId: ownerId, platform: parsed.data.platform, enabled: true, updatedAt: now },
    });
    await tx.insert(memberNotificationPreferences).values({
      userId: ownerId, pushEnabled: true, language: parsed.data.language, updatedAt: now,
    }).onConflictDoUpdate({
      target: memberNotificationPreferences.userId,
      set: { pushEnabled: true, language: parsed.data.language, updatedAt: now },
    });
  });
  res.json(await getNotificationSettings(ownerId));
});

memberSupportRouter.delete("/notifications/devices", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20).max(512) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Select a registered device to remove." }); return; }
  const ownerId = userId(req);
  await db.transaction(async tx => {
    await tx.delete(pushDevices).where(and(eq(pushDevices.userId, ownerId), eq(pushDevices.token, parsed.data.token)));
    const [remaining] = await tx.select({ count: sql<number>`count(*)::int` }).from(pushDevices)
      .where(and(eq(pushDevices.userId, ownerId), eq(pushDevices.enabled, true)));
    if (!remaining.count) {
      await tx.insert(memberNotificationPreferences).values({
        userId: ownerId, pushEnabled: false, language: "en", updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: memberNotificationPreferences.userId,
        set: { pushEnabled: false, updatedAt: new Date() },
      });
    }
  });
  res.json(await getNotificationSettings(ownerId));
});

staffRouter.use(async (req, res, next) => {
  const id = getAuth(req).userId;
  if (!id) { res.status(401).json({ message: "Sign in to access support tools." }); return; }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, id)).limit(1);
  if (!operator || !["admin", "support"].includes(operator.role)) {
    res.status(403).json({ message: "Authorized support staff access is required." }); return;
  }
  res.locals.supportOperator = operator;
  next();
});

staffRouter.get("/tickets", async (req, res) => {
  const status = typeof req.query.status === "string" ? ticketStatusSchema.safeParse(req.query.status) : null;
  if (status && !status.success) { res.status(400).json({ message: "Choose a valid ticket status." }); return; }
  const rows = await db.select().from(supportTickets)
    .where(status?.success ? eq(supportTickets.status, status.data) : undefined)
    .orderBy(
      desc(sql`CASE WHEN ${supportTickets.urgent} = true AND ${supportTickets.status} NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END`),
      desc(supportTickets.lastMessageAt),
    ).limit(100);
  res.json(rows.map(t => ({
    id: t.id, subject: t.subject, category: t.category, urgent: t.urgent, urgentAlertStatus: t.urgentAlertStatus,
    urgentOverdue: isUrgentOverdue(t),
    status: t.status, language: t.language,
    createdAt: t.createdAt, updatedAt: t.updatedAt, lastMessageAt: t.lastMessageAt,
    memberUserId: t.userId, assignedTo: t.assignedTo,
  })));
});

staffRouter.get("/device-changes", async (_req, res) => {
  res.json(await listPendingMemberDeviceChanges());
});

staffRouter.post("/device-changes/:id/approve", async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(10).max(500) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Add a clear reason for approving the device change." }); return; }
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  res.json(await approveMemberDeviceChange(String(req.params.id), operator.userId, parsed.data.reason));
});

staffRouter.get("/tickets/:id", async (req, res) => {
  res.json(await staffTicketDetail(String(req.params.id)));
});

staffRouter.patch("/tickets/:id", async (req, res) => {
  const parsed = z.object({
    status: ticketStatusSchema.optional(),
    assignedTo: z.string().max(160).nullable().optional(),
  }).strict().refine(value => Object.keys(value).length > 0, "Make at least one change.").safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a valid status or support agent." }); return; }
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  const id = String(req.params.id);
  let notifyStatus = false;
  let memberId = "";
  await db.transaction(async tx => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, id)).for("update");
    if (!ticket) throw new BookingError(404, "Support request not found.");
    if (parsed.data.assignedTo) {
      const [agent] = await tx.select({ userId: operators.userId }).from(operators)
        .where(and(eq(operators.userId, parsed.data.assignedTo), inArray(operators.role, ["admin", "support"]))).limit(1);
      if (!agent) throw new BookingError(400, "Assign the ticket to an authorized support agent.");
    }
    const nextStatus = parsed.data.status ?? ticket.status;
    const nextAssignee = Object.hasOwn(parsed.data, "assignedTo") ? parsed.data.assignedTo ?? null : ticket.assignedTo;
    const statusChanged = nextStatus !== ticket.status;
    const assigneeChanged = nextAssignee !== ticket.assignedTo;
    memberId = ticket.userId;
    notifyStatus = statusChanged;
    const now = new Date();
    await tx.update(supportTickets).set({
      status: nextStatus, assignedTo: nextAssignee, updatedAt: now,
      closedAt: nextStatus === "closed" || nextStatus === "resolved" ? (ticket.closedAt ?? now) : null,
    }).where(eq(supportTickets.id, id));
    if (statusChanged) {
      await tx.insert(supportTicketEvents).values({
        id: randomUUID(), ticketId: id, actorId: operator.userId, action: "status_changed",
        previousStatus: ticket.status, nextStatus, detail: "Support staff changed ticket status.", createdAt: now,
      });
    }
    if (assigneeChanged) {
      await tx.insert(supportTicketEvents).values({
        id: randomUUID(), ticketId: id, actorId: operator.userId, action: "assigned",
        previousAssignee: ticket.assignedTo, nextAssignee, detail: "Support staff changed ticket assignment.", createdAt: now,
      });
    }
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId: operator.userId, action: "support.ticket.update", targetId: id,
      detail: `statusChanged=${statusChanged};assignmentChanged=${assigneeChanged}`,
    });
  });
  if (notifyStatus) void sendMemberNotification(memberId, "support_status");
  res.json(await staffTicketDetail(id));
});

staffRouter.post("/tickets/:id/replies", async (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(5000), language: languageSchema }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Write a reply before sending." }); return; }
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  const id = String(req.params.id);
  let memberId = "";
  await db.transaction(async tx => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, id)).for("update");
    if (!ticket) throw new BookingError(404, "Support request not found.");
    const now = new Date();
    memberId = ticket.userId;
    await tx.insert(supportMessages).values({
      id: randomUUID(), ticketId: id, authorId: operator.userId, authorRole: operator.role,
      body: parsed.data.message, language: parsed.data.language, createdAt: now,
    });
    await tx.update(supportTickets).set({
      status: "waiting_member", updatedAt: now, lastMessageAt: now, closedAt: null,
    }).where(eq(supportTickets.id, id));
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(), ticketId: id, actorId: operator.userId, action: "staff_reply",
      previousStatus: ticket.status, nextStatus: "waiting_member", detail: "Support staff replied to the member.", createdAt: now,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId: operator.userId, action: "support.ticket.reply", targetId: id,
      detail: "Staff reply sent.",
    });
  });
  void sendMemberNotification(memberId, "support_reply");
  res.status(201).json(await staffTicketDetail(id));
});

staffRouter.get("/agents", async (_req, res) => {
  const rows = await db.select({
    userId: operators.userId,
    role: operators.role,
    receiveUrgentAlerts: operators.receiveUrgentAlerts,
  }).from(operators)
    .where(inArray(operators.role, ["admin", "support"]));
  const viewer = res.locals.supportOperator as typeof operators.$inferSelect;
  if (viewer.role !== "admin" || !rows.length) {
    res.json(rows);
    return;
  }

  const userIds = rows.map(agent => agent.userId);
  const [preferences, devices] = await Promise.all([
    db.select({
      userId: memberNotificationPreferences.userId,
      pushEnabled: memberNotificationPreferences.pushEnabled,
    }).from(memberNotificationPreferences)
      .where(inArray(memberNotificationPreferences.userId, userIds)),
    db.select({
      userId: pushDevices.userId,
      count: sql<number>`count(*)::int`,
    }).from(pushDevices)
      .where(and(inArray(pushDevices.userId, userIds), eq(pushDevices.enabled, true)))
      .groupBy(pushDevices.userId),
  ]);
  const preferencesByUser = new Map(preferences.map(preference => [preference.userId, preference.pushEnabled]));
  const deviceCountByUser = new Map(devices.map(device => [device.userId, device.count]));
  res.json(rows.map(agent => ({
    ...agent,
    pushEnabled: preferencesByUser.get(agent.userId) ?? false,
    activeDeviceCount: deviceCountByUser.get(agent.userId) ?? 0,
  })));
});

staffRouter.post("/agents", async (req, res) => {
  const parsed = z.object({
    userId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Enter a valid account ID." }); return; }
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  if (operator.role !== "admin") throw new BookingError(403, "Administrator access is required to grant support access.");
  const [agent] = await db.transaction(async tx => {
    const [created] = await tx.insert(operators)
      .values({ userId: parsed.data.userId, role: "support", partnerId: null })
      .onConflictDoNothing()
      .returning();
    if (!created) throw new BookingError(409, "This account already has a staff role.");
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId: operator.userId, action: "support.agent.add", targetId: created.userId,
      detail: "Support staff role granted.",
    });
    return [created];
  });
  res.status(201).json({
    userId: agent.userId,
    role: agent.role,
    receiveUrgentAlerts: agent.receiveUrgentAlerts,
  });
});

staffRouter.patch("/agents/:userId/urgent-alerts", async (req, res) => {
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  if (operator.role !== "admin") {
    throw new BookingError(403, "Administrator access is required to change urgent alert recipients.");
  }
  const parsed = z.object({ receiveUrgentAlerts: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose whether this staff member receives urgent alerts." });
    return;
  }
  const targetId = String(req.params.userId);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(targetId)) {
    throw new BookingError(400, "Choose a valid support account.");
  }

  const updatedAgent = await db.transaction(async tx => {
    const staff = await tx.select().from(operators)
      .where(inArray(operators.role, ["admin", "support"]))
      .orderBy(asc(operators.userId))
      .for("update");
    const currentAdmin = staff.find(agent => agent.userId === operator.userId);
    if (!currentAdmin || currentAdmin.role !== "admin") {
      throw new BookingError(403, "Administrator access is required to change urgent alert recipients.");
    }
    const agent = staff.find(candidate => candidate.userId === targetId);
    if (!agent) throw new BookingError(404, "Support staff account not found.");
    if (agent.receiveUrgentAlerts === parsed.data.receiveUrgentAlerts) return agent;
    if (!parsed.data.receiveUrgentAlerts && staff.filter(candidate => candidate.receiveUrgentAlerts).length <= 1) {
      throw new BookingError(409, "At least one authorized staff member must remain selected for urgent alerts.");
    }
    await tx.update(operators).set({ receiveUrgentAlerts: parsed.data.receiveUrgentAlerts })
      .where(eq(operators.userId, targetId));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: currentAdmin.userId,
      action: "support.agent.urgent_alerts.update",
      targetId,
      detail: `${parsed.data.receiveUrgentAlerts
        ? "Urgent safety alerts enabled for staff member."
        : "Urgent safety alerts disabled for staff member."} from=${agent.receiveUrgentAlerts};to=${parsed.data.receiveUrgentAlerts}`,
    });
    return { ...agent, receiveUrgentAlerts: parsed.data.receiveUrgentAlerts };
  });
  res.json({
    userId: updatedAgent.userId,
    role: updatedAgent.role,
    receiveUrgentAlerts: updatedAgent.receiveUrgentAlerts,
  });
});

staffRouter.get("/urgent-alert-recipient-history", async (_req, res) => {
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  if (operator.role !== "admin") {
    throw new BookingError(403, "Administrator access is required to review urgent alert recipient history.");
  }
  const rows = await db.select({
    id: operationAudit.id,
    actorId: operationAudit.actorId,
    recipientUserId: operationAudit.targetId,
    detail: operationAudit.detail,
    createdAt: operationAudit.createdAt,
  }).from(operationAudit)
    .where(eq(operationAudit.action, "support.agent.urgent_alerts.update"))
    .orderBy(desc(operationAudit.createdAt))
    .limit(50);
  res.json(rows.flatMap(row => {
    const transition = parseUrgentRecipientTransition(row.detail);
    return transition ? [{
      id: row.id,
      actorId: row.actorId,
      recipientUserId: row.recipientUserId,
      ...transition,
      createdAt: row.createdAt,
    }] : [];
  }));
});

staffRouter.delete("/agents/:userId", async (req, res) => {
  const operator = res.locals.supportOperator as typeof operators.$inferSelect;
  if (operator.role !== "admin") {
    throw new BookingError(403, "Administrator access is required to remove support access.");
  }
  const targetId = String(req.params.userId);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(targetId)) {
    throw new BookingError(400, "Choose a valid support account.");
  }

  const removedAgent = await db.transaction(async tx => {
    const staff = await tx.select().from(operators)
      .where(inArray(operators.role, ["admin", "support"]))
      .orderBy(asc(operators.userId))
      .for("update");
    const agent = staff.find(candidate => candidate.userId === targetId);
    if (!agent) throw new BookingError(404, "Support agent not found.");
    if (agent.role !== "support") {
      throw new BookingError(409, "Only support roles can be removed here.");
    }
    if (agent.receiveUrgentAlerts && staff.filter(candidate => candidate.receiveUrgentAlerts).length <= 1) {
      throw new BookingError(409, "Enable another authorized staff member before removing the last urgent alert recipient.");
    }
    await tx.delete(operators).where(eq(operators.userId, targetId));
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId: operator.userId, action: "support.agent.remove", targetId,
      detail: "Support staff role revoked.",
    });
    return agent;
  });

  res.json({
    userId: targetId,
    role: "support",
    receiveUrgentAlerts: removedAgent.receiveUrgentAlerts,
  });
});

staffRouter.get("/notification-failures", async (_req, res) => {
  const rows = await db.select({
    id: pushDeliveries.id, userId: pushDeliveries.userId, kind: pushDeliveries.kind,
    title: pushDeliveries.title, status: pushDeliveries.status, error: pushDeliveries.error,
    receiptError: pushDeliveries.receiptError, attemptCount: pushDeliveries.attemptCount,
    nextAttemptAt: pushDeliveries.nextAttemptAt, receiptStatus: pushDeliveries.receiptStatus,
    createdAt: pushDeliveries.createdAt,
  }).from(pushDeliveries).where(or(
    inArray(pushDeliveries.status, ["failed", "retry_pending"]),
    inArray(pushDeliveries.receiptStatus, ["error", "unavailable"]),
  ))
    .orderBy(desc(pushDeliveries.createdAt)).limit(100);
  res.json(rows.map(({ receiptError, ...row }) => ({
    ...row,
    error: receiptError ?? row.error ?? "Delivery issue without a provider message.",
  })));
});

function handleError(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues.map(issue => issue.message).join(" ") }); return; }
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof DeviceSecurityError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
  next(error);
}
memberSupportRouter.use(handleError);
staffRouter.use(handleError);

export default staffRouter;
