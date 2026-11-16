import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";

const sidecar = "http://127.0.0.1:1106";
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: {
      url: `${sidecar}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

function parseObjectPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) throw new Error("Invalid object path.");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signUpload(bucketName: string, objectName: string) {
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign upload URL: ${response.status}`);
  const result = await response.json() as { signed_url?: unknown };
  if (typeof result.signed_url !== "string") throw new Error("Storage did not return an upload URL.");
  return result.signed_url;
}

export class ObjectStorageService {
  private privateDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    return dir.replace(/\/+$/, "");
  }

  async createPartnerInvoiceUpload(partnerId: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(partnerId)) throw new Error("Invalid partner identifier.");
    const objectName = `partner-invoices/${partnerId}/${randomUUID()}.pdf`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, documentPath: `/objects/${objectName}` };
  }

  async createPartnerComplianceUpload(partnerId: string, facilityId: string, documentId: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(partnerId)
      || !/^[A-Za-z0-9_-]{1,160}$/.test(facilityId)
      || !/^[0-9a-f-]{36}$/i.test(documentId)) {
      throw new Error("Invalid partner compliance document identifier.");
    }
    const objectName = `partner-compliance/${partnerId}/${facilityId}/${documentId}`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, documentPath: `/objects/${objectName}` };
  }

  async createPartnerContractUpload(partnerId: string, versionId: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(partnerId)
      || !/^[0-9a-f-]{36}$/i.test(versionId)) {
      throw new Error("Invalid partner contract version identifier.");
    }
    const objectName = `partner-contracts/${partnerId}/${versionId}`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, documentPath: `/objects/${objectName}` };
  }

  async createPartnerApplicationUpload(applicationId: string, documentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f-]{36}$/i.test(documentId)) {
      throw new Error("Invalid partner application document identifier.");
    }
    const objectName = `partner-onboarding/${applicationId}/${documentId}`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, documentPath: `/objects/${objectName}` };
  }

  async createCourseMaterialUpload(courseId: string, materialId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(courseId) || !/^[0-9a-f-]{36}$/i.test(materialId)) {
      throw new Error("Invalid course material identifier.");
    }
    const objectName = `course-material-uploads/${courseId}/${materialId}.pdf`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, documentPath: `/objects/${objectName}` };
  }

  async promoteCourseMaterialUpload(stagingPath: string, courseId: string, materialId: string) {
    const expectedStagingPath = `/objects/course-material-uploads/${courseId}/${materialId}.pdf`;
    const finalPath = `/objects/course-materials/${courseId}/${materialId}.pdf`;
    if (!/^[0-9a-f-]{36}$/i.test(courseId) || !/^[0-9a-f-]{36}$/i.test(materialId)
        || stagingPath !== expectedStagingPath) {
      throw new ObjectNotFoundError();
    }
    const source = await this.getPrivateFile(stagingPath);
    const { bucketName, objectName } = parseObjectPath(`${this.privateDir()}/${finalPath.slice("/objects/".length)}`);
    const destination = objectStorageClient.bucket(bucketName).file(objectName);
    await source.copy(destination);
    try {
      await source.delete({ ignoreNotFound: true });
    } catch {
      // The approved copy is immutable to the expired upload URL; cleanup can retry later.
    }
    return finalPath;
  }

  async createCorporateAgreementUpload(organizationId: string, versionId: string, uploadId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)
      || !/^[0-9a-f-]{36}$/i.test(versionId)
      || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
      throw new Error("Invalid corporate agreement upload identifier.");
    }
    const objectName = `corporate-agreements/${organizationId}/${versionId}/${uploadId}.pdf`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, documentPath: `/objects/${objectName}` };
  }

  async createSupportAttachmentUpload(ticketId: string, attachmentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(ticketId) || !/^[0-9a-f-]{36}$/i.test(attachmentId)) {
      throw new Error("Invalid support attachment identifier.");
    }
    const objectName = `support-attachments/${ticketId}/${attachmentId}`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, objectPath: `/objects/${objectName}` };
  }

  async createGuardianConsentUpload(attendanceId: string, documentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(attendanceId) || !/^[0-9a-f-]{36}$/i.test(documentId)) {
      throw new Error("Invalid guardian-consent identifier.");
    }
    const objectName = `guardian-consent-uploads/${attendanceId}/${documentId}`;
    const { bucketName, objectName: bucketObjectName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    const uploadURL = await signUpload(bucketName, bucketObjectName);
    return { uploadURL, objectPath: `/objects/${objectName}` };
  }

  async promoteGuardianConsentUpload(stagingPath: string) {
    if (!stagingPath.startsWith("/objects/guardian-consent-uploads/")) throw new ObjectNotFoundError();
    const source = await this.getPrivateFile(stagingPath);
    const entityPath = `${this.privateDir()}/${stagingPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(entityPath);
    const finalObjectName = objectName.replace(/^guardian-consent-uploads\//, "guardian-consents/");
    const destination = objectStorageClient.bucket(bucketName).file(finalObjectName);
    await source.copy(destination);
    let stagingObjectPath: string | null = stagingPath;
    try {
      await source.delete({ ignoreNotFound: true });
      stagingObjectPath = null;
    } catch {
      // The verified copy is separate; retention cleanup will retry deleting this staging file.
    }
    return { objectPath: `/objects/${finalObjectName}`, stagingObjectPath };
  }

  async getPrivateFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const entityPath = `${this.privateDir()}/${objectPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(entityPath);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async deletePrivateFile(objectPath: string): Promise<void> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const entityPath = `${this.privateDir()}/${objectPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(entityPath);
    await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  }
}
