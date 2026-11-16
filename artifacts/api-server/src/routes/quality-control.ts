import { Router, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { hasAdminPermission } from "../lib/admin-roles";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { listExpiringPartnerDocuments } from "../lib/partner-document-expiry";
import {
  db, facilityProfiles, facilityQualityAssessments, facilityQualityEmergencyContacts, facilityQualityIncidents,
  operationAudit, operators, partners, partnerComplianceDocuments,
} from "@workspace/db";
import {
  CompletePartnerComplianceUploadParams, CompletePartnerComplianceUploadResponse,
  CreateFacilityQualityAssessmentBody, CreateFacilityQualityAssessmentResponse,
  CreateFacilityQualityIncidentBody, CreateFacilityQualityIncidentResponse,
  DownloadPartnerComplianceDocumentParams,
  GetFacilityQualityControlResponse, UpdateFacilityQualityAssessmentBody,
  UpdateFacilityQualityAssessmentParams, UpdateFacilityQualityAssessmentResponse,
  UpdateFacilityQualityIncidentBody, UpdateFacilityQualityIncidentParams,
  UpdateFacilityQualityIncidentResponse, UpsertFacilityEmergencyContactBody,
  UpsertFacilityEmergencyContactParams, UpsertFacilityEmergencyContactResponse,
  RequestPartnerComplianceUploadUrlBody, RequestPartnerComplianceUploadUrlResponse,
  ReviewPartnerComplianceDocumentBody, ReviewPartnerComplianceDocumentParams, ReviewPartnerComplianceDocumentResponse,
} from "@workspace/api-zod";

const router = Router();
const objectStorage = new ObjectStorageService();
const MAX_COMPLIANCE_DOCUMENT_BYTES = 10 * 1024 * 1024;
const allowedComplianceMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
type Operator = typeof operators.$inferSelect;
type QualityStatus = "approved" | "action_required" | "suspended";
type ComplianceDocumentType = "licence" | "insurance" | "supporting_document";
type ComplianceDocumentStatus = "upload_pending" | "submitted" | "approved" | "rejected";

function sanitizedComplianceDocumentName(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return name || null;
}

function expectedComplianceMimeType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return null;
}

function validComplianceExpiry(documentType: ComplianceDocumentType, expiresOn: Date | null) {
  const dateOnly = toDateOnly(expiresOn);
  if (documentType !== "supporting_document" && !dateOnly) return false;
  if (!dateOnly) return true;
  const time = Date.parse(`${dateOnly}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === dateOnly;
}

async function complianceDocumentDetail(id: string) {
  const [row] = await db.select({
    id: partnerComplianceDocuments.id,
    facilityId: partnerComplianceDocuments.facilityId,
    partnerId: partnerComplianceDocuments.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    documentType: partnerComplianceDocuments.documentType,
    documentName: partnerComplianceDocuments.documentName,
    contentType: partnerComplianceDocuments.contentType,
    fileSize: partnerComplianceDocuments.fileSize,
    expiresOn: partnerComplianceDocuments.expiresOn,
    status: partnerComplianceDocuments.status,
    reviewNote: partnerComplianceDocuments.reviewNote,
    reviewedAt: partnerComplianceDocuments.reviewedAt,
    createdAt: partnerComplianceDocuments.createdAt,
    updatedAt: partnerComplianceDocuments.updatedAt,
  }).from(partnerComplianceDocuments)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, partnerComplianceDocuments.facilityId))
    .innerJoin(partners, eq(partners.id, partnerComplianceDocuments.partnerId))
    .where(eq(partnerComplianceDocuments.id, id)).limit(1);
  return row;
}

router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to access facility quality records." });
    return;
  }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (!operator || (!hasAdminPermission(operator.role, "fraud_compliance") && operator.role !== "partner")) {
    res.status(403).json({ message: "Administrator or approved partner access is required." });
    return;
  }
  if (operator.role === "partner") {
    if (!operator.partnerId) {
      res.status(403).json({ message: "This partner account is not assigned to a partner." });
      return;
    }
    const [partner] = await db.select({ approved: partners.approved })
      .from(partners).where(eq(partners.id, operator.partnerId)).limit(1);
    if (!partner?.approved) {
      res.status(403).json({ message: "Partner approval is required for quality records." });
      return;
    }
  }
  res.locals.qualityOperator = operator;
  next();
});

function operatorFor(res: Response): Operator {
  return res.locals.qualityOperator as Operator;
}

function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isCalendarDate(value: string | null) {
  if (value === null) return true;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function assessmentError(input: {
  reviewedOn: Date;
  nextReviewOn: Date | null;
  status: QualityStatus;
  hygieneChecklist: Record<string, string>;
  safetyChecklist: Record<string, string>;
  correctiveAction: string | null;
  correctiveDueOn: Date | null;
}) {
  const reviewedOn = toDateOnly(input.reviewedOn);
  const nextReviewOn = toDateOnly(input.nextReviewOn);
  const correctiveDueOn = toDateOnly(input.correctiveDueOn);
  if (!isCalendarDate(reviewedOn) || !isCalendarDate(nextReviewOn) || !isCalendarDate(correctiveDueOn)) {
    return "Use valid calendar dates.";
  }
  if (reviewedOn && nextReviewOn && nextReviewOn <= reviewedOn) {
    return "The next review date must be after the inspection date.";
  }
  const hasFailedCheck = [...Object.values(input.hygieneChecklist), ...Object.values(input.safetyChecklist)]
    .includes("action_required");
  if (input.status === "approved" && hasFailedCheck) {
    return "An assessment with outstanding checklist items cannot be marked approved.";
  }
  const hasAction = Boolean(input.correctiveAction?.trim());
  if ((input.status !== "approved" || hasFailedCheck) && (!hasAction || !correctiveDueOn)) {
    return "Add a corrective action and due date while any item needs attention.";
  }
  if (hasAction !== Boolean(correctiveDueOn)) {
    return "A corrective action and due date must be set together.";
  }
  return null;
}

async function assessmentDetail(id: string) {
  const [row] = await db.select({
    id: facilityQualityAssessments.id,
    facilityId: facilityQualityAssessments.facilityId,
    partnerId: facilityQualityAssessments.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    reviewedOn: facilityQualityAssessments.reviewedOn,
    nextReviewOn: facilityQualityAssessments.nextReviewOn,
    licenceExpiresOn: facilityQualityAssessments.licenceExpiresOn,
    insuranceExpiresOn: facilityQualityAssessments.insuranceExpiresOn,
    hygieneChecklist: facilityQualityAssessments.hygieneChecklist,
    safetyChecklist: facilityQualityAssessments.safetyChecklist,
    status: facilityQualityAssessments.status,
    findings: facilityQualityAssessments.findings,
    correctiveAction: facilityQualityAssessments.correctiveAction,
    correctiveDueOn: facilityQualityAssessments.correctiveDueOn,
    createdBy: facilityQualityAssessments.createdBy,
    updatedBy: facilityQualityAssessments.updatedBy,
    createdAt: facilityQualityAssessments.createdAt,
    updatedAt: facilityQualityAssessments.updatedAt,
  }).from(facilityQualityAssessments)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityAssessments.facilityId))
    .innerJoin(partners, eq(partners.id, facilityQualityAssessments.partnerId))
    .where(eq(facilityQualityAssessments.id, id)).limit(1);
  return row;
}

async function incidentDetail(id: string) {
  const [row] = await db.select({
    id: facilityQualityIncidents.id,
    facilityId: facilityQualityIncidents.facilityId,
    partnerId: facilityQualityIncidents.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    incidentType: facilityQualityIncidents.incidentType,
    occurredAt: facilityQualityIncidents.occurredAt,
    description: facilityQualityIncidents.description,
    status: facilityQualityIncidents.status,
    resolution: facilityQualityIncidents.resolution,
    reportedBy: facilityQualityIncidents.reportedBy,
    updatedBy: facilityQualityIncidents.updatedBy,
    createdAt: facilityQualityIncidents.createdAt,
    updatedAt: facilityQualityIncidents.updatedAt,
  }).from(facilityQualityIncidents)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityIncidents.facilityId))
    .innerJoin(partners, eq(partners.id, facilityQualityIncidents.partnerId))
    .where(eq(facilityQualityIncidents.id, id)).limit(1);
  return row;
}

async function emergencyContactDetail(facilityId: string) {
  const [row] = await db.select({
    facilityId: facilityQualityEmergencyContacts.facilityId,
    partnerId: facilityQualityEmergencyContacts.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    contactName: facilityQualityEmergencyContacts.contactName,
    contactRole: facilityQualityEmergencyContacts.contactRole,
    contactPhone: facilityQualityEmergencyContacts.contactPhone,
    verifiedAt: facilityQualityEmergencyContacts.verifiedAt,
    updatedAt: facilityQualityEmergencyContacts.updatedAt,
  }).from(facilityQualityEmergencyContacts)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityEmergencyContacts.facilityId))
    .innerJoin(partners, eq(partners.id, facilityQualityEmergencyContacts.partnerId))
    .where(eq(facilityQualityEmergencyContacts.facilityId, facilityId)).limit(1);
  if (!row) return undefined;
  return {
    ...row,
    verificationStatus: row.verifiedAt ? "verified" : "pending",
  };
}

router.get("/", async (_req, res): Promise<void> => {
  const operator = operatorFor(res);
  const partnerScope = operator.role === "partner" ? operator.partnerId : null;
  const facilityCondition = partnerScope ? eq(facilityProfiles.partnerId, partnerScope) : undefined;
  const assessmentCondition = partnerScope ? eq(facilityQualityAssessments.partnerId, partnerScope) : undefined;
  const incidentCondition = partnerScope ? eq(facilityQualityIncidents.partnerId, partnerScope) : undefined;
  const contactCondition = partnerScope ? eq(facilityQualityEmergencyContacts.partnerId, partnerScope) : undefined;
  const documentCondition = and(
    ne(partnerComplianceDocuments.status, "upload_pending"),
    partnerScope ? eq(partnerComplianceDocuments.partnerId, partnerScope) : undefined,
  );
  const [facilities, assessmentRows, incidentRows, contactRows, complianceDocuments] = await Promise.all([
    db.select({
      id: facilityProfiles.id,
      partnerId: facilityProfiles.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
    }).from(facilityProfiles)
      .innerJoin(partners, eq(partners.id, facilityProfiles.partnerId))
      .where(facilityCondition)
      .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility))
      .limit(300),
    db.select({
      id: facilityQualityAssessments.id,
      facilityId: facilityQualityAssessments.facilityId,
      partnerId: facilityQualityAssessments.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      reviewedOn: facilityQualityAssessments.reviewedOn,
      nextReviewOn: facilityQualityAssessments.nextReviewOn,
      licenceExpiresOn: facilityQualityAssessments.licenceExpiresOn,
      insuranceExpiresOn: facilityQualityAssessments.insuranceExpiresOn,
      hygieneChecklist: facilityQualityAssessments.hygieneChecklist,
      safetyChecklist: facilityQualityAssessments.safetyChecklist,
      status: facilityQualityAssessments.status,
      findings: facilityQualityAssessments.findings,
      correctiveAction: facilityQualityAssessments.correctiveAction,
      correctiveDueOn: facilityQualityAssessments.correctiveDueOn,
      createdBy: facilityQualityAssessments.createdBy,
      updatedBy: facilityQualityAssessments.updatedBy,
      createdAt: facilityQualityAssessments.createdAt,
      updatedAt: facilityQualityAssessments.updatedAt,
    }).from(facilityQualityAssessments)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityAssessments.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityAssessments.partnerId))
      .where(assessmentCondition)
      .orderBy(desc(facilityQualityAssessments.reviewedOn), desc(facilityQualityAssessments.createdAt))
      .limit(250),
    db.select({
      id: facilityQualityIncidents.id,
      facilityId: facilityQualityIncidents.facilityId,
      partnerId: facilityQualityIncidents.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      incidentType: facilityQualityIncidents.incidentType,
      occurredAt: facilityQualityIncidents.occurredAt,
      description: facilityQualityIncidents.description,
      status: facilityQualityIncidents.status,
      resolution: facilityQualityIncidents.resolution,
      reportedBy: facilityQualityIncidents.reportedBy,
      updatedBy: facilityQualityIncidents.updatedBy,
      createdAt: facilityQualityIncidents.createdAt,
      updatedAt: facilityQualityIncidents.updatedAt,
    }).from(facilityQualityIncidents)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityIncidents.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityIncidents.partnerId))
      .where(incidentCondition)
      .orderBy(desc(facilityQualityIncidents.createdAt))
      .limit(250),
    db.select({
      facilityId: facilityQualityEmergencyContacts.facilityId,
      partnerId: facilityQualityEmergencyContacts.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      contactName: facilityQualityEmergencyContacts.contactName,
      contactRole: facilityQualityEmergencyContacts.contactRole,
      contactPhone: facilityQualityEmergencyContacts.contactPhone,
      verifiedAt: facilityQualityEmergencyContacts.verifiedAt,
      updatedAt: facilityQualityEmergencyContacts.updatedAt,
    }).from(facilityQualityEmergencyContacts)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityEmergencyContacts.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityEmergencyContacts.partnerId))
      .where(contactCondition)
      .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility)),
    db.select({
      id: partnerComplianceDocuments.id,
      facilityId: partnerComplianceDocuments.facilityId,
      partnerId: partnerComplianceDocuments.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      documentType: partnerComplianceDocuments.documentType,
      documentName: partnerComplianceDocuments.documentName,
      contentType: partnerComplianceDocuments.contentType,
      fileSize: partnerComplianceDocuments.fileSize,
      expiresOn: partnerComplianceDocuments.expiresOn,
      status: partnerComplianceDocuments.status,
      reviewNote: partnerComplianceDocuments.reviewNote,
      reviewedAt: partnerComplianceDocuments.reviewedAt,
      createdAt: partnerComplianceDocuments.createdAt,
      updatedAt: partnerComplianceDocuments.updatedAt,
    }).from(partnerComplianceDocuments)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, partnerComplianceDocuments.facilityId))
      .innerJoin(partners, eq(partners.id, partnerComplianceDocuments.partnerId))
      .where(documentCondition)
      .orderBy(desc(partnerComplianceDocuments.createdAt))
      .limit(500),
  ]);
  const expiringDocuments = await listExpiringPartnerDocuments(partnerScope);
  res.json(GetFacilityQualityControlResponse.parse({
    role: operator.role,
    facilities,
    assessments: assessmentRows,
    incidents: incidentRows,
    expiringDocuments,
    emergencyContacts: contactRows.map(row => ({
      ...row,
      verificationStatus: row.verifiedAt ? "verified" : "pending",
    })),
    complianceDocuments,
  }));
});

router.post("/documents/upload-url", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (operator.role !== "partner" || !operator.partnerId) {
    res.status(403).json({ message: "Only an approved partner can upload compliance documents." });
    return;
  }
  const parsed = RequestPartnerComplianceUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a supported document and a file no larger than 10 MB." });
    return;
  }
  const input = parsed.data;
  const documentName = sanitizedComplianceDocumentName(input.documentName);
  const expectedMime = documentName ? expectedComplianceMimeType(documentName) : null;
  if (!documentName || !expectedMime || !allowedComplianceMimeTypes.has(expectedMime)
    || !validComplianceExpiry(input.documentType as ComplianceDocumentType, input.expiresOn)) {
    res.status(400).json({ message: "Use a PDF, JPEG, or PNG file. Licences and insurance need an expiry date." });
    return;
  }
  const [facility] = await db.select({ id: facilityProfiles.id, partnerId: facilityProfiles.partnerId })
    .from(facilityProfiles).where(and(
      eq(facilityProfiles.id, input.facilityId),
      eq(facilityProfiles.partnerId, operator.partnerId),
    )).limit(1);
  if (!facility) {
    res.status(404).json({ message: "Facility not found within the partner's scope." });
    return;
  }
  const id = randomUUID();
  const upload = await objectStorage.createPartnerComplianceUpload(operator.partnerId, facility.id, id);
  await db.insert(partnerComplianceDocuments).values({
    id,
    partnerId: operator.partnerId,
    facilityId: facility.id,
    documentType: input.documentType as ComplianceDocumentType,
    documentName,
    documentPath: upload.documentPath,
    expiresOn: toDateOnly(input.expiresOn),
    uploadedBy: operator.userId,
    status: "upload_pending",
  });
  res.json(RequestPartnerComplianceUploadUrlResponse.parse({ id, uploadURL: upload.uploadURL }));
});

router.post("/documents/:id/complete", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (operator.role !== "partner" || !operator.partnerId) {
    res.status(403).json({ message: "Only the owning partner can complete this upload." });
    return;
  }
  const params = CompletePartnerComplianceUploadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Use a valid upload identifier." });
    return;
  }
  const [document] = await db.select().from(partnerComplianceDocuments).where(and(
    eq(partnerComplianceDocuments.id, params.data.id),
    eq(partnerComplianceDocuments.partnerId, operator.partnerId),
    eq(partnerComplianceDocuments.status, "upload_pending"),
  )).limit(1);
  if (!document) {
    res.status(404).json({ message: "Upload not found within the partner's scope." });
    return;
  }
  let file;
  try {
    file = await objectStorage.getPrivateFile(document.documentPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ message: "The file has not finished uploading. Please try again." });
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const contentType = typeof metadata.contentType === "string" ? metadata.contentType : null;
  const fileSize = Number(metadata.size);
  if (!contentType || !allowedComplianceMimeTypes.has(contentType)
    || expectedComplianceMimeType(document.documentName) !== contentType
    || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_COMPLIANCE_DOCUMENT_BYTES) {
    await objectStorage.deletePrivateFile(document.documentPath);
    await db.transaction(async tx => {
      await tx.update(partnerComplianceDocuments).set({
        status: "rejected",
        reviewNote: "Upload rejected because its file type or size was not supported.",
        updatedAt: new Date(),
      }).where(and(
        eq(partnerComplianceDocuments.id, document.id),
        eq(partnerComplianceDocuments.status, "upload_pending"),
      ));
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: operator.userId,
        action: "partner.compliance_document.upload_rejected",
        targetId: document.id,
        detail: `partner=${operator.partnerId};facility=${document.facilityId};type=${document.documentType}`,
      });
    });
    res.status(400).json({ message: "The uploaded file must be a matching PDF, JPEG, or PNG no larger than 10 MB." });
    return;
  }
  const updated = await db.transaction(async tx => {
    const [current] = await tx.select({ status: partnerComplianceDocuments.status })
      .from(partnerComplianceDocuments)
      .where(eq(partnerComplianceDocuments.id, document.id))
      .for("update");
    if (!current || current.status !== "upload_pending") return false;
    await tx.update(partnerComplianceDocuments).set({
      status: "submitted",
      contentType,
      fileSize,
      updatedAt: new Date(),
    }).where(eq(partnerComplianceDocuments.id, document.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "partner.compliance_document.submitted",
      targetId: document.id,
      detail: `partner=${operator.partnerId};facility=${document.facilityId};type=${document.documentType}`,
    });
    return true;
  });
  if (!updated) {
    res.status(409).json({ message: "This upload has already been completed." });
    return;
  }
  const response = await complianceDocumentDetail(document.id);
  if (!response) {
    res.status(500).json({ message: "The submitted document could not be loaded." });
    return;
  }
  res.json(CompletePartnerComplianceUploadResponse.parse(response));
});

router.get("/documents/:id/file", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  const params = DownloadPartnerComplianceDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "Use a valid document identifier." });
    return;
  }
  const [document] = await db.select().from(partnerComplianceDocuments)
    .where(eq(partnerComplianceDocuments.id, params.data.id)).limit(1);
  if (!document || document.status === "upload_pending" || !document.contentType
    || (operator.role === "partner" && document.partnerId !== operator.partnerId)) {
    res.status(404).json({ message: "Document not found within the operator's scope." });
    return;
  }
  if (operator.role !== "partner" && !hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Safety administrator access is required to open partner documents." });
    return;
  }
  let file;
  try {
    file = await objectStorage.getPrivateFile(document.documentPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Document file not found." });
      return;
    }
    throw error;
  }
  const [metadata] = await file.getMetadata();
  const contentType = document.contentType && allowedComplianceMimeTypes.has(document.contentType)
    ? document.contentType
    : "application/octet-stream";
  const fileName = document.documentName.replace(/["\\\r\n]/g, "_");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(metadata.size ?? document.fileSize ?? 0));
  Readable.from(file.createReadStream()).on("error", error => {
    req.log.error({ error, documentId: document.id }, "Partner document streaming failed");
    if (!res.headersSent) res.status(500);
    res.end();
  }).pipe(res);
});

router.patch("/documents/:id/review", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only a safety administrator can review partner documents." });
    return;
  }
  const params = ReviewPartnerComplianceDocumentParams.safeParse(req.params);
  const parsed = ReviewPartnerComplianceDocumentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose an approval decision and enter a reason when rejecting." });
    return;
  }
  const reviewNote = parsed.data.reviewNote?.trim() || null;
  if (parsed.data.status === "rejected" && (!reviewNote || reviewNote.length < 5)) {
    res.status(400).json({ message: "A rejection reason of at least five characters is required." });
    return;
  }
  const reviewedAt = new Date();
  const updated = await db.transaction(async tx => {
    const [current] = await tx.select().from(partnerComplianceDocuments)
      .where(eq(partnerComplianceDocuments.id, params.data.id))
      .for("update");
    if (!current || current.status !== "submitted" || !current.contentType || !current.fileSize) return false;
    await tx.update(partnerComplianceDocuments).set({
      status: parsed.data.status as ComplianceDocumentStatus,
      reviewNote,
      reviewedBy: operator.userId,
      reviewedAt,
      updatedAt: reviewedAt,
    }).where(eq(partnerComplianceDocuments.id, current.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: `partner.compliance_document.${parsed.data.status}`,
      targetId: current.id,
      detail: `partner=${current.partnerId};facility=${current.facilityId};type=${current.documentType}`,
    });
    return true;
  });
  if (!updated) {
    res.status(404).json({ message: "Submitted document not found." });
    return;
  }
  const response = await complianceDocumentDetail(params.data.id);
  if (!response) {
    res.status(500).json({ message: "The reviewed document could not be loaded." });
    return;
  }
  res.json(ReviewPartnerComplianceDocumentResponse.parse(response));
});

router.put("/emergency-contacts/:id", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  const params = UpsertFacilityEmergencyContactParams.safeParse(req.params);
  const parsed = UpsertFacilityEmergencyContactBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Enter a contact name, facility role, and valid phone number." });
    return;
  }
  const input = parsed.data;
  const contactName = input.contactName.trim();
  const contactRole = input.contactRole.trim();
  const contactPhone = input.contactPhone.trim();
  const phoneDigits = contactPhone.replace(/\D/g, "");
  if (!contactName || contactRole.length < 2 || phoneDigits.length < 7 || phoneDigits.length > 15) {
    res.status(400).json({ message: "Enter a contact name, facility role, and valid phone number." });
    return;
  }
  const isSafetyAdmin = hasAdminPermission(operator.role, "fraud_compliance");
  if (input.verified && !isSafetyAdmin) {
    res.status(403).json({ message: "Only a safety administrator can verify facility emergency contacts." });
    return;
  }
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles).where(eq(facilityProfiles.id, params.data.id)).limit(1);
  if (!facility || (operator.role === "partner" && facility.partnerId !== operator.partnerId)) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }

  const actorId = operator.userId;
  const now = new Date();
  await db.transaction(async tx => {
    const [current] = await tx.select().from(facilityQualityEmergencyContacts)
      .where(eq(facilityQualityEmergencyContacts.facilityId, facility.id))
      .for("update");
    const fieldsChanged = !current
      || current.contactName !== contactName
      || current.contactRole !== contactRole
      || current.contactPhone !== contactPhone;
    const wasVerified = Boolean(current?.verifiedAt);
    let verifiedAt: Date | null = null;
    let verifiedBy: string | null = null;
    if (isSafetyAdmin && input.verified) {
      verifiedAt = fieldsChanged || !current?.verifiedAt ? now : current.verifiedAt;
      verifiedBy = fieldsChanged || !current?.verifiedBy ? actorId : current.verifiedBy;
    } else if (operator.role === "partner" && !fieldsChanged && current?.verifiedAt) {
      verifiedAt = current.verifiedAt;
      verifiedBy = current.verifiedBy;
    }
    const nextVerified = Boolean(verifiedAt);
    const values = {
      facilityId: facility.id,
      partnerId: facility.partnerId,
      contactName,
      contactRole,
      contactPhone,
      verifiedAt,
      verifiedBy,
      updatedBy: actorId,
      updatedAt: now,
    };
    await tx.insert(facilityQualityEmergencyContacts).values({
      ...values,
      createdBy: actorId,
    }).onConflictDoUpdate({
      target: facilityQualityEmergencyContacts.facilityId,
      set: {
        partnerId: values.partnerId,
        contactName: values.contactName,
        contactRole: values.contactRole,
        contactPhone: values.contactPhone,
        verifiedAt: values.verifiedAt,
        verifiedBy: values.verifiedBy,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    });
    if (fieldsChanged || wasVerified !== nextVerified) {
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId,
        action: "facility.quality.emergency_contact.updated",
        targetId: facility.id,
        detail: `changed_fields=${fieldsChanged ? "contact_name,contact_role,contact_phone" : "none"};verification=${wasVerified ? "verified" : "pending"}->${nextVerified ? "verified" : "pending"}`,
      });
    }
  });

  const contact = await emergencyContactDetail(facility.id);
  if (!contact) {
    res.status(500).json({ message: "The facility contact could not be loaded after saving." });
    return;
  }
  res.json(UpsertFacilityEmergencyContactResponse.parse(contact));
});

router.post("/assessments", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can record facility inspections." });
    return;
  }
  const parsed = CreateFacilityQualityAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Complete the required inspection details." });
    return;
  }
  const input = parsed.data;
  const validation = assessmentError(input);
  if (validation) {
    res.status(400).json({ message: validation });
    return;
  }
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles).where(eq(facilityProfiles.id, input.facilityId)).limit(1);
  if (!facility) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }
  const id = randomUUID();
  const actorId = operator.userId;
  await db.transaction(async tx => {
    await tx.insert(facilityQualityAssessments).values({
      id,
      facilityId: facility.id,
      partnerId: facility.partnerId,
      reviewedOn: toDateOnly(input.reviewedOn)!,
      nextReviewOn: toDateOnly(input.nextReviewOn),
      licenceExpiresOn: toDateOnly(input.licenceExpiresOn),
      insuranceExpiresOn: toDateOnly(input.insuranceExpiresOn),
      hygieneChecklist: input.hygieneChecklist,
      safetyChecklist: input.safetyChecklist,
      status: input.status,
      findings: input.findings.trim(),
      correctiveAction: input.correctiveAction?.trim() || null,
      correctiveDueOn: toDateOnly(input.correctiveDueOn),
      createdBy: actorId,
      updatedBy: actorId,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId,
      action: "facility.quality.assessment.created",
      targetId: id,
      detail: JSON.stringify({
        facilityId: facility.id,
        reviewedOn: toDateOnly(input.reviewedOn),
        status: input.status,
        nextReviewOn: toDateOnly(input.nextReviewOn),
        licenceExpiresOn: toDateOnly(input.licenceExpiresOn),
        insuranceExpiresOn: toDateOnly(input.insuranceExpiresOn),
      }),
    });
  });
  const row = await assessmentDetail(id);
  if (!row) {
    res.status(500).json({ message: "The inspection could not be loaded after saving." });
    return;
  }
  res.status(201).json(CreateFacilityQualityAssessmentResponse.parse(row));
});

router.patch("/assessments/:id", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can update inspection follow-up." });
    return;
  }
  const params = UpdateFacilityQualityAssessmentParams.safeParse(req.params);
  const parsed = UpdateFacilityQualityAssessmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid status and corrective-action plan." });
    return;
  }
  const input = parsed.data;
  const correctiveAction = input.correctiveAction?.trim() || null;
  const correctiveDueOn = toDateOnly(input.correctiveDueOn);
  if (input.status !== "approved" && (!correctiveAction || !correctiveDueOn)) {
    res.status(400).json({ message: "A corrective action and due date are required until the facility is approved." });
    return;
  }
  if (Boolean(correctiveAction) !== Boolean(correctiveDueOn)) {
    res.status(400).json({ message: "A corrective action and due date must be set together." });
    return;
  }
  const [current] = await db.select({
    id: facilityQualityAssessments.id,
    status: facilityQualityAssessments.status,
    correctiveDueOn: facilityQualityAssessments.correctiveDueOn,
    correctiveAction: facilityQualityAssessments.correctiveAction,
    hygieneChecklist: facilityQualityAssessments.hygieneChecklist,
    safetyChecklist: facilityQualityAssessments.safetyChecklist,
  }).from(facilityQualityAssessments).where(eq(facilityQualityAssessments.id, params.data.id)).limit(1);
  if (!current) {
    res.status(404).json({ message: "Assessment not found." });
    return;
  }
  const hasFailedCheck = [...Object.values(current.hygieneChecklist), ...Object.values(current.safetyChecklist)]
    .includes("action_required");
  if (input.status === "approved" && hasFailedCheck) {
    res.status(400).json({ message: "Outstanding checklist items must be cleared before approval." });
    return;
  }
  await db.transaction(async tx => {
    await tx.update(facilityQualityAssessments).set({
      status: input.status,
      correctiveAction,
      correctiveDueOn,
      updatedBy: operator.userId,
      updatedAt: new Date(),
    }).where(eq(facilityQualityAssessments.id, current.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.quality.assessment.follow_up",
      targetId: current.id,
      detail: JSON.stringify({
        fromStatus: current.status,
        toStatus: input.status,
        fromDueOn: current.correctiveDueOn,
        toDueOn: correctiveDueOn,
        correctiveActionChanged: current.correctiveAction !== correctiveAction,
      }),
    });
  });
  const row = await assessmentDetail(current.id);
  if (!row) {
    res.status(500).json({ message: "The inspection could not be loaded after updating." });
    return;
  }
  res.json(UpdateFacilityQualityAssessmentResponse.parse(row));
});

router.post("/incidents", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  const parsed = CreateFacilityQualityIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Complete the incident type, date, and description." });
    return;
  }
  const description = parsed.data.description.trim();
  if (description.length < 10) {
    res.status(400).json({ message: "Add a brief description of at least 10 characters." });
    return;
  }
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles).where(eq(facilityProfiles.id, parsed.data.facilityId)).limit(1);
  if (!facility || (operator.role === "partner" && facility.partnerId !== operator.partnerId)) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(facilityQualityIncidents).values({
      id,
      facilityId: facility.id,
      partnerId: facility.partnerId,
      incidentType: parsed.data.incidentType,
      occurredAt: parsed.data.occurredAt,
      description,
      reportedBy: operator.userId,
      updatedBy: operator.userId,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.quality.incident.created",
      targetId: id,
      detail: JSON.stringify({
        facilityId: facility.id,
        incidentType: parsed.data.incidentType,
        occurredAt: parsed.data.occurredAt.toISOString(),
      }),
    });
  });
  const row = await incidentDetail(id);
  if (!row) {
    res.status(500).json({ message: "The incident could not be loaded after saving." });
    return;
  }
  res.status(201).json(CreateFacilityQualityIncidentResponse.parse(row));
});

router.patch("/incidents/:id", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can review incident reports." });
    return;
  }
  const params = UpdateFacilityQualityIncidentParams.safeParse(req.params);
  const parsed = UpdateFacilityQualityIncidentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid incident status and resolution." });
    return;
  }
  const resolution = parsed.data.resolution?.trim() || null;
  if (parsed.data.status === "resolved" && (!resolution || resolution.length < 5)) {
    res.status(400).json({ message: "Add a resolution of at least 5 characters before closing a report." });
    return;
  }
  const [current] = await db.select({
    id: facilityQualityIncidents.id,
    status: facilityQualityIncidents.status,
    resolution: facilityQualityIncidents.resolution,
  }).from(facilityQualityIncidents).where(eq(facilityQualityIncidents.id, params.data.id)).limit(1);
  if (!current) {
    res.status(404).json({ message: "Incident report not found." });
    return;
  }
  await db.transaction(async tx => {
    await tx.update(facilityQualityIncidents).set({
      status: parsed.data.status,
      resolution,
      updatedBy: operator.userId,
      updatedAt: new Date(),
    }).where(eq(facilityQualityIncidents.id, current.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.quality.incident.review",
      targetId: current.id,
      detail: JSON.stringify({
        fromStatus: current.status,
        toStatus: parsed.data.status,
        resolutionChanged: current.resolution !== resolution,
      }),
    });
  });
  const row = await incidentDetail(current.id);
  if (!row) {
    res.status(500).json({ message: "The incident could not be loaded after updating." });
    return;
  }
  res.json(UpdateFacilityQualityIncidentResponse.parse(row));
});

export default router;
