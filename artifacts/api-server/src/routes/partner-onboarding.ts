import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  ReviewPartnerApplicationDocumentBody,
  RequestPartnerApplicationUploadUrlBody,
  SubmitPartnerApplicationBody,
  UpdateMyPartnerApplicationBody,
  UpdatePartnerOnboardingStatusBody,
} from "@workspace/api-zod";
import {
  db,
  facilityProfiles,
  operationAudit,
  operators,
  partnerOnboardingApplications,
  partnerOnboardingDocuments,
  partnerOnboardingEvents,
  partners,
  type PartnerOnboardingStatus,
} from "@workspace/db";
import { hasAdminPermission } from "../lib/admin-roles";
import { canTransitionPartnerOnboarding, isValidPartnerApplicationHours } from "../lib/partner-onboarding";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

export type PartnerOnboardingStorage = Pick<
  ObjectStorageService,
  "createPartnerApplicationUpload" | "getPrivateFile" | "deletePrivateFile"
>;
const maxFileBytes = 10 * 1024 * 1024;
const supportedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensionTypes: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function safeDocumentName(value: string): string {
  return value.normalize("NFC").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 180);
}

function toDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function authenticatedUserId(req: Request, res: Response): string | null {
  const userId = getAuth(req).userId;
  if (!userId) res.status(401).json({ message: "Sign in to access partner onboarding." });
  return userId;
}

async function isPartnerOperationsAdmin(userId: string): Promise<boolean> {
  const [operator] = await db.select({ role: operators.role }).from(operators)
    .where(eq(operators.userId, userId)).limit(1);
  return Boolean(operator && hasAdminPermission(operator.role, "partner_operations"));
}

async function verifiedEmailFor(userId: string): Promise<string | null> {
  const user = await clerkClient.users.getUser(userId);
  const verified = user.emailAddresses.filter(item => item.verification?.status === "verified");
  const primary = verified.find(item => item.id === user.primaryEmailAddressId) ?? verified[0];
  return primary?.emailAddress.toLowerCase() ?? null;
}

async function applicationDetails(applicationId: string) {
  const [application] = await db.select().from(partnerOnboardingApplications)
    .where(eq(partnerOnboardingApplications.id, applicationId)).limit(1);
  if (!application) return null;
  const [documentRows, eventRows] = await Promise.all([
    db.select({
      id: partnerOnboardingDocuments.id,
      applicationId: partnerOnboardingDocuments.applicationId,
      documentType: partnerOnboardingDocuments.documentType,
      documentName: partnerOnboardingDocuments.documentName,
      contentType: partnerOnboardingDocuments.contentType,
      fileSize: partnerOnboardingDocuments.fileSize,
      expiresOn: partnerOnboardingDocuments.expiresOn,
      status: partnerOnboardingDocuments.status,
      reviewNote: partnerOnboardingDocuments.reviewNote,
      uploadedBy: partnerOnboardingDocuments.uploadedBy,
      createdAt: partnerOnboardingDocuments.createdAt,
    }).from(partnerOnboardingDocuments)
      .where(eq(partnerOnboardingDocuments.applicationId, applicationId))
      .orderBy(desc(partnerOnboardingDocuments.createdAt)),
    db.select().from(partnerOnboardingEvents)
      .where(eq(partnerOnboardingEvents.applicationId, applicationId))
      .orderBy(partnerOnboardingEvents.createdAt),
  ]);
  return {
    application,
    documents: documentRows,
    history: eventRows.map(({ actorUserId, ...event }) => ({
      ...event,
      actorKind: actorUserId === application.applicantUserId ? "applicant" as const : "team" as const,
    })),
  };
}

async function applicantApplication(res: Response, userId: string, applicationId: string) {
  const [application] = await db.select().from(partnerOnboardingApplications).where(and(
    eq(partnerOnboardingApplications.id, applicationId),
    eq(partnerOnboardingApplications.applicantUserId, userId),
  )).limit(1);
  if (!application) {
    res.status(404).json({ message: "Partner application not found." });
    return null;
  }
  return application;
}

function validFileRequest(
  input: { documentName: string; documentType: string; contentType: string; size: number; expiresOn?: string | Date | null },
) {
  const documentName = safeDocumentName(input.documentName);
  const extension = documentName.slice(documentName.lastIndexOf(".")).toLowerCase();
  const expiresOn = toDateOnly(input.expiresOn);
  if (!documentName || !supportedTypes.has(input.contentType)
    || !extensionTypes[input.contentType]?.includes(extension)
    || input.size < 1 || input.size > maxFileBytes
    || (input.documentType === "facility_image" && !imageTypes.has(input.contentType))
    || (["licence", "insurance"].includes(input.documentType) && !expiresOn)) {
    return null;
  }
  return { documentName, expiresOn };
}

function validCoordinates(input: { latitude?: number | null; longitude?: number | null }): boolean {
  return (input.latitude == null && input.longitude == null)
    || (input.latitude != null && input.longitude != null);
}

export function createPartnerOnboardingRouter(
  storage: PartnerOnboardingStorage = new ObjectStorageService(),
  emailForUser: (userId: string) => Promise<string | null> = verifiedEmailFor,
) {
  const router = Router();

router.get("/partner-onboarding/mine", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  const [application] = await db.select({ id: partnerOnboardingApplications.id })
    .from(partnerOnboardingApplications)
    .where(eq(partnerOnboardingApplications.applicantUserId, userId))
    .orderBy(desc(partnerOnboardingApplications.createdAt)).limit(1);
  if (!application) {
    res.json({ application: null, documents: [], history: [] });
    return;
  }
  const details = await applicationDetails(application.id);
  res.json(details);
});

router.post("/partner-onboarding/applications", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  const parsed = SubmitPartnerApplicationBody.safeParse(req.body);
  if (!parsed.success || !isValidPartnerApplicationHours(parsed.data?.openingHours ?? [])
    || !validCoordinates(parsed.data ?? {})) {
    res.status(400).json({ message: "Complete the required business and facility details, including one valid opening-hours entry for each day." });
    return;
  }
  const [existingOperator] = await db.select({ userId: operators.userId }).from(operators)
    .where(eq(operators.userId, userId)).limit(1);
  if (existingOperator) {
    res.status(409).json({ message: "This MaydanGo account already has a partner or staff role." });
    return;
  }
  const email = await emailForUser(userId);
  if (!email) {
    res.status(400).json({ message: "Verify an email address on your MaydanGo account before applying." });
    return;
  }
  const input = parsed.data;
  const id = randomUUID();
  try {
    await db.transaction(async tx => {
      await tx.insert(partnerOnboardingApplications).values({
        id,
        applicantUserId: userId,
        applicantName: input.applicantName.trim(),
        contactEmail: email,
        contactPhone: input.contactPhone.trim(),
        legalBusinessName: input.legalBusinessName.trim(),
        facilityName: input.facilityName.trim(),
        address: input.address.trim(),
        city: input.city.trim(),
        district: input.district?.trim() || null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        businessRegistrationReference: input.businessRegistrationReference?.trim() || null,
        taxReference: input.taxReference?.trim() || null,
        activityCategories: input.activityCategories.map(item => item.trim()).filter(Boolean),
        openingHours: input.openingHours,
        capacity: input.capacity ?? null,
        pricingDetails: input.pricingDetails?.trim() || null,
        status: "application_received",
      });
      await tx.insert(partnerOnboardingEvents).values({
        id: randomUUID(),
        applicationId: id,
        actorUserId: userId,
        fromStatus: null,
        toStatus: "application_received",
        note: null,
      });
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: userId,
        action: "partner.onboarding.application_submitted",
        targetId: id,
        detail: "Partner onboarding application submitted.",
      });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      res.status(409).json({ message: "This account already has an active partner application." });
      return;
    }
    throw error;
  }
  res.status(201).json(await applicationDetails(id));
});

router.patch("/partner-onboarding/applications/:id", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  const parsed = UpdateMyPartnerApplicationBody.safeParse(req.body);
  if (!parsed.success || !isValidPartnerApplicationHours(parsed.data?.openingHours ?? [])
    || !validCoordinates(parsed.data ?? {})) {
    res.status(400).json({ message: "Complete the required details and provide valid opening hours for all seven days." });
    return;
  }
  const application = await applicantApplication(res, userId, String(req.params.id));
  if (!application) return;
  if (application.status !== "additional_documents_required") {
    res.status(403).json({ message: "Application details can only be edited after the MaydanGo team requests changes." });
    return;
  }
  const input = parsed.data;
  await db.update(partnerOnboardingApplications).set({
    applicantName: input.applicantName.trim(),
    contactPhone: input.contactPhone.trim(),
    legalBusinessName: input.legalBusinessName.trim(),
    facilityName: input.facilityName.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    district: input.district?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    businessRegistrationReference: input.businessRegistrationReference?.trim() || null,
    taxReference: input.taxReference?.trim() || null,
    activityCategories: input.activityCategories.map(item => item.trim()).filter(Boolean),
    openingHours: input.openingHours,
    capacity: input.capacity ?? null,
    pricingDetails: input.pricingDetails?.trim() || null,
    updatedAt: new Date(),
  }).where(eq(partnerOnboardingApplications.id, application.id));
  await db.insert(operationAudit).values({
    id: randomUUID(),
    actorId: userId,
    action: "partner.onboarding.application_updated",
    targetId: application.id,
    detail: "Applicant updated requested application details.",
  });
  res.json(await applicationDetails(application.id));
});

router.post("/partner-onboarding/applications/:id/documents/upload-url", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  const parsed = RequestPartnerApplicationUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a PDF or image under 10 MB and provide an expiry date for licences and insurance." });
    return;
  }
  const application = await applicantApplication(res, userId, String(req.params.id));
  if (!application) return;
  if (!["application_received", "additional_documents_required"].includes(application.status)) {
    res.status(403).json({ message: "Document uploads are not available at this application stage." });
    return;
  }
  const file = validFileRequest(parsed.data);
  if (!file) {
    res.status(400).json({ message: "The file name, type, size, or document expiry date is not valid." });
    return;
  }
  const id = randomUUID();
  const upload = await storage.createPartnerApplicationUpload(application.id, id);
  await db.insert(partnerOnboardingDocuments).values({
    id,
    applicationId: application.id,
    documentType: parsed.data.documentType,
    documentName: file.documentName,
    documentPath: upload.documentPath,
    expiresOn: file.expiresOn,
    uploadedBy: userId,
    status: "upload_pending",
  });
  res.json({ id, uploadURL: upload.uploadURL });
});

router.post("/partner-onboarding/applications/:id/documents/:documentId/complete", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  const application = await applicantApplication(res, userId, String(req.params.id));
  if (!application) return;
  if (!["application_received", "additional_documents_required"].includes(application.status)) {
    res.status(403).json({ message: "Document uploads are not available at this application stage." });
    return;
  }
  const [document] = await db.select().from(partnerOnboardingDocuments).where(and(
    eq(partnerOnboardingDocuments.id, String(req.params.documentId)),
    eq(partnerOnboardingDocuments.applicationId, application.id),
    eq(partnerOnboardingDocuments.uploadedBy, userId),
    eq(partnerOnboardingDocuments.status, "upload_pending"),
  )).limit(1);
  if (!document) {
    res.status(404).json({ message: "Pending upload not found." });
    return;
  }
  let file;
  try {
    file = await storage.getPrivateFile(document.documentPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ message: "The file has not finished uploading. Try again." });
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
  const size = Number(metadata.size);
  const requested = validFileRequest({
    documentName: document.documentName,
    documentType: document.documentType,
    contentType,
    size,
    expiresOn: document.expiresOn,
  });
  if (!requested || !Number.isInteger(size) || size < 1 || size > maxFileBytes) {
    await storage.deletePrivateFile(document.documentPath);
    await db.update(partnerOnboardingDocuments).set({
      status: "rejected",
      reviewNote: "Uploaded file failed type or size verification.",
      updatedAt: new Date(),
    }).where(eq(partnerOnboardingDocuments.id, document.id));
    res.status(400).json({ message: "The uploaded file failed verification and was removed." });
    return;
  }
  const [updated] = await db.update(partnerOnboardingDocuments).set({
    contentType,
    fileSize: size,
    status: "submitted",
    updatedAt: new Date(),
  }).where(and(
    eq(partnerOnboardingDocuments.id, document.id),
    eq(partnerOnboardingDocuments.status, "upload_pending"),
  )).returning({
    id: partnerOnboardingDocuments.id,
    applicationId: partnerOnboardingDocuments.applicationId,
    documentType: partnerOnboardingDocuments.documentType,
    documentName: partnerOnboardingDocuments.documentName,
    contentType: partnerOnboardingDocuments.contentType,
    fileSize: partnerOnboardingDocuments.fileSize,
    expiresOn: partnerOnboardingDocuments.expiresOn,
    status: partnerOnboardingDocuments.status,
    reviewNote: partnerOnboardingDocuments.reviewNote,
    uploadedBy: partnerOnboardingDocuments.uploadedBy,
    createdAt: partnerOnboardingDocuments.createdAt,
  });
  await db.insert(operationAudit).values({
    id: randomUUID(),
    actorId: userId,
    action: "partner.onboarding.document_uploaded",
    targetId: document.id,
    detail: `application=${application.id};type=${document.documentType}`,
  });
  res.json(updated);
});

router.get("/partner-onboarding/applications/:id/documents/:documentId/download", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  const [document] = await db.select({
    id: partnerOnboardingDocuments.id,
    documentName: partnerOnboardingDocuments.documentName,
    documentPath: partnerOnboardingDocuments.documentPath,
    contentType: partnerOnboardingDocuments.contentType,
    applicationId: partnerOnboardingDocuments.applicationId,
    applicantUserId: partnerOnboardingApplications.applicantUserId,
  }).from(partnerOnboardingDocuments)
    .innerJoin(partnerOnboardingApplications, eq(partnerOnboardingApplications.id, partnerOnboardingDocuments.applicationId))
    .where(and(
      eq(partnerOnboardingDocuments.id, String(req.params.documentId)),
      eq(partnerOnboardingDocuments.applicationId, String(req.params.id)),
      inArray(partnerOnboardingDocuments.status, ["submitted", "approved", "rejected"]),
    )).limit(1);
  if (!document) {
    res.status(404).json({ message: "Document not found." });
    return;
  }
  const adminAccess = await isPartnerOperationsAdmin(userId);
  if (document.applicantUserId !== userId && !adminAccess) {
    res.status(403).json({ message: "This document is outside your access scope." });
    return;
  }
  let file;
  try {
    file = await storage.getPrivateFile(document.documentPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "The private document is no longer available." });
      return;
    }
    throw error;
  }
  const [buffer] = await file.download();
  await db.insert(operationAudit).values({
    id: randomUUID(),
    actorId: userId,
    action: "partner.onboarding.document_downloaded",
    targetId: document.id,
    detail: `application=${document.applicationId}`,
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", document.contentType ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeDocumentName(document.documentName))}`);
  res.send(buffer);
});

router.get("/operations/partner-onboarding/applications", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  if (!await isPartnerOperationsAdmin(userId)) {
    res.status(403).json({ message: "Partner-operations administrator access is required." });
    return;
  }
  const applications = await db.select().from(partnerOnboardingApplications)
    .orderBy(desc(partnerOnboardingApplications.createdAt)).limit(100);
  res.json(applications);
});

router.get("/operations/partner-onboarding/applications/:id", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  if (!await isPartnerOperationsAdmin(userId)) {
    res.status(403).json({ message: "Partner-operations administrator access is required." });
    return;
  }
  const details = await applicationDetails(String(req.params.id));
  if (!details) {
    res.status(404).json({ message: "Partner application not found." });
    return;
  }
  res.json(details);
});

router.patch("/operations/partner-onboarding/applications/:id/documents/:documentId/review", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  if (!await isPartnerOperationsAdmin(userId)) {
    res.status(403).json({ message: "Partner-operations administrator access is required." });
    return;
  }
  const parsed = ReviewPartnerApplicationDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose an approved or rejected outcome and add a clear review note." });
    return;
  }
  const applicationId = String(req.params.id);
  const documentId = String(req.params.documentId);
  const outcome = await db.transaction(async tx => {
    const [application] = await tx.select().from(partnerOnboardingApplications)
      .where(eq(partnerOnboardingApplications.id, applicationId)).for("update");
    if (!application) return { kind: "not_found" as const };
    const [document] = await tx.select().from(partnerOnboardingDocuments).where(and(
      eq(partnerOnboardingDocuments.id, documentId),
      eq(partnerOnboardingDocuments.applicationId, applicationId),
    )).limit(1);
    if (!document) return { kind: "not_found" as const };
    if (document.status !== "submitted") return { kind: "not_submitted" as const };
    const needsMoreDocuments = parsed.data.status === "rejected"
      && application.status !== "additional_documents_required";
    if (needsMoreDocuments && !canTransitionPartnerOnboarding(application.status, "additional_documents_required")) {
      return { kind: "cannot_request_documents" as const };
    }
    const [updated] = await tx.update(partnerOnboardingDocuments).set({
      status: parsed.data.status,
      reviewNote: parsed.data.note.trim(),
      updatedAt: new Date(),
    }).where(and(
      eq(partnerOnboardingDocuments.id, documentId),
      eq(partnerOnboardingDocuments.status, "submitted"),
    )).returning({
      id: partnerOnboardingDocuments.id,
      applicationId: partnerOnboardingDocuments.applicationId,
      documentType: partnerOnboardingDocuments.documentType,
      documentName: partnerOnboardingDocuments.documentName,
      contentType: partnerOnboardingDocuments.contentType,
      fileSize: partnerOnboardingDocuments.fileSize,
      expiresOn: partnerOnboardingDocuments.expiresOn,
      status: partnerOnboardingDocuments.status,
      reviewNote: partnerOnboardingDocuments.reviewNote,
      uploadedBy: partnerOnboardingDocuments.uploadedBy,
      createdAt: partnerOnboardingDocuments.createdAt,
    });
    if (!updated) return { kind: "not_submitted" as const };
    if (needsMoreDocuments) {
      await tx.update(partnerOnboardingApplications).set({
        status: "additional_documents_required",
        statusNote: parsed.data.note.trim(),
        updatedAt: new Date(),
      }).where(eq(partnerOnboardingApplications.id, application.id));
      await tx.insert(partnerOnboardingEvents).values({
        id: randomUUID(),
        applicationId,
        actorUserId: userId,
        fromStatus: application.status,
        toStatus: "additional_documents_required",
        note: parsed.data.note.trim(),
      });
    }
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: userId,
      action: "partner.onboarding.document_reviewed",
      targetId: documentId,
      detail: `application=${applicationId};status=${parsed.data.status}`,
    });
    return { kind: "reviewed" as const, document: updated };
  });
  if (outcome.kind === "not_found") {
    res.status(404).json({ message: "Application document not found." });
    return;
  }
  if (outcome.kind === "not_submitted") {
    res.status(409).json({ message: "Only completed, unreviewed uploads can be reviewed." });
    return;
  }
  if (outcome.kind === "cannot_request_documents") {
    res.status(409).json({ message: "This application cannot return to the additional-documents stage." });
    return;
  }
  res.json(outcome.document);
});

router.patch("/operations/partner-onboarding/applications/:id/status", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;
  if (!await isPartnerOperationsAdmin(userId)) {
    res.status(403).json({ message: "Partner-operations administrator access is required." });
    return;
  }
  const parsed = UpdatePartnerOnboardingStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Provide a valid next stage and a clear note for the applicant." });
    return;
  }
  const applicationId = String(req.params.id);
  try {
    const outcome = await db.transaction(async tx => {
      const [application] = await tx.select().from(partnerOnboardingApplications)
        .where(eq(partnerOnboardingApplications.id, applicationId)).for("update");
      if (!application) return { kind: "not_found" as const };
      const nextStatus = parsed.data.status as PartnerOnboardingStatus;
      if (!canTransitionPartnerOnboarding(application.status, nextStatus)) {
        return { kind: "invalid_transition" as const, currentStatus: application.status };
      }
      let partnerId = application.partnerId;
      if (nextStatus === "facility_setup" && !partnerId) {
        const [existingOperator] = await tx.select({ userId: operators.userId })
          .from(operators).where(eq(operators.userId, application.applicantUserId)).limit(1);
        if (existingOperator) return { kind: "staff_assignment_conflict" as const };
        partnerId = randomUUID();
        await tx.insert(partners).values({
          id: partnerId,
          name: application.legalBusinessName,
          groupId: randomUUID(),
          ownerUserId: application.applicantUserId,
          approved: false,
          logoUrl: null,
        });
        await tx.insert(operators).values({
          userId: application.applicantUserId,
          role: "partner",
          partnerId,
        });
      }
      if (nextStatus === "live") {
        if (!partnerId) return { kind: "facility_setup_missing" as const };
        const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles)
          .where(eq(facilityProfiles.partnerId, partnerId)).limit(1);
        if (!facility) return { kind: "facility_profile_missing" as const };
        await tx.update(partners).set({ approved: true }).where(eq(partners.id, partnerId));
      }
      const [updated] = await tx.update(partnerOnboardingApplications).set({
        status: nextStatus,
        statusNote: parsed.data.note.trim(),
        partnerId,
        updatedAt: new Date(),
      }).where(eq(partnerOnboardingApplications.id, application.id)).returning();
      await tx.insert(partnerOnboardingEvents).values({
        id: randomUUID(),
        applicationId: application.id,
        actorUserId: userId,
        fromStatus: application.status,
        toStatus: nextStatus,
        note: parsed.data.note.trim(),
      });
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: userId,
        action: "partner.onboarding.status_changed",
        targetId: application.id,
        detail: `${application.status}->${nextStatus}`,
      });
      return { kind: "updated" as const, application: updated };
    });
    if (outcome.kind === "not_found") {
      res.status(404).json({ message: "Partner application not found." });
      return;
    }
    if (outcome.kind === "invalid_transition") {
      res.status(400).json({ message: `Cannot move an application from ${outcome.currentStatus} to ${parsed.data.status}.` });
      return;
    }
    if (outcome.kind === "staff_assignment_conflict") {
      res.status(409).json({ message: "The applicant already has a staff assignment and cannot be granted partner-owner access." });
      return;
    }
    if (outcome.kind === "facility_setup_missing") {
      res.status(409).json({ message: "Complete the facility setup stage before marking this application live." });
      return;
    }
    if (outcome.kind === "facility_profile_missing") {
      res.status(409).json({ message: "Create at least one facility profile before marking this application live." });
      return;
    }
    res.json(await applicationDetails(outcome.application.id));
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      res.status(409).json({ message: "This applicant already has a staff assignment or partner record." });
      return;
    }
    throw error;
  }
});

  return router;
}

export default createPartnerOnboardingRouter();
