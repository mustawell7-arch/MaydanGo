import { Router, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { hasAdminPermission } from "../lib/admin-roles";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  db, operationAudit, operators, partnerContractVersions, partners,
} from "@workspace/db";
import {
  CompletePartnerContractUploadParams, CompletePartnerContractUploadResponse,
  GetPartnerContractVersionsResponse, RequestPartnerContractUploadUrlBody,
  RequestPartnerContractUploadUrlResponse, ReviewPartnerContractVersionBody,
  ReviewPartnerContractVersionParams, ReviewPartnerContractVersionResponse,
} from "@workspace/api-zod";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
type Operator = typeof operators.$inferSelect;
export type PartnerContractStorage = Pick<
  ObjectStorageService,
  "createPartnerContractUpload" | "getPrivateFile" | "deletePrivateFile"
>;

function isSafetyAdmin(operator: Operator) {
  return hasAdminPermission(operator.role, "fraud_compliance");
}

function sanitizedName(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return name || null;
}

function expectedMimeType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return null;
}

function toPublicVersion(row: typeof partnerContractVersions.$inferSelect, partnerName: string, replacesVersionNumber: number | null) {
  return {
    id: row.id,
    partnerId: row.partnerId,
    partnerName,
    versionNumber: row.versionNumber,
    replacesVersionNumber,
    documentName: row.documentName,
    changeSummary: row.changeSummary,
    contentType: row.contentType,
    fileSize: row.fileSize,
    status: row.status,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function versionDetail(id: string) {
  const [row] = await db.select({
    version: partnerContractVersions,
    partnerName: partners.name,
  }).from(partnerContractVersions)
    .innerJoin(partners, eq(partners.id, partnerContractVersions.partnerId))
    .where(eq(partnerContractVersions.id, id))
    .limit(1);
  if (!row) return undefined;
  const [replaced] = row.version.replacesVersionId
    ? await db.select({ versionNumber: partnerContractVersions.versionNumber })
      .from(partnerContractVersions)
      .where(eq(partnerContractVersions.id, row.version.replacesVersionId))
      .limit(1)
    : [];
  return toPublicVersion(row.version, row.partnerName, replaced?.versionNumber ?? null);
}

export function createPartnerContractsRouter(storage: PartnerContractStorage = new ObjectStorageService()) {
  const router = Router();

  router.use(async (req, res, next) => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ message: "Sign in to access partner contracts." });
      return;
    }
    const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
    if (!operator || (operator.role !== "partner" && !isSafetyAdmin(operator))) {
      res.status(403).json({ message: "Partner or safety administrator access is required." });
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
        res.status(403).json({ message: "Partner approval is required for contract access." });
        return;
      }
    }
    res.locals.contractOperator = operator;
    next();
  });

  const operatorFor = (res: Response) => res.locals.contractOperator as Operator;

  router.get("/", async (_req, res): Promise<void> => {
    const operator = operatorFor(res);
    const rows = await db.select({
      version: partnerContractVersions,
      partnerName: partners.name,
    }).from(partnerContractVersions)
      .innerJoin(partners, eq(partners.id, partnerContractVersions.partnerId))
      .where(operator.role === "partner" ? eq(partnerContractVersions.partnerId, operator.partnerId!) : undefined)
      .orderBy(desc(partnerContractVersions.versionNumber), desc(partnerContractVersions.createdAt));
    const versionNumbers = new Map(rows.map(({ version }) => [version.id, version.versionNumber]));
    const response = rows.map(({ version, partnerName }) =>
      toPublicVersion(version, partnerName, version.replacesVersionId
        ? versionNumbers.get(version.replacesVersionId) ?? null
        : null));
    res.json(GetPartnerContractVersionsResponse.parse(response));
  });

  router.post("/upload-url", async (req, res): Promise<void> => {
    const operator = operatorFor(res);
    if (operator.role !== "partner" || !operator.partnerId) {
      res.status(403).json({ message: "Only an approved partner can upload a contract." });
      return;
    }
    const parsed = RequestPartnerContractUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Provide a supported contract file and a clear change summary." });
      return;
    }
    const input = parsed.data;
    const documentName = sanitizedName(input.documentName);
    if (!documentName || !allowedMimeTypes.has(input.contentType)
      || expectedMimeType(documentName) !== input.contentType
      || input.size < 1 || input.size > MAX_FILE_BYTES
      || input.changeSummary.trim().length < 10) {
      res.status(400).json({ message: "Use a matching PDF, JPEG, or PNG file under 10 MB and describe the change." });
      return;
    }

    const uploadId = randomUUID();
    const result = await db.transaction(async tx => {
      const [partner] = await tx.select({ id: partners.id, approved: partners.approved })
        .from(partners).where(eq(partners.id, operator.partnerId!)).for("update");
      if (!partner?.approved) return { kind: "partner_unavailable" as const };

      const [maxRow] = await tx.select({
        maxVersion: sql<number>`coalesce(max(${partnerContractVersions.versionNumber}), 0)`,
      }).from(partnerContractVersions)
        .where(eq(partnerContractVersions.partnerId, operator.partnerId!));
      const versionNumber = Number(maxRow?.maxVersion ?? 0) + 1;
      const [current] = await tx.select({
        id: partnerContractVersions.id,
        versionNumber: partnerContractVersions.versionNumber,
      }).from(partnerContractVersions).where(and(
        eq(partnerContractVersions.partnerId, operator.partnerId!),
        eq(partnerContractVersions.status, "approved"),
      )).limit(1);

      const upload = await storage.createPartnerContractUpload(operator.partnerId!, uploadId);
      await tx.insert(partnerContractVersions).values({
        id: uploadId,
        partnerId: operator.partnerId!,
        versionNumber,
        replacesVersionId: current?.id ?? null,
        documentName,
        documentPath: upload.documentPath,
        changeSummary: input.changeSummary.trim(),
        uploadedBy: operator.userId,
        status: "upload_pending",
      });
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: operator.userId,
        action: "partner.contract_version.upload_started",
        targetId: uploadId,
        detail: `partner=${operator.partnerId};version=${versionNumber};replaces=${current?.versionNumber ?? "none"}`,
      });
      return {
        kind: "created" as const,
        id: uploadId,
        uploadURL: upload.uploadURL,
        versionNumber,
        replacesVersionNumber: current?.versionNumber ?? null,
      };
    });
    if (result.kind === "partner_unavailable") {
      res.status(409).json({ message: "The partner record is no longer approved for contract uploads." });
      return;
    }
    res.json(RequestPartnerContractUploadUrlResponse.parse(result));
  });

  router.post("/:id/complete", async (req, res): Promise<void> => {
    const operator = operatorFor(res);
    if (operator.role !== "partner" || !operator.partnerId) {
      res.status(403).json({ message: "Only the owning partner can complete this upload." });
      return;
    }
    const params = CompletePartnerContractUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Use a valid contract upload identifier." });
      return;
    }
    const [version] = await db.select().from(partnerContractVersions).where(and(
      eq(partnerContractVersions.id, params.data.id),
      eq(partnerContractVersions.partnerId, operator.partnerId),
      eq(partnerContractVersions.status, "upload_pending"),
    )).limit(1);
    if (!version) {
      res.status(404).json({ message: "Upload not found within the partner's scope." });
      return;
    }
    let file;
    try {
      file = await storage.getPrivateFile(version.documentPath);
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
    if (!contentType || !allowedMimeTypes.has(contentType)
      || expectedMimeType(version.documentName) !== contentType
      || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_BYTES) {
      await storage.deletePrivateFile(version.documentPath);
      await db.transaction(async tx => {
        const [current] = await tx.select({ status: partnerContractVersions.status })
          .from(partnerContractVersions).where(eq(partnerContractVersions.id, version.id)).for("update");
        if (!current || current.status !== "upload_pending") return;
        await tx.update(partnerContractVersions).set({
          status: "rejected",
          reviewNote: "Upload rejected because its file type or size was not supported.",
          updatedAt: new Date(),
        }).where(eq(partnerContractVersions.id, version.id));
        await tx.insert(operationAudit).values({
          id: randomUUID(),
          actorId: operator.userId,
          action: "partner.contract_version.upload_rejected",
          targetId: version.id,
          detail: `partner=${operator.partnerId};version=${version.versionNumber}`,
        });
      });
      res.status(400).json({ message: "The uploaded contract must be a matching PDF, JPEG, or PNG under 10 MB." });
      return;
    }
    const updated = await db.transaction(async tx => {
      const [current] = await tx.select({ status: partnerContractVersions.status })
        .from(partnerContractVersions).where(eq(partnerContractVersions.id, version.id)).for("update");
      if (!current || current.status !== "upload_pending") return false;
      await tx.update(partnerContractVersions).set({
        status: "submitted",
        contentType,
        fileSize,
        updatedAt: new Date(),
      }).where(eq(partnerContractVersions.id, version.id));
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: operator.userId,
        action: "partner.contract_version.submitted",
        targetId: version.id,
        detail: `partner=${operator.partnerId};version=${version.versionNumber};replaces=${version.replacesVersionId ?? "none"}`,
      });
      return true;
    });
    if (!updated) {
      res.status(409).json({ message: "This upload has already been completed." });
      return;
    }
    const response = await versionDetail(version.id);
    if (!response) {
      res.status(500).json({ message: "The submitted contract could not be loaded." });
      return;
    }
    res.json(CompletePartnerContractUploadResponse.parse(response));
  });

  router.get("/:id/file", async (req, res): Promise<void> => {
    const operator = operatorFor(res);
    const params = CompletePartnerContractUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Use a valid contract identifier." });
      return;
    }
    const [version] = await db.select().from(partnerContractVersions)
      .where(eq(partnerContractVersions.id, params.data.id)).limit(1);
    if (!version || version.status === "upload_pending" || !version.contentType
      || (operator.role === "partner" && version.partnerId !== operator.partnerId)) {
      res.status(404).json({ message: "Contract not found within the operator's scope." });
      return;
    }
    if (operator.role !== "partner" && !isSafetyAdmin(operator)) {
      res.status(403).json({ message: "Safety administrator access is required to open partner contracts." });
      return;
    }
    let file;
    try {
      file = await storage.getPrivateFile(version.documentPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ message: "Contract file not found." });
        return;
      }
      throw error;
    }
    const fileName = version.documentName.replace(/["\\\r\n]/g, "_");
    res.setHeader("Content-Type", allowedMimeTypes.has(version.contentType) ? version.contentType : "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(version.fileSize ?? 0));
    file.createReadStream().on("error", error => {
      req.log.error({ error, contractVersionId: version.id }, "Partner contract streaming failed");
      if (!res.headersSent) res.status(500);
      res.end();
    }).pipe(res);
  });

  router.patch("/:id/review", async (req, res): Promise<void> => {
    const operator = operatorFor(res);
    if (!isSafetyAdmin(operator)) {
      res.status(403).json({ message: "Only a safety administrator can review partner contracts." });
      return;
    }
    const params = ReviewPartnerContractVersionParams.safeParse(req.params);
    const parsed = ReviewPartnerContractVersionBody.safeParse(req.body);
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
    const outcome = await db.transaction(async tx => {
      const [version] = await tx.select().from(partnerContractVersions)
        .where(eq(partnerContractVersions.id, params.data.id)).for("update");
      if (!version || version.status !== "submitted" || !version.contentType || !version.fileSize) {
        return { kind: "not_found" as const };
      }
      await tx.select({ id: partners.id }).from(partners)
        .where(eq(partners.id, version.partnerId)).for("update");

      if (parsed.data.status === "rejected") {
        await tx.update(partnerContractVersions).set({
          status: "rejected",
          reviewNote,
          reviewedBy: operator.userId,
          reviewedAt,
          updatedAt: reviewedAt,
        }).where(eq(partnerContractVersions.id, version.id));
        await tx.insert(operationAudit).values({
          id: randomUUID(),
          actorId: operator.userId,
          action: "partner.contract_version.rejected",
          targetId: version.id,
          detail: `partner=${version.partnerId};version=${version.versionNumber};decision=rejected`,
        });
        return { kind: "updated" as const };
      }

      const [current] = await tx.select({
        id: partnerContractVersions.id,
        versionNumber: partnerContractVersions.versionNumber,
      }).from(partnerContractVersions).where(and(
        eq(partnerContractVersions.partnerId, version.partnerId),
        eq(partnerContractVersions.status, "approved"),
      )).limit(1).for("update");
      if ((current?.id ?? null) !== version.replacesVersionId) {
        await tx.insert(operationAudit).values({
          id: randomUUID(),
          actorId: operator.userId,
          action: "partner.contract_version.review_conflict",
          targetId: version.id,
          detail: `partner=${version.partnerId};version=${version.versionNumber};decision=approved`,
        });
        return { kind: "stale_replacement" as const };
      }
      if (current) {
        await tx.update(partnerContractVersions).set({
          status: "superseded",
          supersededAt: reviewedAt,
          updatedAt: reviewedAt,
        }).where(eq(partnerContractVersions.id, current.id));
        await tx.insert(operationAudit).values({
          id: randomUUID(),
          actorId: operator.userId,
          action: "partner.contract_version.superseded",
          targetId: current.id,
          detail: `partner=${version.partnerId};version=${current.versionNumber};replaced_by=${version.versionNumber}`,
        });
      }
      await tx.update(partnerContractVersions).set({
        status: "approved",
        reviewNote,
        reviewedBy: operator.userId,
        reviewedAt,
        updatedAt: reviewedAt,
      }).where(eq(partnerContractVersions.id, version.id));
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId: operator.userId,
        action: "partner.contract_version.approved",
        targetId: version.id,
        detail: `partner=${version.partnerId};version=${version.versionNumber};replaces=${current?.versionNumber ?? "none"}`,
      });
      return { kind: "updated" as const };
    });
    if (outcome.kind === "not_found") {
      res.status(404).json({ message: "Submitted contract not found." });
      return;
    }
    if (outcome.kind === "stale_replacement") {
      res.status(409).json({ message: "This version no longer replaces the current approved contract. Submit a new version instead." });
      return;
    }
    const response = await versionDetail(params.data.id);
    if (!response) {
      res.status(500).json({ message: "The reviewed contract could not be loaded." });
      return;
    }
    res.json(ReviewPartnerContractVersionResponse.parse(response));
  });

  return router;
}

export default createPartnerContractsRouter();
