import { Router, type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, operators, supportAttachments, supportMessages, supportTicketEvents, supportTickets } from "@workspace/db";
import {
  CompleteMemberSupportAttachmentParams,
  CompleteMemberSupportAttachmentResponse,
  GetMemberSupportTicketAttachmentsResponse,
  GetMemberSupportTicketAttachmentsResponseItem,
  GetSupportStaffTicketAttachmentsResponse,
  RequestMemberSupportAttachmentUploadUrlBody,
  RequestMemberSupportAttachmentUploadUrlResponse,
} from "@workspace/api-zod";
import { BookingError } from "../lib/reservations";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

export const memberSupportAttachmentRouter = Router();
export const staffSupportAttachmentRouter = Router();
export const supportAttachmentStorage = new ObjectStorageService();

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

const extensionByType: Record<typeof allowedTypes[number], string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

function signedInUserId(req: Request) {
  const id = getAuth(req).userId;
  if (!id) throw new BookingError(401, "Sign in to access support attachments.");
  return id;
}

export function sanitizeSupportAttachmentFileName(input: string, contentType: typeof allowedTypes[number]) {
  const basename = input.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const name = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!name || name === "." || name === ".." || !extensionByType[contentType].includes(extension)) {
    throw new BookingError(400, "Choose a PDF, JPEG, PNG, or WebP file with a matching file extension.");
  }
  return name;
}

export function hasValidSupportAttachmentSignature(contentType: string, header: Buffer) {
  if (contentType === "application/pdf") return header.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "image/jpeg") return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (contentType === "image/png") return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return header.length >= 12
    && header.subarray(0, 4).toString("ascii") === "RIFF"
    && header.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

async function readObjectHeader(file: Awaited<ReturnType<ObjectStorageService["getPrivateFile"]>>) {
  const chunks: Buffer[] = [];
  for await (const chunk of file.createReadStream({ start: 0, end: 15 })) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function asAttachment(row: typeof supportAttachments.$inferSelect) {
  return GetMemberSupportTicketAttachmentsResponseItem.parse({
    id: row.id,
    messageId: row.messageId,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    uploaderRole: row.uploaderRole,
    createdAt: row.createdAt,
  });
}

async function ownedTicket(ticketId: string, ownerId: string) {
  const [ticket] = await db.select().from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, ownerId))).limit(1);
  if (!ticket) throw new BookingError(404, "Support request not found.");
  return ticket;
}

async function readReadyAttachments(ticketId: string) {
  const rows = await db.select().from(supportAttachments).where(and(
    eq(supportAttachments.ticketId, ticketId),
    eq(supportAttachments.status, "ready"),
  )).orderBy(asc(supportAttachments.createdAt));
  return GetMemberSupportTicketAttachmentsResponse.parse(rows.map(asAttachment));
}

async function requestUpload(req: Request, res: Response, ownerId: string): Promise<void> {
  const parsed = RequestMemberSupportAttachmentUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose one supported file up to 10 MB." });
    return;
  }
  const ticketId = String(req.params.id);
  const ticket = await ownedTicket(ticketId, ownerId);
  if (ticket.status === "closed" || ticket.status === "resolved") {
    throw new BookingError(409, "Reply to reopen this request before adding an attachment.");
  }
  const [message] = await db.select({ id: supportMessages.id }).from(supportMessages).where(and(
    eq(supportMessages.id, parsed.data.messageId),
    eq(supportMessages.ticketId, ticketId),
    eq(supportMessages.authorId, ownerId),
    eq(supportMessages.authorRole, "member"),
  )).limit(1);
  if (!message) throw new BookingError(404, "Your support message was not found.");
  const count = await db.select({ count: sql<number>`count(*)::int` }).from(supportAttachments)
    .where(and(eq(supportAttachments.messageId, message.id), sql`${supportAttachments.status} IN ('pending', 'ready')`));
  if ((count[0]?.count ?? 0) >= MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new BookingError(409, "A message can include up to three files.");
  }
  const fileName = sanitizeSupportAttachmentFileName(parsed.data.fileName, parsed.data.contentType);
  const id = randomUUID();
  const signed = await supportAttachmentStorage.createSupportAttachmentUpload(ticketId, id);
  await db.insert(supportAttachments).values({
    id,
    ticketId,
    messageId: message.id,
    uploaderId: ownerId,
    uploaderRole: "member",
    fileName,
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    objectPath: signed.objectPath,
    status: "pending",
  });
  res.status(201).json(RequestMemberSupportAttachmentUploadUrlResponse.parse({
    id, uploadURL: signed.uploadURL, objectPath: signed.objectPath,
  }));
}

async function completeUpload(req: Request, res: Response, ownerId: string): Promise<void> {
  const ticketId = String(req.params.id);
  await ownedTicket(ticketId, ownerId);
  const parsedParams = CompleteMemberSupportAttachmentParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ message: "Invalid support attachment identifier." });
    return;
  }
  const attachmentId = parsedParams.data.attachmentId;
  const [row] = await db.select().from(supportAttachments).where(and(
    eq(supportAttachments.id, attachmentId),
    eq(supportAttachments.ticketId, ticketId),
    eq(supportAttachments.uploaderId, ownerId),
  )).limit(1);
  if (!row) throw new BookingError(404, "Support attachment not found.");
  if (row.status === "ready") {
    res.json(CompleteMemberSupportAttachmentResponse.parse(asAttachment(row)));
    return;
  }

  const file = await supportAttachmentStorage.getPrivateFile(row.objectPath);
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  if (metadata.contentType !== row.contentType || actualSize !== row.size || actualSize > MAX_ATTACHMENT_BYTES) {
    throw new BookingError(400, "The uploaded file did not match its declared type or size.");
  }
  const header = await readObjectHeader(file);
  if (!hasValidSupportAttachmentSignature(row.contentType, header)) {
    throw new BookingError(400, "The uploaded file contents do not match the selected file type.");
  }

  const now = new Date();
  const ready = await db.transaction(async tx => {
    const [current] = await tx.select().from(supportAttachments).where(eq(supportAttachments.id, attachmentId)).for("update");
    if (!current || current.ticketId !== ticketId || current.uploaderId !== ownerId) {
      throw new BookingError(404, "Support attachment not found.");
    }
    if (current.status === "ready") return current;
    const [updated] = await tx.update(supportAttachments).set({ status: "ready" })
      .where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.status, "pending"))).returning();
    if (!updated) throw new BookingError(409, "This upload is no longer pending.");
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(),
      ticketId,
      actorId: ownerId,
      action: "attachment_added",
      detail: "Member added an attachment to a support message.",
      createdAt: now,
    });
    return updated;
  });
  res.json(CompleteMemberSupportAttachmentResponse.parse(asAttachment(ready)));
}

async function downloadAttachment(
  req: Request,
  res: Response,
  ticketId: string,
  attachmentId: string,
) {
  const [row] = await db.select().from(supportAttachments).where(and(
    eq(supportAttachments.id, attachmentId),
    eq(supportAttachments.ticketId, ticketId),
    eq(supportAttachments.status, "ready"),
  )).limit(1);
  if (!row) throw new BookingError(404, "Support attachment not found.");
  const file = await supportAttachmentStorage.getPrivateFile(row.objectPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== row.size || metadata.contentType !== row.contentType) {
    throw new BookingError(404, "Support attachment is unavailable.");
  }
  res.setHeader("Content-Type", row.contentType);
  res.setHeader("Content-Length", String(row.size));
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const stream = file.createReadStream();
  stream.on("error", error => {
    req.log.error({ err: error, attachmentId }, "Support attachment stream failed");
    if (res.headersSent) res.destroy(error);
    else res.status(404).json({ message: "Support attachment is unavailable." });
  });
  stream.pipe(res);
}

memberSupportAttachmentRouter.get("/support/tickets/:id/attachments", async (req, res): Promise<void> => {
  const ticket = await ownedTicket(String(req.params.id), signedInUserId(req));
  res.json(await readReadyAttachments(ticket.id));
});

memberSupportAttachmentRouter.post("/support/tickets/:id/attachments/upload-url", async (req, res): Promise<void> => {
  await requestUpload(req, res, signedInUserId(req));
});

memberSupportAttachmentRouter.post("/support/tickets/:id/attachments/:attachmentId/complete", async (req, res): Promise<void> => {
  await completeUpload(req, res, signedInUserId(req));
});

memberSupportAttachmentRouter.delete("/support/tickets/:id/attachments/:attachmentId", async (req, res): Promise<void> => {
  const ownerId = signedInUserId(req);
  const ticketId = String(req.params.id);
  await ownedTicket(ticketId, ownerId);
  const [row] = await db.select().from(supportAttachments).where(and(
    eq(supportAttachments.id, String(req.params.attachmentId)),
    eq(supportAttachments.ticketId, ticketId),
    eq(supportAttachments.uploaderId, ownerId),
    eq(supportAttachments.status, "pending"),
  )).limit(1);
  if (!row) throw new BookingError(404, "Pending support attachment not found.");
  await supportAttachmentStorage.deletePrivateFile(row.objectPath);
  await db.delete(supportAttachments).where(eq(supportAttachments.id, row.id));
  res.sendStatus(204);
});

memberSupportAttachmentRouter.get("/support/tickets/:id/attachments/:attachmentId/download", async (req, res): Promise<void> => {
  const ticket = await ownedTicket(String(req.params.id), signedInUserId(req));
  await downloadAttachment(req, res, ticket.id, String(req.params.attachmentId));
});

staffSupportAttachmentRouter.use(async (req, res, next: NextFunction): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in to continue." }); return; }
  const [operator] = await db.select({ role: operators.role }).from(operators).where(eq(operators.userId, userId)).limit(1);
  if (operator?.role !== "admin" && operator?.role !== "support") {
    res.status(403).json({ message: "Authorized support staff access is required." });
    return;
  }
  res.locals.supportAttachmentStaffId = userId;
  next();
});

staffSupportAttachmentRouter.get("/tickets/:id/attachments", async (req, res): Promise<void> => {
  const ticketId = String(req.params.id);
  const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets)
    .where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) throw new BookingError(404, "Support request not found.");
  res.json(GetSupportStaffTicketAttachmentsResponse.parse(await readReadyAttachments(ticket.id)));
});

staffSupportAttachmentRouter.get("/tickets/:id/attachments/:attachmentId/download", async (req, res): Promise<void> => {
  const ticketId = String(req.params.id);
  const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets)
    .where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) throw new BookingError(404, "Support request not found.");
  await downloadAttachment(req, res, ticket.id, String(req.params.attachmentId));
});

const attachmentErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof BookingError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof ObjectNotFoundError) {
    res.status(404).json({ message: "Support attachment not found." });
    return;
  }
  next(error);
};

memberSupportAttachmentRouter.use(attachmentErrorHandler);
staffSupportAttachmentRouter.use(attachmentErrorHandler);
