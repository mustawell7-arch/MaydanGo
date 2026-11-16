import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq } from "drizzle-orm";
import {
  courseMaterials,
  db,
  instructorContentDrafts,
  instructorCourseAssignments,
  instructorDraftUploads,
  instructorOfferingAssignments,
  instructorProfiles,
  learningCourses,
  learningLessons,
  membershipPlans,
  operators,
  partners,
  offerings,
} from "@workspace/db";
import {
  DecideInstructorContentDraftBody,
  GetInstructorContentDraftsForReviewResponse,
} from "@workspace/api-zod";
import { hasAdminPermission } from "../lib/admin-roles";
import { ObjectStorageService } from "../lib/objectStorage";
import { suspendedEntityIds } from "../lib/account-access-restrictions";
import { streamInstructorDraftUpload } from "./instructor-content";

const router = Router();
const objectStorage = new ObjectStorageService();

type UploadPurpose = "profile_photo" | "course_recording" | "course_material";
type UploadRecord = typeof instructorDraftUploads.$inferSelect;
type DraftPayload = Record<string, unknown>;

class ReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewValidationError";
  }
}

router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }
  const [operator] = await db.select({ role: operators.role }).from(operators)
    .where(eq(operators.userId, userId)).limit(1);
  if (!operator || !hasAdminPermission(operator.role, "content")) {
    res.status(403).json({ message: "Content administrator access is required." });
    return;
  }
  res.locals.operatorUserId = userId;
  next();
});

router.get("/", async (_req, res) => {
  const drafts = await db.select().from(instructorContentDrafts)
    .where(eq(instructorContentDrafts.status, "submitted"))
    .orderBy(asc(instructorContentDrafts.submittedAt));
  const [approvedPartners, suspendedPartners] = await Promise.all([
    db.select({ id: partners.id, name: partners.name })
      .from(partners).where(eq(partners.approved, true)).orderBy(asc(partners.name)),
    suspendedEntityIds("partner"),
  ]);
  res.json(GetInstructorContentDraftsForReviewResponse.parse({
    drafts: drafts.map(draft => ({
      id: draft.id,
      instructorUserId: draft.instructorUserId,
      contentType: draft.contentType,
      status: draft.status,
      payload: reviewPayload(draft.contentType, draft.payload),
      decisionReason: draft.decisionReason,
      publishedCourseId: draft.publishedCourseId,
      publishedOfferingId: draft.publishedOfferingId,
      submittedAt: draft.submittedAt,
      reviewedAt: draft.reviewedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    })),
    partners: approvedPartners.filter(partner => !suspendedPartners.has(partner.id)),
  }));
});

router.get("/:id/uploads/:uploadId/file", async (req, res) => {
  const [draft] = await db.select({ status: instructorContentDrafts.status })
    .from(instructorContentDrafts)
    .where(eq(instructorContentDrafts.id, String(req.params.id))).limit(1);
  if (!draft || (draft.status !== "submitted" && draft.status !== "processing")) {
    res.status(404).end();
    return;
  }
  const [upload] = await db.select().from(instructorDraftUploads)
    .where(and(
      eq(instructorDraftUploads.id, String(req.params.uploadId)),
      eq(instructorDraftUploads.draftId, String(req.params.id)),
    )).limit(1);
  if (!upload) {
    res.status(404).end();
    return;
  }
  await streamInstructorDraftUpload(req, res, upload);
});

router.post("/:id/decision", async (req, res) => {
  const parsed = DecideInstructorContentDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose an action and provide a clear reason when returning content." });
    return;
  }
  const [draft] = await db.select().from(instructorContentDrafts)
    .where(eq(instructorContentDrafts.id, String(req.params.id))).limit(1);
  if (!draft) {
    res.status(404).json({ message: "Content draft not found." });
    return;
  }
  if (draft.status !== "submitted") {
    res.status(409).json({ message: "This draft is no longer waiting for review." });
    return;
  }
  const { decision, reason, partnerId } = parsed.data;
  if ((decision === "request_changes" || decision === "reject") && !reason?.trim()) {
    res.status(400).json({ message: "Add a reason so the instructor understands the decision." });
    return;
  }

  const reviewedBy = res.locals.operatorUserId as string;
  const now = new Date();
  if (decision !== "approve") {
    const status = decision === "request_changes" ? "changes_requested" : "rejected";
    const [updated] = await db.update(instructorContentDrafts).set({
      status,
      decisionReason: reason!.trim(),
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    }).where(and(
      eq(instructorContentDrafts.id, draft.id),
      eq(instructorContentDrafts.status, "submitted"),
    )).returning({ id: instructorContentDrafts.id });
    if (!updated) {
      res.status(409).json({ message: "This draft was reviewed by someone else. Refresh the queue." });
      return;
    }
    res.json({
      id: draft.id,
      status,
      publishedCourseId: null,
      publishedOfferingId: null,
      partnerReviewPending: false,
    });
    return;
  }

  const [claimed] = await db.update(instructorContentDrafts).set({
    status: "processing",
    updatedAt: now,
  }).where(and(
    eq(instructorContentDrafts.id, draft.id),
    eq(instructorContentDrafts.status, "submitted"),
  )).returning({ id: instructorContentDrafts.id });
  if (!claimed) {
    res.status(409).json({ message: "This draft was reviewed by someone else. Refresh the queue." });
    return;
  }

  let publishedCourseId: string | null = null;
  let publishedOfferingId: string | null = null;
  let partnerReviewPending = false;
  try {
    const payload = draft.payload as DraftPayload;
    if (draft.contentType === "profile") {
      await publishProfileDraft(draft.id, draft.instructorUserId, payload, reviewedBy, now);
    } else if (draft.contentType === "course") {
      publishedCourseId = await publishCourseDraft(draft.id, draft.instructorUserId, payload, reviewedBy);
    } else if (draft.contentType === "live_class") {
      if (!partnerId) {
        res.status(400).json({ message: "Choose an approved partner to host this online class." });
        return;
      }
      publishedOfferingId = await submitLiveClassToPartner(
        draft.id, draft.instructorUserId, payload, partnerId, reviewedBy, now,
      );
      partnerReviewPending = true;
    } else {
      throw new ReviewValidationError("This content type cannot be approved.");
    }
  } catch (error) {
    await db.update(instructorContentDrafts).set({
      status: "submitted",
      updatedAt: new Date(),
    }).where(and(
      eq(instructorContentDrafts.id, draft.id),
      eq(instructorContentDrafts.status, "processing"),
    ));
    if (error instanceof ReviewValidationError) {
      res.status(400).json({ message: error.message });
      return;
    }
    throw error;
  }

  const [updated] = await db.update(instructorContentDrafts).set({
    status: "approved",
    decisionReason: null,
    reviewedBy,
    reviewedAt: now,
    publishedCourseId,
    publishedOfferingId,
    updatedAt: now,
  }).where(and(
    eq(instructorContentDrafts.id, draft.id),
    eq(instructorContentDrafts.status, "processing"),
  )).returning({ id: instructorContentDrafts.id });
  if (!updated) {
    res.status(409).json({ message: "This draft was reviewed by someone else. Refresh the queue." });
    return;
  }
  res.json({
    id: draft.id,
    status: "approved",
    publishedCourseId,
    publishedOfferingId,
    partnerReviewPending,
  });
});

async function readyUploads(
  draftId: string,
  instructorUserId: string,
  references: Array<{ id: string; purpose: UploadPurpose }>,
) {
  const rows = await db.select().from(instructorDraftUploads)
    .where(and(
      eq(instructorDraftUploads.draftId, draftId),
      eq(instructorDraftUploads.instructorUserId, instructorUserId),
    ));
  const byId = new Map(rows.map(row => [row.id, row]));
  const selected = new Map<string, UploadRecord>();
  for (const reference of references) {
    const upload = byId.get(reference.id);
    if (!upload || (upload.status !== "ready" && upload.status !== "promoted")
      || upload.purpose !== reference.purpose) {
      throw new ReviewValidationError("A required private file is missing or was not verified.");
    }
    selected.set(upload.id, upload);
  }
  return selected;
}

function uploadReferences(type: string, payload: DraftPayload) {
  const references: Array<{ id: string; purpose: UploadPurpose }> = [];
  if (type === "profile" && typeof payload.photoUploadId === "string") {
    references.push({ id: payload.photoUploadId, purpose: "profile_photo" });
  }
  if (type === "course") {
    const lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    for (const lesson of lessons) {
      const id = lesson && typeof lesson === "object"
        ? (lesson as Record<string, unknown>).recordingUploadId : null;
      if (typeof id !== "string") throw new ReviewValidationError("Every course lesson needs a verified recording.");
      references.push({ id, purpose: "course_recording" });
    }
    const materials = Array.isArray(payload.materials) ? payload.materials : [];
    for (const material of materials) {
      const id = material && typeof material === "object"
        ? (material as Record<string, unknown>).uploadId : null;
      if (typeof id !== "string") throw new ReviewValidationError("Every attached course document needs a verified upload.");
      references.push({ id, purpose: "course_material" });
    }
  }
  return references;
}

function reviewPayload(type: string, payload: DraftPayload): DraftPayload {
  if (type !== "live_class") return payload;
  const { joinUrl: _privateMeetingLink, ...safePayload } = payload;
  return safePayload;
}

function extensionFor(upload: UploadRecord) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
    "video/quicktime": "mov",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "application/pdf": "pdf",
  };
  const extension = extensions[upload.contentType];
  if (!extension) throw new ReviewValidationError("The verified upload has an unsupported content type.");
  return extension;
}

async function promoteUpload(
  draftId: string,
  upload: UploadRecord,
  destinationPath: string,
) {
  if (upload.status === "promoted") {
    if (upload.objectPath !== destinationPath) {
      throw new ReviewValidationError("A previously approved file does not match this draft.");
    }
    return upload.objectPath;
  }
  const finalPath = await objectStorage.promoteInstructorDraftUpload(
    upload.objectPath,
    upload.instructorUserId,
    draftId,
    upload.id,
    extensionFor(upload),
    destinationPath,
  );
  await db.update(instructorDraftUploads).set({
    objectPath: finalPath,
    status: "promoted",
  }).where(eq(instructorDraftUploads.id, upload.id));
  return finalPath;
}

async function publishProfileDraft(
  draftId: string,
  userId: string,
  payload: DraftPayload,
  reviewedBy: string,
  approvedAt: Date,
) {
  const photoUploadId = typeof payload.photoUploadId === "string" ? payload.photoUploadId : null;
  const uploads = await readyUploads(
    draftId,
    userId,
    photoUploadId ? [{ id: photoUploadId, purpose: "profile_photo" }] : [],
  );
  const photoUpload = photoUploadId ? uploads.get(photoUploadId) : null;
  const photoPath = photoUpload
    ? await promoteUpload(draftId, photoUpload, `/objects/instructor-profile-photos/${photoUpload.id}.${extensionFor(photoUpload)}`)
    : null;

  await db.insert(instructorProfiles).values({
    id: randomUUID(),
    userId,
    sourceDraftId: draftId,
    displayName: String(payload.displayName),
    biography: String(payload.biography),
    qualifications: payload.qualifications as string[],
    languages: payload.languages as string[],
    specialties: payload.specialties as string[],
    photoPath,
    approvedBy: reviewedBy,
    approvedAt,
  }).onConflictDoUpdate({
    target: instructorProfiles.userId,
    set: {
      sourceDraftId: draftId,
      displayName: String(payload.displayName),
      biography: String(payload.biography),
      qualifications: payload.qualifications as string[],
      languages: payload.languages as string[],
      specialties: payload.specialties as string[],
      photoPath,
      approvedBy: reviewedBy,
      approvedAt,
    },
  });
}

async function publishCourseDraft(
  draftId: string,
  userId: string,
  payload: DraftPayload,
  reviewedBy: string,
) {
  const references = uploadReferences("course", payload);
  const uploads = await readyUploads(draftId, userId, references);
  // A stable ID keeps approved uploads retry-safe if a database write fails after storage promotion.
  const courseId = draftId;
  const lessons = payload.lessons as Array<Record<string, unknown>>;
  const materials = payload.materials as Array<Record<string, unknown>>;
  const promotedLessons: Array<{ lesson: Record<string, unknown>; mediaUrl: string }> = [];
  for (const lesson of lessons) {
    const upload = uploads.get(String(lesson.recordingUploadId))!;
    const mediaUrl = await promoteUpload(
      draftId,
      upload,
      `/objects/course-recordings/${upload.id}.${extensionFor(upload)}`,
    );
    promotedLessons.push({ lesson, mediaUrl });
  }
  const promotedMaterials: Array<{
    material: Record<string, unknown>;
    upload: UploadRecord;
    objectPath: string;
  }> = [];
  for (const material of materials) {
    const upload = uploads.get(String(material.uploadId))!;
    const objectPath = await promoteUpload(
      draftId,
      upload,
      `/objects/course-materials/${courseId}/${upload.id}.pdf`,
    );
    promotedMaterials.push({ material, upload, objectPath });
  }

  await db.transaction(async tx => {
    await tx.insert(learningCourses).values({
      id: courseId,
      instructorUserId: userId,
      title: String((payload.localizedTitle as Record<string, unknown>).en),
      localizedTitle: payload.localizedTitle as { en: string; ar: string; ku: string },
      localizedSummary: payload.localizedSummary as { en: string; ar: string; ku: string },
      localizedInstructor: payload.localizedInstructor as { en: string; ar: string; ku: string },
      category: String(payload.category),
      level: String(payload.level),
      durationMinutes: Number(payload.durationMinutes),
      thumbnailUrl: null,
      courseLanguages: payload.courseLanguages as ("en" | "ar" | "ku")[] | null,
      subtitleLanguages: payload.subtitleLanguages as ("en" | "ar" | "ku")[] | null,
      requiredEquipment: payload.requiredEquipment as { en: string; ar: string; ku: string } | null,
      disclaimers: payload.disclaimers as { en: string; ar: string; ku: string } | null,
      supportingMaterials: payload.supportingMaterials as { en: string; ar: string; ku: string } | null,
      published: true,
    });
    await tx.insert(learningLessons).values(promotedLessons.map(({ lesson, mediaUrl }, index) => ({
      id: randomUUID(),
      courseId,
      position: index + 1,
      localizedTitle: lesson.localizedTitle as { en: string; ar: string; ku: string },
      localizedContent: lesson.localizedContent as { en: string; ar: string; ku: string },
      durationMinutes: Number(lesson.durationMinutes),
      mediaUrl,
    })));
    if (promotedMaterials.length) {
      await tx.insert(courseMaterials).values(promotedMaterials.map(({ material, upload, objectPath }) => ({
        id: upload.id,
        courseId,
        title: String(material.title),
        fileName: upload.fileName,
        objectPath,
        sizeBytes: upload.sizeBytes ?? 0,
        approvedBy: reviewedBy,
      })));
    }
    await tx.insert(instructorCourseAssignments).values({
      id: randomUUID(),
      userId,
      courseId,
      assignedBy: reviewedBy,
    });
  });
  return courseId;
}

async function submitLiveClassToPartner(
  draftId: string,
  userId: string,
  payload: DraftPayload,
  partnerId: string,
  reviewedBy: string,
  submittedAt: Date,
) {
  const suspendedPartners = await suspendedEntityIds("partner");
  const [partner] = await db.select({ id: partners.id }).from(partners)
    .where(and(eq(partners.id, partnerId), eq(partners.approved, true))).limit(1);
  if (!partner || suspendedPartners.has(partnerId)) {
    throw new ReviewValidationError("Choose an approved, active partner to host this online class.");
  }
  const activePlans = await db.select({ tier: membershipPlans.tier }).from(membershipPlans)
    .where(eq(membershipPlans.active, true));
  const eligibleTiers = new Set(activePlans.map(plan => plan.tier));
  const tiers = payload.tiers as string[];
  if (!tiers.length || tiers.some(tier => !eligibleTiers.has(tier))) {
    throw new ReviewValidationError("The selected membership tiers are no longer available.");
  }
  const startsAt = new Date(String(payload.startsAt));
  const endsAt = new Date(String(payload.endsAt));
  const cancellationDeadline = new Date(String(payload.cancellationDeadline));
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= submittedAt
    || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt
    || !Number.isFinite(cancellationDeadline.getTime()) || cancellationDeadline > startsAt
    || !String(payload.joinUrl).startsWith("https://")) {
    throw new ReviewValidationError("The class schedule or secure meeting link is invalid.");
  }
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(offerings).values({
      id,
      kind: "session",
      targetId: randomUUID(),
      slot: "",
      title: String((payload.localizedTitle as Record<string, unknown>).en),
      localizedTitle: payload.localizedTitle as { en: string; ar: string; ku: string },
      localizedDescription: payload.localizedDescription as { en: string; ar: string; ku: string },
      localizedInstructor: payload.localizedInstructor as { en: string; ar: string; ku: string },
      difficultyLevel: String(payload.difficultyLevel),
      instructionLanguage: String(payload.instructionLanguage),
      requiredEquipment: payload.requiredEquipment as { en: string; ar: string; ku: string } | null,
      joinUrl: String(payload.joinUrl),
      scope: "live",
      partnerId,
      activityStatus: "submitted",
      approvalStatus: "submitted",
      submittedAt,
      reviewedBy,
      accessType: "live",
      active: false,
      city: String(payload.city),
      facility: "Online",
      category: String(payload.category),
      tiers,
      startsAt,
      endsAt,
      cancellationDeadline,
      capacity: Number(payload.capacity),
      additionalPayment: false,
      gender: "all",
      minAge: 0,
      maxAge: null,
    });
    await tx.insert(instructorOfferingAssignments).values({
      id: randomUUID(),
      userId,
      offeringId: id,
      assignedBy: reviewedBy,
    });
  });
  return id;
}

export default router;
