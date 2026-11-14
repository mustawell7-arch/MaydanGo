import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, lte, or } from "drizzle-orm";
import {
  attendance,
  attendanceEvents,
  db,
  guardianConsentDocuments,
  memberProfiles,
  offerings,
} from "@workspace/db";
import { BookingError } from "./reservations";
import { ObjectStorageService } from "./objectStorage";
import { ageOnDate } from "./age";

export const GUARDIAN_CONSENT_RETENTION_DAYS = 90;
export const MAX_GUARDIAN_CONSENT_BYTES = 10 * 1024 * 1024;
const retentionMs = GUARDIAN_CONSENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const objectStorage = new ObjectStorageService();

export const guardianConsentExpiresAt = (visitAt: Date) => new Date(visitAt.getTime() + retentionMs);

export function hasValidGuardianConsentSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png")
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e
      && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (contentType === "image/webp")
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function partnerAttendanceContext(attendanceId: string, partnerId: string) {
  const [row] = await db.select({
    attendance,
    offering: offerings,
    birthDate: memberProfiles.birthDate,
  }).from(attendance)
    .innerJoin(offerings, eq(attendance.offeringId, offerings.id))
    .leftJoin(memberProfiles, eq(attendance.userId, memberProfiles.userId))
    .where(eq(attendance.id, attendanceId))
    .limit(1);
  if (!row || row.offering.partnerId !== partnerId) throw new BookingError(404, "Attendance record not found.");
  if (!row.attendance.reservationId) throw new BookingError(409, "A reservation is required for guardian-consent evidence.");
  if (row.attendance.status !== "pending") throw new BookingError(409, "Guardian consent must be recorded before attendance is confirmed.");
  const age = ageOnDate(row.birthDate, row.offering.startsAt);
  if (age === null) throw new BookingError(409, "The member must add a valid birth date before guardian consent can be checked.");
  if (age >= 18) throw new BookingError(409, "Guardian consent is not required for an adult member.");
  return row;
}

export async function requestGuardianConsentUpload(
  attendanceId: string,
  partnerId: string,
  actorId: string,
  input: { contentType: "image/jpeg" | "image/png" | "image/webp"; size: number; onSiteVerified: true },
) {
  if (input.size < 1 || input.size > MAX_GUARDIAN_CONSENT_BYTES)
    throw new BookingError(400, "Choose an image no larger than 10 MB.");
  const row = await partnerAttendanceContext(attendanceId, partnerId);
  const now = new Date();
  const expiresAt = guardianConsentExpiresAt(row.attendance.checkedInAt);
  if (now >= expiresAt) throw new BookingError(410, "The 90-day document-retention period has ended.");

  const document = await db.transaction(async tx => {
    const [existing] = await tx.select().from(guardianConsentDocuments)
      .where(eq(guardianConsentDocuments.attendanceId, attendanceId))
      .for("update");
    if (existing?.status === "ready") throw new BookingError(409, "A guardian-consent copy is already stored for this visit.");
    const id = existing?.id ?? randomUUID();
    const stagingObjectPath = `/objects/guardian-consent-uploads/${attendanceId}/${id}`;
    const values = {
      memberUserId: row.attendance.userId,
      uploadedBy: actorId,
      objectPath: null,
      stagingObjectPath,
      contentType: input.contentType,
      size: input.size,
      status: "pending" as const,
      verifiedAt: now,
      expiresAt,
      fileDeletedAt: null,
    };
    if (existing) {
      await tx.update(guardianConsentDocuments).set(values).where(eq(guardianConsentDocuments.id, id));
    } else {
      await tx.insert(guardianConsentDocuments).values({ id, attendanceId, ...values });
    }
    return { id, stagingObjectPath, expiresAt };
  });

  const upload = await objectStorage.createGuardianConsentUpload(attendanceId, document.id);
  return { id: document.id, uploadURL: upload.uploadURL, expiresAt: document.expiresAt };
}

export async function completeGuardianConsentUpload(
  attendanceId: string,
  documentId: string,
  partnerId: string,
  actorId: string,
) {
  const row = await partnerAttendanceContext(attendanceId, partnerId);
  const [document] = await db.select().from(guardianConsentDocuments).where(and(
    eq(guardianConsentDocuments.id, documentId),
    eq(guardianConsentDocuments.attendanceId, attendanceId),
  ));
  if (!document || document.status !== "pending" || !document.stagingObjectPath)
    throw new BookingError(404, "Pending guardian-consent upload not found.");
  const now = new Date();
  if (document.expiresAt <= now) throw new BookingError(410, "The 90-day document-retention period has ended.");
  const file = await objectStorage.getPrivateFile(document.stagingObjectPath);
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size);
  if (!Number.isInteger(actualSize) || actualSize !== document.size || actualSize > MAX_GUARDIAN_CONSENT_BYTES) {
    await objectStorage.deletePrivateFile(document.stagingObjectPath);
    throw new BookingError(400, "The uploaded image size does not match the request.");
  }
  const [bytes] = await file.download();
  if (!hasValidGuardianConsentSignature(document.contentType, bytes)) {
    await objectStorage.deletePrivateFile(document.stagingObjectPath);
    throw new BookingError(400, "The uploaded file is not a valid JPEG, PNG, or WebP image.");
  }
  const promoted = await objectStorage.promoteGuardianConsentUpload(document.stagingObjectPath);
  const verifiedFile = await objectStorage.getPrivateFile(promoted.objectPath);
  const [verifiedMetadata] = await verifiedFile.getMetadata();
  const verifiedSize = Number(verifiedMetadata.size);
  let verifiedBytes = new Uint8Array();
  if (verifiedSize === document.size && verifiedSize <= MAX_GUARDIAN_CONSENT_BYTES) {
    const [downloaded] = await verifiedFile.download();
    verifiedBytes = Uint8Array.from(downloaded);
  }
  if (verifiedSize !== document.size || !hasValidGuardianConsentSignature(document.contentType, verifiedBytes)) {
    await objectStorage.deletePrivateFile(promoted.objectPath);
    throw new BookingError(400, "The uploaded image changed during verification. Please upload it again.");
  }

  await db.transaction(async tx => {
    const [fresh] = await tx.select().from(guardianConsentDocuments)
      .where(eq(guardianConsentDocuments.id, documentId)).for("update");
    if (!fresh || fresh.status !== "pending" || fresh.expiresAt <= now)
      throw new BookingError(409, "This guardian-consent upload is no longer available.");
    await tx.update(guardianConsentDocuments).set({
      status: "ready",
      uploadedBy: actorId,
      verifiedAt: now,
      objectPath: promoted.objectPath,
      stagingObjectPath: promoted.stagingObjectPath,
    })
      .where(eq(guardianConsentDocuments.id, documentId));
    await tx.insert(attendanceEvents).values({
      id: randomUUID(),
      reservationId: row.attendance.reservationId!,
      actorId,
      action: "guardian.consent.uploaded",
      before: "missing",
      after: documentId,
      reason: "Partner confirmed guardian consent on-site and uploaded its copy.",
    });
  });
}

export async function expireGuardianConsentDocuments(now = new Date()) {
  const expired = await db.select().from(guardianConsentDocuments).where(and(
    lte(guardianConsentDocuments.expiresAt, now),
    or(
      isNotNull(guardianConsentDocuments.objectPath),
      isNotNull(guardianConsentDocuments.stagingObjectPath),
    ),
  )).limit(100);
  let deleted = 0;
  let failed = 0;
  for (const document of expired) {
    try {
      if (document.objectPath) await objectStorage.deletePrivateFile(document.objectPath);
      if (document.stagingObjectPath) await objectStorage.deletePrivateFile(document.stagingObjectPath);
      await db.update(guardianConsentDocuments).set({
        objectPath: null,
        stagingObjectPath: null,
        status: "expired",
        fileDeletedAt: now,
      }).where(and(
        eq(guardianConsentDocuments.id, document.id),
        lte(guardianConsentDocuments.expiresAt, now),
      ));
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}
