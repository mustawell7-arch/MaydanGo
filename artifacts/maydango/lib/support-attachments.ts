import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import {
  completeMemberSupportAttachment,
  deletePendingMemberSupportAttachment,
  downloadMemberSupportAttachment,
  requestMemberSupportAttachmentUploadUrl,
  type SupportAttachmentUploadInputContentType,
} from '@workspace/api-client-react';

export type SupportAttachmentDraft = {
  uri: string;
  fileName: string;
  contentType: SupportAttachmentUploadInputContentType;
  size: number;
};

const extensionType: Record<string, SupportAttachmentUploadInputContentType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function supportAttachmentType(fileName: string, mimeType?: string | null) {
  if (mimeType && ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType.toLowerCase())) {
    return mimeType.toLowerCase() as SupportAttachmentUploadInputContentType;
  }
  return extensionType[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export async function uploadSupportAttachments(
  ticketId: string,
  messageId: string,
  files: SupportAttachmentDraft[],
) {
  if (files.length > 3) throw new Error('Maximum three attachments per message.');
  for (const draft of files) {
    if (draft.size < 1 || draft.size > 10 * 1024 * 1024) throw new Error('Invalid support attachment size.');
    const upload = await requestMemberSupportAttachmentUploadUrl(ticketId, {
      messageId,
      fileName: draft.fileName,
      contentType: draft.contentType,
      size: draft.size,
    });
    try {
      const response = await expoFetch(upload.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': draft.contentType },
        body: new File(draft.uri),
      });
      if (!response.ok) throw new Error('Support attachment upload failed.');
      await completeMemberSupportAttachment(ticketId, upload.id);
    } catch (error) {
      await deletePendingMemberSupportAttachment(ticketId, upload.id).catch(() => undefined);
      throw error;
    }
  }
}

export async function shareSupportAttachment(
  ticketId: string,
  attachmentId: string,
  fileName: string,
  contentType: SupportAttachmentUploadInputContentType,
) {
  const blob = await downloadMemberSupportAttachment(ticketId, attachmentId);
  const safeName = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 140) || 'support-attachment';
  const file = new File(Paths.cache, `${attachmentId}-${safeName}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(await blob.arrayBuffer()));
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: contentType, dialogTitle: fileName });
}
