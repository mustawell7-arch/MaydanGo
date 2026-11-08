import {
  completeMemberSupportAttachment,
  deletePendingMemberSupportAttachment,
  downloadMemberSupportAttachment,
  downloadSupportStaffAttachment,
  requestMemberSupportAttachmentUploadUrl,
  type SupportAttachmentUploadInputContentType,
} from "@workspace/api-client-react";

const typeByExtension: Record<string, SupportAttachmentUploadInputContentType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function supportAttachmentType(file: File): SupportAttachmentUploadInputContentType | null {
  const mime = file.type.toLowerCase() as SupportAttachmentUploadInputContentType;
  if (["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mime)) return mime;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return typeByExtension[extension] ?? null;
}

export async function uploadMemberSupportAttachments(ticketId: string, messageId: string, files: File[]) {
  if (files.length > 3) throw new Error("You can attach up to three files to one message.");
  for (const file of files) {
    const contentType = supportAttachmentType(file);
    if (!contentType || file.size < 1 || file.size > 10 * 1024 * 1024) {
      throw new Error("Choose a PDF, JPEG, PNG, or WebP file up to 10 MB.");
    }
    const upload = await requestMemberSupportAttachmentUploadUrl(ticketId, {
      messageId,
      fileName: file.name,
      contentType,
      size: file.size,
    });
    try {
      const response = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!response.ok) throw new Error("The file could not be uploaded.");
      await completeMemberSupportAttachment(ticketId, upload.id);
    } catch (error) {
      await deletePendingMemberSupportAttachment(ticketId, upload.id).catch(() => undefined);
      throw error;
    }
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "support-attachment";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadMemberSupportFile(ticketId: string, attachmentId: string, fileName: string) {
  saveBlob(await downloadMemberSupportAttachment(ticketId, attachmentId), fileName);
}

export async function downloadSupportStaffFile(ticketId: string, attachmentId: string, fileName: string) {
  saveBlob(await downloadSupportStaffAttachment(ticketId, attachmentId), fileName);
}
