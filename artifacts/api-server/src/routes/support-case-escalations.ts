import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { CreateSupportCaseEscalationBody, ResolveSupportCaseEscalationBody } from "@workspace/api-zod";
import { db, operationAudit, operators, supportCaseEscalations, supportTickets } from "@workspace/db";
import { BookingError } from "../lib/reservations";

// Mounted after the parent support router's admin/support authorization middleware.
const router = Router();
async function history(ticketId: string) {
  const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets)
    .where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) throw new BookingError(404, "Support request not found.");
  return db.select().from(supportCaseEscalations)
    .where(eq(supportCaseEscalations.ticketId, ticketId)).orderBy(desc(supportCaseEscalations.raisedAt));
}

router.get("/tickets/:id/escalations", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await history(String(req.params.id)));
});

router.post("/tickets/:id/escalations", async (req, res): Promise<void> => {
  const parsed = CreateSupportCaseEscalationBody.safeParse(req.body);
  if (!parsed.success || parsed.data.reason.trim().length < 10) {
    throw new BookingError(400, "Choose a staff member and give a reason of at least 10 characters.");
  }
  const actor = res.locals.supportOperator as typeof operators.$inferSelect;
  if (parsed.data.targetUserId === actor.userId) throw new BookingError(400, "Escalate to another staff member.");
  const ticketId = String(req.params.id);
  await db.transaction(async tx => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update");
    if (!ticket) throw new BookingError(404, "Support request not found.");
    if (["closed", "resolved"].includes(ticket.status)) throw new BookingError(409, "Reopen the ticket before escalating it.");
    const [target] = await tx.select().from(operators).where(and(
      eq(operators.userId, parsed.data.targetUserId), inArray(operators.role, ["admin", "support"]),
    )).for("share");
    if (!target) throw new BookingError(400, "Choose an authorized support staff member or administrator.");
    const [active] = await tx.select({ id: supportCaseEscalations.id }).from(supportCaseEscalations)
      .where(and(eq(supportCaseEscalations.ticketId, ticketId), isNull(supportCaseEscalations.resolvedAt))).limit(1);
    if (active) throw new BookingError(409, "Resolve the existing escalation before creating another.");
    await tx.insert(supportCaseEscalations).values({
      id: randomUUID(), ticketId, targetUserId: target.userId, reason: parsed.data.reason.trim(), raisedBy: actor.userId,
    });
    await tx.update(supportTickets).set({ assignedTo: target.userId }).where(eq(supportTickets.id, ticketId));
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId: actor.userId, action: "support.case.escalate", targetId: ticketId,
      detail: `Case escalated to ${target.userId}.`,
    });
  });
  res.status(201).json(await history(ticketId));
});

router.post("/tickets/:id/escalations/:escalationId/resolve", async (req, res): Promise<void> => {
  const parsed = ResolveSupportCaseEscalationBody.safeParse(req.body);
  if (!parsed.success || parsed.data.resolution.trim().length < 10) {
    throw new BookingError(400, "Explain the resolution in at least 10 characters.");
  }
  const actor = res.locals.supportOperator as typeof operators.$inferSelect;
  const ticketId = String(req.params.id);
  await db.transaction(async tx => {
    const [ticket] = await tx.select({ id: supportTickets.id }).from(supportTickets)
      .where(eq(supportTickets.id, ticketId)).for("update");
    if (!ticket) throw new BookingError(404, "Support request not found.");
    const [escalation] = await tx.select().from(supportCaseEscalations).where(and(
      eq(supportCaseEscalations.id, String(req.params.escalationId)),
      eq(supportCaseEscalations.ticketId, ticketId),
    )).for("update");
    if (!escalation) throw new BookingError(404, "Case escalation not found.");
    if (actor.role !== "admin" && escalation.targetUserId !== actor.userId) {
      throw new BookingError(403, "Only the receiving staff member or an administrator can resolve this escalation.");
    }
    if (escalation.resolvedAt) throw new BookingError(409, "This escalation has already been resolved.");
    await tx.update(supportCaseEscalations).set({
      resolvedBy: actor.userId, resolvedAt: new Date(), resolution: parsed.data.resolution.trim(),
    }).where(eq(supportCaseEscalations.id, escalation.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId: actor.userId, action: "support.case.resolve", targetId: ticketId,
      detail: `Case escalation ${escalation.id} resolved.`,
    });
  });
  res.json(await history(ticketId));
});

export default router;
