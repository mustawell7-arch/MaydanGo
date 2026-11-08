import { Router, type ErrorRequestHandler, type Request } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { db, operators, supportMessages, supportTicketEvents, supportTickets } from "@workspace/db";
import {
  CreateInstructorSupportTicketBody,
  CreateInstructorSupportTicketResponse,
  GetInstructorSupportTicketResponse,
  GetInstructorSupportTicketsResponse,
  ReplyInstructorSupportTicketBody,
  ReplyInstructorSupportTicketResponse,
} from "@workspace/api-zod";
import { BookingError } from "../lib/reservations";

export const instructorSupportRouter = Router();
const subjectPrefix = "Instructor portal: ";

function instructorId(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) throw new BookingError(401, "Sign in to contact MaydanGo support.");
  return userId;
}

instructorSupportRouter.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }
  const [operator] = await db.select({ role: operators.role }).from(operators)
    .where(eq(operators.userId, userId)).limit(1);
  if (operator?.role !== "instructor") {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  next();
});

async function instructorTicketDetail(ownerId: string, id: string) {
  const [ticket] = await db.select().from(supportTickets)
    .where(and(
      eq(supportTickets.id, id),
      eq(supportTickets.userId, ownerId),
      like(supportTickets.subject, `${subjectPrefix}%`),
    )).limit(1);
  if (!ticket) throw new BookingError(404, "Instructor support conversation not found.");
  const [messages, events] = await Promise.all([
    db.select().from(supportMessages).where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt)),
    db.select().from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, id))
      .orderBy(asc(supportTicketEvents.createdAt)),
  ]);
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    urgent: ticket.urgent,
    status: ticket.status,
    language: ticket.language,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
    messages: messages.map(message => ({
      id: message.id,
      authorRole: message.authorRole,
      message: message.body,
      language: message.language,
      createdAt: message.createdAt,
    })),
    events: events.map(event => ({
      action: event.action,
      previousStatus: event.previousStatus,
      nextStatus: event.nextStatus,
      createdAt: event.createdAt,
    })),
  };
}

instructorSupportRouter.get("/tickets", async (req, res): Promise<void> => {
  const ownerId = instructorId(req);
  const rows = await db.select().from(supportTickets).where(and(
    eq(supportTickets.userId, ownerId),
    like(supportTickets.subject, `${subjectPrefix}%`),
  )).orderBy(desc(supportTickets.lastMessageAt)).limit(100);
  res.json(GetInstructorSupportTicketsResponse.parse(rows.map(ticket => ({
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    urgent: ticket.urgent,
    status: ticket.status,
    language: ticket.language,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
  }))));
});

instructorSupportRouter.post("/tickets", async (req, res): Promise<void> => {
  const parsed = CreateInstructorSupportTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Add a subject and message before sending." });
    return;
  }
  const ownerId = instructorId(req);
  const id = randomUUID();
  const now = new Date();
  const subject = `${subjectPrefix}${parsed.data.subject.trim()}`;
  await db.transaction(async tx => {
    await tx.insert(supportTickets).values({
      id,
      userId: ownerId,
      subject,
      category: "other",
      urgent: false,
      urgentAlertStatus: "not_applicable",
      language: parsed.data.language,
      status: "open",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
    await tx.insert(supportMessages).values({
      id: randomUUID(),
      ticketId: id,
      authorId: ownerId,
      authorRole: "member",
      body: parsed.data.message.trim(),
      language: parsed.data.language,
      createdAt: now,
    });
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(),
      ticketId: id,
      actorId: ownerId,
      action: "created",
      nextStatus: "open",
      detail: "Instructor portal conversation created.",
      createdAt: now,
    });
  });
  res.status(201).json(CreateInstructorSupportTicketResponse.parse(await instructorTicketDetail(ownerId, id)));
});

instructorSupportRouter.get("/tickets/:id", async (req, res): Promise<void> => {
  res.json(GetInstructorSupportTicketResponse.parse(
    await instructorTicketDetail(instructorId(req), String(req.params.id)),
  ));
});

instructorSupportRouter.post("/tickets/:id/replies", async (req, res): Promise<void> => {
  const parsed = ReplyInstructorSupportTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Write a reply before sending." });
    return;
  }
  const ownerId = instructorId(req);
  const id = String(req.params.id);
  await db.transaction(async tx => {
    const [ticket] = await tx.select().from(supportTickets).where(and(
      eq(supportTickets.id, id),
      eq(supportTickets.userId, ownerId),
      like(supportTickets.subject, `${subjectPrefix}%`),
    )).for("update");
    if (!ticket) throw new BookingError(404, "Instructor support conversation not found.");
    const now = new Date();
    const nextStatus = ticket.status === "closed" || ticket.status === "resolved" ? "open"
      : ticket.status === "waiting_member" ? "in_progress" : ticket.status;
    await tx.insert(supportMessages).values({
      id: randomUUID(),
      ticketId: id,
      authorId: ownerId,
      authorRole: "member",
      body: parsed.data.message.trim(),
      language: parsed.data.language,
      createdAt: now,
    });
    await tx.update(supportTickets).set({
      status: nextStatus,
      updatedAt: now,
      lastMessageAt: now,
      closedAt: null,
    }).where(eq(supportTickets.id, id));
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(),
      ticketId: id,
      actorId: ownerId,
      action: nextStatus !== ticket.status ? "member_reopened" : "member_reply",
      previousStatus: ticket.status,
      nextStatus,
      createdAt: now,
    });
  });
  res.status(201).json(ReplyInstructorSupportTicketResponse.parse(
    await instructorTicketDetail(ownerId, id),
  ));
});

const handleInstructorSupportError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof BookingError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  next(error);
};

instructorSupportRouter.use(handleInstructorSupportError);
