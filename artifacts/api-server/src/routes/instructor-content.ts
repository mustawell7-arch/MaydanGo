import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  instructorContentDrafts,
  instructorDraftUploads,
  operators,
} from "@workspace/db";
import {
  CreateInstructorContentDraftBody,
  CreateInstructorContentDraftUploadBody,
  GetInstructorContentDraftsResponse,
  UpdateInstructorContentDraftBody,
} from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const purposeSettings = {
  profile_photo: {
    maxBytes: 10 * 1024 * 1024,
    contentTypes: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
  course_recording: {
    maxBytes: 500 * 1024 * 1024,
    contentTypes: {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/x-m4v": "m4v",
      "video/quicktime": "mov",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/aac": "aac",
      "audio/ogg": "ogg",
    },
  },
  course_material: {
    maxBytes: 15 * 1024 * 1024,
    contentTypes: { "application/pdf": "pdf" },
  },
} as const;

type DraftType = "profile" | "course" | "live_class";
type UploadPurpose = keyof typeof purposeSettings;

function cleanFileName(value: string) {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
}

async function isApprovedInstructor(userId: string) {
  const [operator] = await db.select({ role: operators.role }).from(operators)
    .where(eq(operators.userId, userId)).limit(1);
  return operator?.role === "instructor";
}

function serializeDraft(row: typeof instructorContentDrafts.$inferSelect) {
  return {
    id: row.id,
    contentType: row.contentType,
    status: row.status,
    payload: row.payload,
    decisionReason: row.decisionReason,
    publishedCourseId: row.publishedCourseId,
    publishedOfferingId: row.publishedOfferingId,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOwnedDraft(userId: string, draftId: string) {
  const [draft] = await db.select().from(instructorContentDrafts)
    .where(and(
      eq(instructorContentDrafts.id, draftId),
      eq(instructorContentDrafts.instructorUserId, userId),
    )).limit(1);
  return draft;
}

export async function streamInstructorDraftUpload(
  req: Request,
  res: Response,
  upload: typeof instructorDraftUploads.$inferSelect,
) {
  if (upload.status !== "ready" && upload.status !== "promoted") {
    res.status(404).end();
    return;
  }
  let file;
  try {
    file = await objectStorage.getPrivateFile(upload.objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).end();
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const storedType = String(metadata.contentType ?? "");
  if (storedType !== upload.contentType) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", storedType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  file.createReadStream().on("error", error => {
    req.log.error({ err: error, uploadId: upload.id }, "Failed to stream instructor draft asset");
    if (!res.headersSent) res.status(404).end();
    else res.end();
  }).pipe(res);
}

router.get("/", async (req, res) => {
  const userId = getAuth(req).userId!;
  if (!await isApprovedInstructor(userId)) {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  const drafts = await db.select().from(instructorContentDrafts)
    .where(eq(instructorContentDrafts.instructorUserId, userId))
    .orderBy(desc(instructorContentDrafts.updatedAt));
  res.json(GetInstructorContentDraftsResponse.parse({ drafts: drafts.map(serializeDraft) }));
});

router.post("/", async (req, res) => {
  const userId = getAuth(req).userId!;
  if (!await isApprovedInstructor(userId)) {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  const parsed = CreateInstructorContentDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Review the draft fields and try again." });
    return;
  }
  const id = randomUUID();
  const [draft] = await db.insert(instructorContentDrafts).values({
    id,
    instructorUserId: userId,
    contentType: parsed.data.contentType,
    payload: parsed.data.payload as Record<string, unknown>,
    status: "draft",
  }).returning();
  res.status(201).json(serializeDraft(draft));
});

router.put("/:id", async (req, res) => {
  const userId = getAuth(req).userId!;
  if (!await isApprovedInstructor(userId)) {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  const draft = await findOwnedDraft(userId, String(req.params.id));
  if (!draft) {
    res.status(404).json({ message: "Draft not found." });
    return;
  }
  if (draft.status !== "draft" && draft.status !== "changes_requested") {
    res.status(409).json({ message: "Only an unpublished draft can be edited." });
    return;
  }
  const parsed = UpdateInstructorContentDraftBody.safeParse(req.body);
  if (!parsed.success || parsed.data.contentType !== draft.contentType) {
    res.status(400).json({ message: "The draft type or fields are invalid." });
    return;
  }
  const [updated] = await db.update(instructorContentDrafts).set({
    payload: parsed.data.payload as Record<string, unknown>,
    status: "draft",
    decisionReason: null,
    updatedAt: new Date(),
  }).where(eq(instructorContentDrafts.id, draft.id)).returning();
  res.json(serializeDraft(updated));
});

router.post("/:id/submit", async (req, res) => {
  const userId = getAuth(req).userId!;
  if (!await isApprovedInstructor(userId)) {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  const draft = await findOwnedDraft(userId, String(req.params.id));
  if (!draft) {
    res.status(404).json({ message: "Draft not found." });
    return;
  }
  if (draft.status !== "draft" && draft.status !== "changes_requested") {
    res.status(409).json({ message: "This draft is not ready for another review." });
    return;
  }
  const payload = draft.payload as Record<string, unknown>;
  const uploadIds = collectUploadReferences(draft.contentType as DraftType, payload);
  if (!uploadIds.valid) {
    res.status(400).json({ message: uploadIds.message });
    return;
  }
  if (uploadIds.ids.length) {
    const uploads = await db.select().from(instructorDraftUploads)
      .where(and(
        eq(instructorDraftUploads.draftId, draft.id),
        eq(instructorDraftUploads.instructorUserId, userId),
      ));
    const required = new Map(uploads.map(upload => [upload.id, upload]));
    for (const reference of uploadIds.ids) {
      const upload = required.get(reference.id);
      if (!upload || upload.status !== "ready" || upload.purpose !== reference.purpose) {
        res.status(400).json({ message: "Complete every required private file upload before submitting." });
        return;
      }
    }
  }
  const readinessError = validateDraftForSubmission(draft.contentType as DraftType, payload);
  if (readinessError) {
    res.status(400).json({ message: readinessError });
    return;
  }
  const [updated] = await db.update(instructorContentDrafts).set({
    status: "submitted",
    decisionReason: null,
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(instructorContentDrafts.id, draft.id)).returning();
  res.json(serializeDraft(updated));
});

router.post("/:id/uploads", async (req, res) => {
  const userId = getAuth(req).userId!;
  if (!await isApprovedInstructor(userId)) {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  const draft = await findOwnedDraft(userId, String(req.params.id));
  if (!draft) {
    res.status(404).json({ message: "Draft not found." });
    return;
  }
  if (draft.status !== "draft" && draft.status !== "changes_requested") {
    res.status(409).json({ message: "Uploads are closed while a draft is under review." });
    return;
  }
  const parsed = CreateInstructorContentDraftUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a supported file and try again." });
    return;
  }
  const purpose = parsed.data.purpose as UploadPurpose;
  const settings = purposeSettings[purpose];
  if ((purpose === "profile_photo" && draft.contentType !== "profile")
    || (purpose !== "profile_photo" && draft.contentType !== "course")) {
    res.status(400).json({ message: "This file type is not valid for the selected draft." });
    return;
  }
  const fileName = cleanFileName(parsed.data.fileName);
  const extension = settings.contentTypes[parsed.data.contentType as keyof typeof settings.contentTypes];
  if (!extension || !fileName || /[\\/]/.test(fileName) || fileName.length > 180
    || parsed.data.sizeBytes > settings.maxBytes) {
    res.status(400).json({ message: "The file type, name, or size is not supported." });
    return;
  }
  const uploadId = randomUUID();
  const { uploadURL, objectPath } = await objectStorage.createInstructorDraftUpload(
    userId, draft.id, uploadId, extension,
  );
  await db.insert(instructorDraftUploads).values({
    id: uploadId,
    draftId: draft.id,
    instructorUserId: userId,
    purpose,
    objectPath,
    fileName,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    status: "pending",
  });
  res.json({
    uploadId,
    uploadURL,
    fileName,
    contentType: parsed.data.contentType,
  });
});

router.post("/:id/uploads/:uploadId/complete", async (req, res) => {
  const userId = getAuth(req).userId!;
  if (!await isApprovedInstructor(userId)) {
    res.status(403).json({ message: "Approved instructor access is required." });
    return;
  }
  const [upload] = await db.select().from(instructorDraftUploads)
    .where(and(
      eq(instructorDraftUploads.id, String(req.params.uploadId)),
      eq(instructorDraftUploads.draftId, String(req.params.id)),
      eq(instructorDraftUploads.instructorUserId, userId),
    )).limit(1);
  if (!upload) {
    res.status(404).json({ message: "Upload not found." });
    return;
  }
  if (upload.status === "ready") {
    res.json(serializeUpload(upload));
    return;
  }
  let file;
  try {
    file = await objectStorage.getPrivateFile(upload.objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ message: "The uploaded file was not found. Upload it again." });
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const actualType = String(metadata.contentType ?? "");
  const actualSize = Number(metadata.size ?? 0);
  if (actualType !== upload.contentType || actualSize < 1 || actualSize !== upload.sizeBytes
    || actualSize > purposeSettings[upload.purpose as UploadPurpose].maxBytes) {
    await objectStorage.deletePrivateFile(upload.objectPath);
    res.status(400).json({ message: "The uploaded file type or size did not match the request." });
    return;
  }
  const [updated] = await db.update(instructorDraftUploads).set({
    status: "ready",
    sizeBytes: actualSize,
  }).where(eq(instructorDraftUploads.id, upload.id)).returning();
  res.json(serializeUpload(updated));
});

router.get("/:id/uploads/:uploadId/file", async (req, res) => {
  const userId = getAuth(req).userId!;
  const [upload] = await db.select().from(instructorDraftUploads)
    .where(and(
      eq(instructorDraftUploads.id, String(req.params.uploadId)),
      eq(instructorDraftUploads.draftId, String(req.params.id)),
      eq(instructorDraftUploads.instructorUserId, userId),
    )).limit(1);
  if (!upload) {
    res.status(404).end();
    return;
  }
  await streamInstructorDraftUpload(req, res, upload);
});

function serializeUpload(upload: typeof instructorDraftUploads.$inferSelect) {
  return {
    id: upload.id,
    purpose: upload.purpose,
    fileName: upload.fileName,
    contentType: upload.contentType,
    sizeBytes: upload.sizeBytes ?? 0,
    status: upload.status,
  };
}

function collectUploadReferences(type: DraftType, payload: Record<string, unknown>) {
  const references: Array<{ id: string; purpose: UploadPurpose }> = [];
  const add = (value: unknown, purpose: UploadPurpose, required: boolean) => {
    if (value === null || value === undefined) {
      if (required) return false;
      return true;
    }
    if (typeof value !== "string") return false;
    references.push({ id: value, purpose });
    return true;
  };
  if (type === "profile") {
    const photoUploadId = payload.photoUploadId;
    if (!add(photoUploadId, "profile_photo", false)) {
      return { valid: false, ids: [], message: "The profile photo selection is invalid." };
    }
  } else if (type === "course") {
    const lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    for (const lesson of lessons) {
      if (!lesson || typeof lesson !== "object"
        || !add((lesson as Record<string, unknown>).recordingUploadId, "course_recording", true)) {
        return { valid: false, ids: [], message: "Add a private recording to every lesson before submitting." };
      }
    }
    const materials = Array.isArray(payload.materials) ? payload.materials : [];
    for (const material of materials) {
      if (!material || typeof material !== "object"
        || !add((material as Record<string, unknown>).uploadId, "course_material", true)) {
        return { valid: false, ids: [], message: "Complete every course document upload before submitting." };
      }
    }
  }
  return { valid: true, ids: references, message: "" };
}

function validateDraftForSubmission(type: DraftType, payload: Record<string, unknown>) {
  const localizedNonempty = (key: string) => {
    const value = payload[key];
    return value && typeof value === "object"
      && ["en", "ar", "ku"].every(language =>
        typeof (value as Record<string, unknown>)[language] === "string"
        && String((value as Record<string, unknown>)[language]).trim().length > 0);
  };
  if (type === "profile") {
    if (String(payload.displayName ?? "").trim().length < 2
      || String(payload.biography ?? "").trim().length < 40
      || !Array.isArray(payload.qualifications) || payload.qualifications.length === 0
      || !Array.isArray(payload.languages) || payload.languages.length === 0
      || !Array.isArray(payload.specialties) || payload.specialties.length === 0) {
      return "Add a clear name, a biography of at least 40 characters, qualifications, languages, and specialties.";
    }
  }
  if (type === "course") {
    if (!localizedNonempty("localizedTitle") || !localizedNonempty("localizedSummary")
      || !localizedNonempty("localizedInstructor") || !String(payload.category ?? "").trim()
      || !Array.isArray(payload.lessons) || payload.lessons.length === 0) {
      return "Complete the course title, summary, instructor, category, and at least one lesson.";
    }
  }
  if (type === "live_class") {
    if (!localizedNonempty("localizedTitle") || !localizedNonempty("localizedDescription")
      || !localizedNonempty("localizedInstructor") || !String(payload.city ?? "").trim()
      || !String(payload.category ?? "").trim() || !Array.isArray(payload.tiers) || payload.tiers.length === 0) {
      return "Complete the class title, description, instructor, city, category, and eligible membership tiers.";
    }
    const start = new Date(String(payload.startsAt));
    const end = new Date(String(payload.endsAt));
    const cancelDeadline = new Date(String(payload.cancellationDeadline));
    if (!Number.isFinite(start.getTime()) || start <= new Date()
      || !Number.isFinite(end.getTime()) || end <= start
      || !Number.isFinite(cancelDeadline.getTime()) || cancelDeadline > start
      || !Number.isFinite(cancelDeadline.getTime()) || !String(payload.joinUrl).startsWith("https://")) {
      return "Choose a future class time, a valid cancellation deadline, and a secure meeting link.";
    }
  }
  return null;
}

export default router;
