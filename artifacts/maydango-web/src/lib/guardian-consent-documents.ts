import {
  completePartnerGuardianConsentUpload,
  downloadSuperAdminGuardianConsentDocument,
  requestPartnerGuardianConsentUploadUrl,
  type GuardianConsentUploadUrlRequest,
} from "@workspace/api-client-react";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function guardianConsentType(file: File): GuardianConsentUploadUrlRequest["contentType"] | null {
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return mime;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

export async function uploadGuardianConsentImage(attendanceId: string, file: File) {
  const contentType = guardianConsentType(file);
  if (!contentType || file.size < 1 || file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose a JPEG, PNG, or WebP image up to 10 MB.");

  const upload = await requestPartnerGuardianConsentUploadUrl(attendanceId, {
    contentType,
    size: file.size,
    onSiteVerified: true,
  });
  const response = await fetch(upload.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!response.ok) throw new Error("The private upload did not complete.");
  await completePartnerGuardianConsentUpload(attendanceId, upload.id);
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "guardian-consent";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadGuardianConsentCopy(documentId: string) {
  const blob = await downloadSuperAdminGuardianConsentDocument(documentId);
  saveBlob(blob, `guardian-consent-${documentId}.jpg`);
}
