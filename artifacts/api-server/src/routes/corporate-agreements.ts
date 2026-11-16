import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  CompleteCorporateAgreementUploadResponse,
  CompleteCorporateAgreementUploadBody,
  CreateCorporateAgreementDraftBody,
  CreateCorporateAgreementDraftResponse,
  GetCorporateAgreementVersionsResponse,
  GetMyCorporateAgreementVersionsResponse,
  RequestCorporateAgreementUploadUrlBody,
  RequestCorporateAgreementUploadUrlResponse,
  ReviewCorporateAgreementDraftBody,
  ReviewCorporateAgreementDraftResponse,
  UpdateCorporateAgreementDraftBody,
  UpdateCorporateAgreementDraftResponse,
} from "@workspace/api-zod";
import {
  corporateAdministrators,
  corporateAgreementVersions,
  corporateOrganizations,
  db,
  operationAudit,
  operators,
} from "@workspace/db";
import { hasAdminPermission } from "../lib/admin-roles";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { CORPORATE_AGREEMENT_TEMPLATE } from "../lib/corporate-agreement-template";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = new Set(["application/pdf"]);
type Operator = typeof operators.$inferSelect;
export type CorporateAgreementStorage = Pick<
  ObjectStorageService,
  "createCorporateAgreementUpload" | "getPrivateFile" | "deletePrivateFile"
>;

type VersionRow = {
  version: typeof corporateAgreementVersions.$inferSelect;
  organizationName: string;
};

function sanitizedName(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return name || null;
}

function isPdfName(name: string) {
  return name.split(".").pop()?.toLowerCase() === "pdf";
}

function toVersion(
  row: VersionRow,
  replacesVersionNumber: number | null,
  includeReviewNote: boolean,
) {
  const { version } = row;
  return {
    id: version.id,
    organizationId: version.organizationId,
    organizationName: row.organizationName,
    versionNumber: version.versionNumber,
    replacesVersionNumber,
    agreementText: version.agreementText,
    changeSummary: version.changeSummary,
    status: version.status,
    reviewNote: includeReviewNote ? version.reviewNote : null,
    signedDocumentName: version.signedDocumentName,
    signedContentType: version.signedContentType,
    signedFileSize: version.signedFileSize,
    reviewedAt: version.reviewedAt?.toISOString() ?? null,
    signedAt: version.signedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

async function listVersions(organizationId: string, includeReviewNote: boolean) {
  const rows = await db.select({
    version: corporateAgreementVersions,
    organizationName: corporateOrganizations.name,
  }).from(corporateAgreementVersions)
    .innerJoin(corporateOrganizations, eq(corporateOrganizations.id, corporateAgreementVersions.organizationId))
    .where(eq(corporateAgreementVersions.organizationId, organizationId))
    .orderBy(desc(corporateAgreementVersions.versionNumber));
  const numberById = new Map(rows.map(row => [row.version.id, row.version.versionNumber]));
  return rows.map(row => toVersion(
    row,
    row.version.replacesVersionId ? numberById.get(row.version.replacesVersionId) ?? null : null,
    includeReviewNote,
  ));
}

async function getOperator(userId: string) {
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  return operator;
}

async function isCompanyAdministrator(userId: string, organizationId: string) {
  const [row] = await db.select({ id: corporateAdministrators.id })
    .from(corporateAdministrators)
    .innerJoin(corporateOrganizations, eq(corporateOrganizations.id, corporateAdministrators.organizationId))
    .where(and(
      eq(corporateAdministrators.userId, userId),
      eq(corporateAdministrators.organizationId, organizationId),
    ))
    .limit(1);
  return Boolean(row);
}

async function isCorporatePlatformAdmin(userId: string) {
  const operator = await getOperator(userId);
  return operator && hasAdminPermission(operator.role, "corporate") ? operator : null;
}

function sendUnauthorized(res: Response, status = 403, message = "Corporate administrator access is required.") {
  res.status(status).json({ message });
}

async function versionResponse(id: string, organizationId: string, includeReviewNote: boolean) {
  const versions = await listVersions(organizationId, includeReviewNote);
  return versions.find(version => version.id === id);
}

function getParams(req: { params: { id?: string | string[]; versionId?: string | string[] } }) {
  const organizationId = typeof req.params.id === "string" ? req.params.id : "";
  const versionId = typeof req.params.versionId === "string" ? req.params.versionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^[0-9a-f-]{36}$/i.test(versionId)) return null;
  return { organizationId, versionId };
}

export function createCorporateAgreementsRouter(
  storage: CorporateAgreementStorage = new ObjectStorageService(),
) {
  const router = Router();

  router.get("/operations/corporate-organizations/:id/agreements", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to access corporate agreements.");
      return;
    }
    if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const organizationId = req.params.id ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
      res.status(400).json({ message: "Use a valid organization identifier." });
      return;
    }
    const [organization] = await db.select({ id: corporateOrganizations.id })
      .from(corporateOrganizations).where(eq(corporateOrganizations.id, organizationId)).limit(1);
    if (!organization) {
      res.status(404).json({ message: "Organization not found." });
      return;
    }
    res.json(GetCorporateAgreementVersionsResponse.parse(await listVersions(organizationId, true)));
  });

  router.post("/operations/corporate-organizations/:id/agreements", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to create a corporate agreement draft.");
      return;
    }
    if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const organizationId = req.params.id ?? "";
    const parsed = CreateCorporateAgreementDraftBody.safeParse(req.body);
    if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !parsed.success) {
      res.status(400).json({ message: "Provide a valid organization and a clear draft change summary." });
      return;
    }
    const result = await db.transaction(async tx => {
      const [organization] = await tx.select({ id: corporateOrganizations.id, name: corporateOrganizations.name })
        .from(corporateOrganizations).where(eq(corporateOrganizations.id, organizationId)).for("update");
      if (!organization) return { kind: "not_found" as const };
      const [latest] = await tx.select().from(corporateAgreementVersions)
        .where(eq(corporateAgreementVersions.organizationId, organizationId))
        .orderBy(desc(corporateAgreementVersions.versionNumber)).limit(1).for("update");
      if (latest?.status === "draft") return { kind: "draft_exists" as const };
      const [maximum] = await tx.select({
        maximum: sql<number>`coalesce(max(${corporateAgreementVersions.versionNumber}), 0)`,
      }).from(corporateAgreementVersions)
        .where(eq(corporateAgreementVersions.organizationId, organizationId));
      const id = randomUUID();
      const [version] = await tx.insert(corporateAgreementVersions).values({
        id,
        organizationId,
        versionNumber: Number(maximum?.maximum ?? 0) + 1,
        replacesVersionId: latest?.id ?? null,
        agreementText: latest?.agreementText ?? CORPORATE_AGREEMENT_TEMPLATE,
        changeSummary: parsed.data.changeSummary.trim(),
        createdBy: userId,
        status: "draft",
      }).returning();
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: userId,
        action: "corporate.agreement.draft_created",
        targetId: version.id,
        detail: `organization=${organizationId};version=${version.versionNumber}`,
      });
      return { kind: "created" as const, version, organizationName: organization.name };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ message: "Organization not found." });
      return;
    }
    if (result.kind === "draft_exists") {
      res.status(409).json({ message: "Finish or reject the existing draft before creating another version." });
      return;
    }
    const response = await versionResponse(result.version.id, organizationId, true);
    if (!response) {
      res.status(500).json({ message: "The agreement draft could not be loaded." });
      return;
    }
    res.status(201).json(CreateCorporateAgreementDraftResponse.parse(response));
  });

  router.patch("/operations/corporate-organizations/:id/agreements/:versionId", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to edit this agreement draft.");
      return;
    }
    if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const params = getParams(req);
    const parsed = UpdateCorporateAgreementDraftBody.safeParse(req.body);
    if (!params || !parsed.success) {
      res.status(400).json({ message: "Provide valid draft text and a clear change summary." });
      return;
    }
    const [updated] = await db.update(corporateAgreementVersions).set({
      agreementText: parsed.data.agreementText.trim(),
      changeSummary: parsed.data.changeSummary.trim(),
      updatedAt: new Date(),
    }).where(and(
      eq(corporateAgreementVersions.id, params.versionId),
      eq(corporateAgreementVersions.organizationId, params.organizationId),
      eq(corporateAgreementVersions.status, "draft"),
    )).returning({ id: corporateAgreementVersions.id });
    if (!updated) {
      const [exists] = await db.select({ id: corporateAgreementVersions.id })
        .from(corporateAgreementVersions)
        .where(and(
          eq(corporateAgreementVersions.id, params.versionId),
          eq(corporateAgreementVersions.organizationId, params.organizationId),
        )).limit(1);
      res.status(exists ? 409 : 404).json({
        message: exists ? "Only draft versions can be edited." : "Draft not found in the organization.",
      });
      return;
    }
    await db.insert(operationAudit).values({
      id: randomUUID(),
      actorId: userId,
      action: "corporate.agreement.draft_updated",
      targetId: updated.id,
      detail: `organization=${params.organizationId}`,
    });
    const response = await versionResponse(updated.id, params.organizationId, true);
    if (!response) {
      res.status(500).json({ message: "The updated agreement could not be loaded." });
      return;
    }
    res.json(UpdateCorporateAgreementDraftResponse.parse(response));
  });

  router.patch("/operations/corporate-organizations/:id/agreements/:versionId/review", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to review this agreement.");
      return;
    }
    if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const params = getParams(req);
    const parsed = ReviewCorporateAgreementDraftBody.safeParse(req.body);
    if (!params || !parsed.success) {
      res.status(400).json({ message: "Provide a valid review decision." });
      return;
    }
    const reviewNote = parsed.data.reviewNote?.trim() || null;
    if (parsed.data.status === "rejected" && (!reviewNote || reviewNote.length < 5)) {
      res.status(400).json({ message: "A rejection reason of at least five characters is required." });
      return;
    }
    const now = new Date();
    const result = await db.transaction(async tx => {
      const [organization] = await tx.select({ id: corporateOrganizations.id })
        .from(corporateOrganizations).where(eq(corporateOrganizations.id, params.organizationId)).for("update");
      if (!organization) return { kind: "not_found" as const };
      const [version] = await tx.select().from(corporateAgreementVersions).where(and(
        eq(corporateAgreementVersions.id, params.versionId),
        eq(corporateAgreementVersions.organizationId, params.organizationId),
      )).for("update");
      if (!version) return { kind: "not_found" as const };
      if (version.status !== "draft") return { kind: "not_draft" as const };
      const [latest] = await tx.select({ id: corporateAgreementVersions.id })
        .from(corporateAgreementVersions)
        .where(eq(corporateAgreementVersions.organizationId, params.organizationId))
        .orderBy(desc(corporateAgreementVersions.versionNumber)).limit(1);
      if (latest?.id !== version.id) return { kind: "not_current" as const };
      if (parsed.data.status === "approved") {
        const currentVersions = await tx.select().from(corporateAgreementVersions).where(and(
          eq(corporateAgreementVersions.organizationId, params.organizationId),
          inArray(corporateAgreementVersions.status, ["approved", "signed"]),
        )).for("update");
        for (const current of currentVersions) {
          await tx.update(corporateAgreementVersions).set({
            status: "superseded",
            updatedAt: now,
          }).where(eq(corporateAgreementVersions.id, current.id));
        }
      }
      await tx.update(corporateAgreementVersions).set({
        status: parsed.data.status,
        reviewNote,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      }).where(eq(corporateAgreementVersions.id, version.id));
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: userId,
        action: `corporate.agreement.${parsed.data.status}`,
        targetId: version.id,
        detail: `organization=${params.organizationId};version=${version.versionNumber}`,
      });
      return { kind: "updated" as const };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ message: "Agreement draft not found in the organization." });
      return;
    }
    if (result.kind === "not_draft" || result.kind === "not_current") {
      res.status(409).json({ message: "This version is no longer the current draft for review." });
      return;
    }
    const response = await versionResponse(params.versionId, params.organizationId, true);
    if (!response) {
      res.status(500).json({ message: "The reviewed agreement could not be loaded." });
      return;
    }
    res.json(ReviewCorporateAgreementDraftResponse.parse(response));
  });

  router.post("/operations/corporate-organizations/:id/agreements/:versionId/upload-url", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to record a signed agreement.");
      return;
    }
    if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const params = getParams(req);
    const parsed = RequestCorporateAgreementUploadUrlBody.safeParse(req.body);
    if (!params || !parsed.success) {
      res.status(400).json({ message: "Provide a PDF file under 10 MB." });
      return;
    }
    const documentName = sanitizedName(parsed.data.documentName);
    if (!documentName || !isPdfName(documentName)
      || parsed.data.contentType !== "application/pdf"
      || parsed.data.size < 1 || parsed.data.size > MAX_FILE_BYTES) {
      res.status(400).json({ message: "Use a PDF under 10 MB with a matching file name." });
      return;
    }
    const uploadId = randomUUID();
    const result = await db.transaction(async tx => {
      const [version] = await tx.select().from(corporateAgreementVersions).where(and(
        eq(corporateAgreementVersions.id, params.versionId),
        eq(corporateAgreementVersions.organizationId, params.organizationId),
      )).for("update");
      if (!version) return { kind: "not_found" as const };
      if (version.status !== "approved" || version.signedDocumentPath) return { kind: "not_approved" as const };
      const previousUploadId = version.pendingUploadId;
      const upload = await storage.createCorporateAgreementUpload(params.organizationId, params.versionId, uploadId);
      await tx.update(corporateAgreementVersions).set({
        pendingUploadId: uploadId,
        pendingDocumentName: documentName,
        pendingUploadedBy: userId,
        updatedAt: new Date(),
      }).where(eq(corporateAgreementVersions.id, version.id));
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: userId,
        action: "corporate.agreement.signed_copy_upload_started",
        targetId: version.id,
        detail: `organization=${params.organizationId};version=${version.versionNumber}`,
      });
      return { kind: "created" as const, upload, previousUploadId };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ message: "Agreement version not found." });
      return;
    }
    if (result.kind === "not_approved") {
      res.status(409).json({ message: "Only an approved version can receive its signed copy." });
      return;
    }
    if (result.previousUploadId) {
      const previousPath = `/objects/corporate-agreements/${params.organizationId}/${params.versionId}/${result.previousUploadId}.pdf`;
      await storage.deletePrivateFile(previousPath).catch(() => undefined);
    }
    res.json(RequestCorporateAgreementUploadUrlResponse.parse({ uploadId, uploadURL: result.upload.uploadURL }));
  });

  router.post("/operations/corporate-organizations/:id/agreements/:versionId/complete", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to complete this agreement upload.");
      return;
    }
    if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const params = getParams(req);
    const parsed = CompleteCorporateAgreementUploadBody.safeParse(req.body);
    if (!params || !parsed.success) {
      res.status(400).json({ message: "Use a valid agreement upload identifier." });
      return;
    }
    const uploadId = parsed.data.uploadId;
    const [version] = await db.select().from(corporateAgreementVersions).where(and(
      eq(corporateAgreementVersions.id, params.versionId),
      eq(corporateAgreementVersions.organizationId, params.organizationId),
      eq(corporateAgreementVersions.status, "approved"),
      eq(corporateAgreementVersions.pendingUploadId, uploadId),
    )).limit(1);
    if (!version || !version.pendingDocumentName) {
      res.status(404).json({ message: "Pending upload not found for this agreement version." });
      return;
    }
    const documentPath = `/objects/corporate-agreements/${params.organizationId}/${params.versionId}/${uploadId}.pdf`;
    let file;
    try {
      file = await storage.getPrivateFile(documentPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        await db.update(corporateAgreementVersions).set({
          pendingUploadId: null,
          pendingDocumentName: null,
          pendingUploadedBy: null,
          updatedAt: new Date(),
        }).where(and(
          eq(corporateAgreementVersions.id, version.id),
          eq(corporateAgreementVersions.pendingUploadId, uploadId),
        ));
        res.status(400).json({ message: "The PDF has not finished uploading. Request a fresh upload link and try again." });
        return;
      }
      throw error;
    }
    const [metadata] = await file.getMetadata();
    const contentType = typeof metadata.contentType === "string" ? metadata.contentType : null;
    const fileSize = Number(metadata.size);
    if (!contentType || !allowedMimeTypes.has(contentType)
      || !isPdfName(version.pendingDocumentName)
      || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_BYTES) {
      await storage.deletePrivateFile(documentPath);
      await db.update(corporateAgreementVersions).set({
        pendingUploadId: null,
        pendingDocumentName: null,
        pendingUploadedBy: null,
        updatedAt: new Date(),
      }).where(and(
        eq(corporateAgreementVersions.id, version.id),
        eq(corporateAgreementVersions.pendingUploadId, uploadId),
      ));
      res.status(400).json({ message: "The uploaded file must be a valid PDF under 10 MB." });
      return;
    }
    const now = new Date();
    const completed = await db.transaction(async tx => {
      const [lockedVersion] = await tx.select().from(corporateAgreementVersions)
        .where(eq(corporateAgreementVersions.id, version.id)).for("update");
      if (!lockedVersion || lockedVersion.status !== "approved" || lockedVersion.pendingUploadId !== uploadId) return false;
      await tx.update(corporateAgreementVersions).set({
        status: "signed",
        signedDocumentName: lockedVersion.pendingDocumentName,
        signedDocumentPath: documentPath,
        signedContentType: contentType,
        signedFileSize: fileSize,
        signedAt: now,
        pendingUploadId: null,
        pendingDocumentName: null,
        pendingUploadedBy: null,
        updatedAt: now,
      }).where(eq(corporateAgreementVersions.id, version.id));
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: userId,
        action: "corporate.agreement.signed_copy_recorded",
        targetId: version.id,
        detail: `organization=${params.organizationId};version=${version.versionNumber}`,
      });
      return true;
    });
    if (!completed) {
      await storage.deletePrivateFile(documentPath);
      res.status(409).json({ message: "This upload is no longer current." });
      return;
    }
    const response = await versionResponse(params.versionId, params.organizationId, true);
    if (!response) {
      res.status(500).json({ message: "The signed agreement could not be loaded." });
      return;
    }
    res.json(CompleteCorporateAgreementUploadResponse.parse(response));
  });

  const streamSignedFile = async (req: Request, res: Response, isCompanyRoute: boolean) => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to access this agreement.");
      return;
    }
    const params = getParams(req);
    if (!params) {
      res.status(400).json({ message: "Use valid agreement identifiers." });
      return;
    }
    if (isCompanyRoute) {
      if (!await isCompanyAdministrator(userId, params.organizationId)) {
        res.status(404).json({ message: "Agreement not found within your organization." });
        return;
      }
    } else if (!await isCorporatePlatformAdmin(userId)) {
      sendUnauthorized(res);
      return;
    }
    const [version] = await db.select().from(corporateAgreementVersions).where(and(
      eq(corporateAgreementVersions.id, params.versionId),
      eq(corporateAgreementVersions.organizationId, params.organizationId),
      eq(corporateAgreementVersions.status, "signed"),
    )).limit(1);
    if (!version?.signedDocumentPath || !version.signedDocumentName || !version.signedContentType) {
      res.status(404).json({ message: "Signed document not found in the organization." });
      return;
    }
    let file;
    try {
      file = await storage.getPrivateFile(version.signedDocumentPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ message: "Signed document not found." });
        return;
      }
      throw error;
    }
    const fileName = version.signedDocumentName.replace(/["\\\r\n]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(version.signedFileSize ?? 0));
    file.createReadStream().on("error", error => {
      req.log.error({ error, agreementVersionId: version.id }, "Corporate agreement streaming failed");
      if (!res.headersSent) res.status(500);
      res.end();
    }).pipe(res);
  };

  router.get("/operations/corporate-organizations/:id/agreements/:versionId/file", (req, res) => {
    void streamSignedFile(req, res, false);
  });

  router.get("/corporate/organizations/:id/agreements", async (req, res): Promise<void> => {
    const userId = getAuth(req).userId;
    if (!userId) {
      sendUnauthorized(res, 401, "Sign in to access your corporate agreement.");
      return;
    }
    const organizationId = req.params.id ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
      res.status(400).json({ message: "Use a valid organization identifier." });
      return;
    }
    if (!await isCompanyAdministrator(userId, organizationId)) {
      res.status(404).json({ message: "Agreement not found within your organization." });
      return;
    }
    res.json(GetMyCorporateAgreementVersionsResponse.parse(await listVersions(organizationId, false)));
  });

  router.get("/public/corporate-agreement-template", (_req, res) => {
    res.json({ agreementText: CORPORATE_AGREEMENT_TEMPLATE });
  });

  router.get("/corporate/organizations/:id/agreements/:versionId/file", (req, res) => {
    void streamSignedFile(req, res, true);
  });

  return router;
}

export default createCorporateAgreementsRouter();
