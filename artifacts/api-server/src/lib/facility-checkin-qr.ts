import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db, facilityCheckinPoints, facilityCheckinQrActivity, facilityCheckinQrCodes, facilityProfiles,
} from "@workspace/db";
import { BookingError } from "./reservations";
import { isAccessSuspended } from "./account-access-restrictions";

const labelInput = z.object({
  en: z.string().trim().min(1).max(500),
  ar: z.string().trim().min(1).max(500),
  ku: z.string().trim().min(1).max(500),
}).strict();
export const facilityCheckinPointInput = z.object({
  label: labelInput,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().int().min(25).max(800),
  mode: z.enum(["static", "dynamic", "rotating"]),
}).strict();
export const facilityCheckinPointUpdate = facilityCheckinPointInput.omit({ mode: true });

type QrMode = "static" | "dynamic" | "rotating";
type Point = typeof facilityCheckinPoints.$inferSelect;
type QrCode = typeof facilityCheckinQrCodes.$inferSelect;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const qrExpiryMs: Record<Exclude<QrMode, "static">, number> = {
  dynamic: 5 * 60_000,
  rotating: 60_000,
};

function newToken(codeId: string) {
  return `MDG2:${codeId}:${randomBytes(32).toString("hex")}`;
}

async function createQrCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  point: Point,
  actorId: string,
  now: Date,
) {
  const codeId = randomUUID();
  const token = newToken(codeId);
  const expiresAt = point.mode === "static" ? null : new Date(
    now.getTime() + (point.mode === "rotating" ? qrExpiryMs.rotating : qrExpiryMs.dynamic),
  );
  await tx.update(facilityCheckinQrCodes).set({ revokedAt: now })
    .where(and(eq(facilityCheckinQrCodes.pointId, point.id), isNull(facilityCheckinQrCodes.revokedAt)));
  await tx.insert(facilityCheckinQrCodes).values({
    id: codeId, pointId: point.id, digest: digest(token), mode: point.mode,
    expiresAt, createdBy: actorId, createdAt: now,
  });
  return { token, expiresAt, codeId };
}

function pointResponse(point: Point, qr: QrCode | undefined) {
  const now = Date.now();
  const activeQr = !!qr && !qr.revokedAt && (!qr.expiresAt || qr.expiresAt.getTime() > now);
  return {
    id: point.id,
    facilityId: point.facilityId,
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude,
    radius: point.radius,
    mode: point.mode,
    active: point.active,
    hasActiveQr: point.active && activeQr,
    activeQrExpiresAt: activeQr ? qr!.expiresAt : null,
    createdAt: point.createdAt,
    updatedAt: point.updatedAt,
  };
}

export async function getFacilityCheckinPoints(facilityId: string) {
  const points = await db.select().from(facilityCheckinPoints)
    .where(eq(facilityCheckinPoints.facilityId, facilityId))
    .orderBy(desc(facilityCheckinPoints.createdAt));
  const pointIds = points.map(point => point.id);
  const codes = pointIds.length ? await db.select().from(facilityCheckinQrCodes)
    .where(inArray(facilityCheckinQrCodes.pointId, pointIds))
    .orderBy(desc(facilityCheckinQrCodes.createdAt)) : [];
  const activeCodeByPoint = new Map<string, QrCode>();
  const now = Date.now();
  for (const code of codes) {
    if (!activeCodeByPoint.has(code.pointId) && !code.revokedAt
      && (!code.expiresAt || code.expiresAt.getTime() > now)) activeCodeByPoint.set(code.pointId, code);
  }
  const activity = await db.select({
    id: facilityCheckinQrActivity.id,
    pointId: facilityCheckinQrActivity.pointId,
    action: facilityCheckinQrActivity.action,
    riskFlag: facilityCheckinQrActivity.riskFlag,
    reason: facilityCheckinQrActivity.reason,
    createdAt: facilityCheckinQrActivity.createdAt,
  }).from(facilityCheckinQrActivity)
    .where(eq(facilityCheckinQrActivity.facilityId, facilityId))
    .orderBy(desc(facilityCheckinQrActivity.createdAt))
    .limit(100);
  return {
    points: points.map(point => pointResponse(point, activeCodeByPoint.get(point.id))),
    activity,
  };
}

export async function createFacilityCheckinPoint(
  facilityId: string,
  actorId: string,
  input: z.infer<typeof facilityCheckinPointInput>,
) {
  if (await isAccessSuspended("facility", facilityId))
    throw new BookingError(403, "This facility is temporarily restricted from check-in changes.");
  return db.transaction(async tx => {
    const [facility] = await tx.select().from(facilityProfiles).where(eq(facilityProfiles.id, facilityId)).for("update");
    if (!facility) throw new BookingError(404, "Facility not found.");
    const now = new Date();
    const [point] = await tx.insert(facilityCheckinPoints).values({
      id: randomUUID(), facilityId, label: input.label, latitude: input.latitude,
      longitude: input.longitude, radius: input.radius, mode: input.mode, createdAt: now, updatedAt: now,
    }).returning();
    const issued = await createQrCode(tx, point, actorId, now);
    await tx.insert(facilityCheckinQrActivity).values({
      id: randomUUID(), facilityId, pointId: point.id, qrCodeId: issued.codeId,
      actorId, action: "point_created", reason: `Location QR point created (${point.mode})`,
    });
    return {
      point: pointResponse(point, {
        id: issued.codeId, pointId: point.id, digest: digest(issued.token), mode: point.mode,
        expiresAt: issued.expiresAt, revokedAt: null, createdBy: actorId, createdAt: now,
      }),
      token: issued.token,
      expiresAt: issued.expiresAt,
    };
  });
}

export async function issueFacilityCheckinQr(facilityId: string, pointId: string, actorId: string) {
  if (await isAccessSuspended("facility", facilityId))
    throw new BookingError(403, "This facility is temporarily restricted from check-in changes.");
  return db.transaction(async tx => {
    const [point] = await tx.select().from(facilityCheckinPoints).where(and(
      eq(facilityCheckinPoints.id, pointId), eq(facilityCheckinPoints.facilityId, facilityId),
    )).for("update");
    if (!point) throw new BookingError(404, "Check-in point not found.");
    if (!point.active) throw new BookingError(409, "This check-in point is inactive.");
    const now = new Date();
    const [latest] = await tx.select({ createdAt: facilityCheckinQrCodes.createdAt })
      .from(facilityCheckinQrCodes).where(eq(facilityCheckinQrCodes.pointId, pointId))
      .orderBy(desc(facilityCheckinQrCodes.createdAt)).limit(1);
    if (point.mode !== "static" && latest && now.getTime() - latest.createdAt.getTime() < 5000)
      throw new BookingError(429, "Wait a few seconds before issuing another QR code.");
    const issued = await createQrCode(tx, point, actorId, now);
    const action = point.mode === "static" ? "qr_replaced" : point.mode === "rotating" ? "qr_rotated" : "qr_issued";
    await tx.insert(facilityCheckinQrActivity).values({
      id: randomUUID(), facilityId, pointId, qrCodeId: issued.codeId, actorId, action,
      reason: point.mode === "static" ? "Printed QR replaced; previous code revoked" : "Short-lived QR issued; previous code revoked",
    });
    return { token: issued.token, expiresAt: issued.expiresAt };
  });
}

export async function updateFacilityCheckinPoint(
  facilityId: string,
  pointId: string,
  actorId: string,
  input: z.infer<typeof facilityCheckinPointUpdate>,
) {
  if (await isAccessSuspended("facility", facilityId))
    throw new BookingError(403, "This facility is temporarily restricted from check-in changes.");
  return db.transaction(async tx => {
    const [point] = await tx.select().from(facilityCheckinPoints).where(and(
      eq(facilityCheckinPoints.id, pointId), eq(facilityCheckinPoints.facilityId, facilityId),
    )).for("update");
    if (!point) throw new BookingError(404, "Check-in point not found.");
    if (!point.active) throw new BookingError(409, "This check-in point is inactive.");
    const now = new Date();
    const [updated] = await tx.update(facilityCheckinPoints).set({
      ...input, updatedAt: now,
    }).where(eq(facilityCheckinPoints.id, pointId)).returning();
    await tx.insert(facilityCheckinQrActivity).values({
      id: randomUUID(), facilityId, pointId, actorId, action: "point_updated",
      reason: "Location, radius, or display name updated",
    });
    const [activeCode] = await tx.select().from(facilityCheckinQrCodes)
      .where(and(eq(facilityCheckinQrCodes.pointId, pointId), isNull(facilityCheckinQrCodes.revokedAt)))
      .orderBy(desc(facilityCheckinQrCodes.createdAt)).limit(1);
    return pointResponse(updated, activeCode);
  });
}

export async function deactivateFacilityCheckinPoint(facilityId: string, pointId: string, actorId: string) {
  if (await isAccessSuspended("facility", facilityId))
    throw new BookingError(403, "This facility is temporarily restricted from check-in changes.");
  return db.transaction(async tx => {
    const [point] = await tx.select().from(facilityCheckinPoints).where(and(
      eq(facilityCheckinPoints.id, pointId), eq(facilityCheckinPoints.facilityId, facilityId),
    )).for("update");
    if (!point) throw new BookingError(404, "Check-in point not found.");
    const now = new Date();
    await tx.update(facilityCheckinPoints).set({ active: false, deactivatedAt: now, updatedAt: now })
      .where(eq(facilityCheckinPoints.id, pointId));
    await tx.update(facilityCheckinQrCodes).set({ revokedAt: now })
      .where(and(eq(facilityCheckinQrCodes.pointId, pointId), isNull(facilityCheckinQrCodes.revokedAt)));
    await tx.insert(facilityCheckinQrActivity).values({
      id: randomUUID(), facilityId, pointId, actorId, action: "point_deactivated",
      reason: "Location and all associated QR codes deactivated",
    });
    return { ok: true as const };
  });
}
