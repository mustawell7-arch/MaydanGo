import { createHash, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  memberDeviceChanges,
  memberDeviceEvents,
  memberDevices,
  operationAudit,
} from "@workspace/db";
import { getPlatformSafetyRules } from "./platform-rules";

const HOUR_MS = 60 * 60 * 1000;
const DEVICE_TOKEN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function getDeviceChangeActivationAt(now: Date, waitHours = 24) {
  return new Date(now.getTime() + waitHours * HOUR_MS);
}

export function shouldFlagDeviceChange(recentChangeCount: number, threshold = 2) {
  return recentChangeCount >= threshold;
}

export type MemberDevicePlatform = "ios" | "android" | "unknown";
export type MemberDeviceStatusValue = "primary" | "pending" | "revoked";
export type MemberDeviceStatus = {
  status: MemberDeviceStatusValue;
  currentPlatform: MemberDevicePlatform | null;
  pendingActivationAt: Date | null;
  pendingPlatform: MemberDevicePlatform | null;
  pendingRiskFlag: boolean;
  waitHours: number;
};
type DeviceRegistrationResult =
  | { conflict: true }
  | { pendingConflict: true }
  | { status: MemberDeviceStatus };

export class DeviceSecurityError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "DeviceSecurityError";
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isPlatform(value: string): value is MemberDevicePlatform {
  return value === "ios" || value === "android" || value === "unknown";
}

export function readMemberDeviceToken(req: Request) {
  const token = req.header("x-maydango-device")?.trim();
  return token && DEVICE_TOKEN_PATTERN.test(token) ? token.toLowerCase() : null;
}

async function writeEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  values: {
    userId: string;
    kind: string;
    detail?: string;
    changeId?: string | null;
    deviceId?: string | null;
    actorId?: string | null;
    createdAt: Date;
  },
) {
  await tx.insert(memberDeviceEvents).values({
    id: randomUUID(),
    userId: values.userId,
    kind: values.kind,
    detail: values.detail ?? "",
    changeId: values.changeId ?? null,
    deviceId: values.deviceId ?? null,
    actorId: values.actorId ?? null,
    createdAt: values.createdAt,
  });
}

async function promotePendingChange(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  now: Date,
) {
  const [change] = await tx.select().from(memberDeviceChanges)
    .where(and(eq(memberDeviceChanges.userId, userId), eq(memberDeviceChanges.status, "pending")))
    .for("update").limit(1);
  if (!change || change.activateAt > now) return;

  await tx.update(memberDevices).set({ status: "revoked", revokedAt: now, lastSeenAt: now })
    .where(and(eq(memberDevices.id, change.oldDeviceId), eq(memberDevices.status, "primary")));
  await tx.update(memberDevices).set({ status: "primary", lastSeenAt: now })
    .where(and(eq(memberDevices.id, change.newDeviceId), eq(memberDevices.status, "pending")));
  await tx.update(memberDeviceChanges).set({ status: "activated", resolvedAt: now })
    .where(eq(memberDeviceChanges.id, change.id));
  await writeEvent(tx, {
    userId,
    kind: "cooldown_completed",
    detail: `Pending device change activated after the ${Math.max(1, Math.ceil((change.activateAt.getTime() - change.requestedAt.getTime()) / HOUR_MS))}-hour wait.`,
    changeId: change.id, deviceId: change.newDeviceId, createdAt: now,
  });
}

async function readStatus(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  installationHash: string,
  now: Date,
  configuredWaitHours: number,
): Promise<MemberDeviceStatus> {
  await promotePendingChange(tx, userId, now);
  const [device] = await tx.select().from(memberDevices)
    .where(and(eq(memberDevices.userId, userId), eq(memberDevices.tokenHash, installationHash)))
    .limit(1);
  if (!device) throw new DeviceSecurityError(404, "DEVICE_NOT_REGISTERED", "This installation is not registered.");

  const [change] = await tx.select().from(memberDeviceChanges)
    .where(and(eq(memberDeviceChanges.userId, userId), eq(memberDeviceChanges.status, "pending")))
    .limit(1);
  let pendingPlatform: MemberDevicePlatform | null = null;
  if (change) {
    const [pendingDevice] = await tx.select({ platform: memberDevices.platform }).from(memberDevices)
      .where(eq(memberDevices.id, change.newDeviceId)).limit(1);
    pendingPlatform = pendingDevice && isPlatform(pendingDevice.platform) ? pendingDevice.platform : "unknown";
  }

  return {
    status: device.status === "primary" || device.status === "pending" || device.status === "revoked"
      ? device.status : "revoked",
    currentPlatform: isPlatform(device.platform) ? device.platform : "unknown",
    pendingActivationAt: change?.activateAt ?? null,
    pendingPlatform,
    pendingRiskFlag: change?.riskFlag ?? false,
    waitHours: change
      ? Math.max(1, Math.ceil((change.activateAt.getTime() - change.requestedAt.getTime()) / HOUR_MS))
      : configuredWaitHours,
  };
}

/**
 * Register an installation, or return its existing state. Only a SHA-256 digest
 * of the random, installation-scoped secret is retained by the server.
 */
export async function getMemberDeviceStatus(
  userId: string,
  token: string,
  platform: MemberDevicePlatform = "unknown",
  now = new Date(),
): Promise<MemberDeviceStatus> {
  if (!DEVICE_TOKEN_PATTERN.test(token)) {
    throw new DeviceSecurityError(403, "DEVICE_REGISTRATION_REQUIRED", "Secure device registration is required.");
  }
  if (!isPlatform(platform)) {
    throw new DeviceSecurityError(400, "INVALID_DEVICE_PLATFORM", "Choose a supported device platform.");
  }

  const rules = await getPlatformSafetyRules();
  const installationHash = tokenHash(token.toLowerCase());
  let result: DeviceRegistrationResult | null = null;
  try {
    result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [existing] = await tx.select().from(memberDevices)
      .where(eq(memberDevices.tokenHash, installationHash)).for("update").limit(1);

    if (existing && existing.userId !== userId) {
      await writeEvent(tx, {
        userId, kind: "installation_reuse_blocked",
        detail: "An installation secret already registered to another account was rejected.",
        createdAt: now,
      });
      return { conflict: true as const };
    }

    if (existing) {
      if (existing.platform === "unknown" && platform !== "unknown") {
        await tx.update(memberDevices).set({ platform, lastSeenAt: now }).where(eq(memberDevices.id, existing.id));
      } else {
        await tx.update(memberDevices).set({ lastSeenAt: now }).where(eq(memberDevices.id, existing.id));
      }
      return { status: await readStatus(tx, userId, installationHash, now, rules.deviceChangeWaitHours) };
    }

    const [pendingChange] = await tx.select({ id: memberDeviceChanges.id }).from(memberDeviceChanges)
      .where(and(eq(memberDeviceChanges.userId, userId), eq(memberDeviceChanges.status, "pending")))
      .for("update").limit(1);
    if (pendingChange) {
      await writeEvent(tx, {
        userId, kind: "additional_change_blocked",
        detail: "A second device change was requested while the first was still pending.",
        createdAt: now,
      });
      return { pendingConflict: true as const };
    }

    const [primary] = await tx.select().from(memberDevices)
      .where(and(eq(memberDevices.userId, userId), eq(memberDevices.status, "primary")))
      .for("update").limit(1);
    const newDeviceId = randomUUID();
    if (!primary) {
      await tx.insert(memberDevices).values({
        id: newDeviceId, userId, tokenHash: installationHash, platform,
        status: "primary", createdAt: now, lastSeenAt: now,
      });
      await writeEvent(tx, {
        userId, kind: "primary_device_registered", detail: "Initial primary installation registered.",
        deviceId: newDeviceId, createdAt: now,
      });
      return { status: await readStatus(tx, userId, installationHash, now, rules.deviceChangeWaitHours) };
    }

    const [recentChanges] = await tx.select({ count: sql<number>`count(*)::int` }).from(memberDeviceChanges)
      .where(and(
        eq(memberDeviceChanges.userId, userId),
         gte(memberDeviceChanges.requestedAt,
           new Date(now.getTime() - rules.deviceChangeRiskWindowDays * 24 * HOUR_MS)),
      ));
    const riskFlag = shouldFlagDeviceChange(
      Number(recentChanges?.count ?? 0),
      rules.repeatedDeviceChangeThreshold,
    );
    const changeId = randomUUID();
    const activateAt = getDeviceChangeActivationAt(now, rules.deviceChangeWaitHours);
    await tx.insert(memberDevices).values({
      id: newDeviceId, userId, tokenHash: installationHash, platform,
      status: "pending", createdAt: now, lastSeenAt: now,
    });
    await tx.insert(memberDeviceChanges).values({
      id: changeId, userId, oldDeviceId: primary.id, newDeviceId,
      status: "pending", requestedAt: now, activateAt, riskFlag,
    });
    await writeEvent(tx, {
      userId, kind: riskFlag ? "repeated_change_flagged" : "device_change_requested",
      detail: riskFlag
        ? `Repeated device changes in the last ${rules.deviceChangeRiskWindowDays} days were flagged for support review.`
        : `A ${rules.deviceChangeWaitHours}-hour device change wait started; the previous primary installation remains active.`,
      changeId, deviceId: newDeviceId, createdAt: now,
    });
    return { status: await readStatus(tx, userId, installationHash, now, rules.deviceChangeWaitHours) };
    });
  } catch (cause) {
    const dbError = cause as { code?: string; constraint?: string };
    if (dbError.code === "23505" && dbError.constraint === "member_devices_token_hash_unique") {
      await db.insert(memberDeviceEvents).values({
        id: randomUUID(), userId, kind: "installation_reuse_blocked",
        detail: "A concurrent request registered this installation to another account.",
        createdAt: now,
      });
      throw new DeviceSecurityError(409, "INSTALLATION_ALREADY_LINKED", "This installation is linked to another account. Contact support if this is unexpected.");
    }
    throw cause;
  }

  if (!result) throw new Error("Device registration did not return a status.");
  if ("conflict" in result) {
    throw new DeviceSecurityError(409, "INSTALLATION_ALREADY_LINKED", "This installation is linked to another account. Contact support if this is unexpected.");
  }
  if ("pendingConflict" in result) {
    throw new DeviceSecurityError(409, "DEVICE_CHANGE_ALREADY_PENDING", "A device change is already waiting. Use your current phone or contact support.");
  }
  return result.status;
}

export async function cancelMemberDeviceChange(userId: string, token: string) {
  const rules = await getPlatformSafetyRules();
  const installationHash = tokenHash(token.toLowerCase());
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [device] = await tx.select().from(memberDevices)
      .where(and(
        eq(memberDevices.userId, userId),
        eq(memberDevices.tokenHash, installationHash),
        eq(memberDevices.status, "primary"),
      )).for("update").limit(1);
    if (!device) throw new DeviceSecurityError(403, "PRIMARY_DEVICE_REQUIRED", "Only the current primary phone can cancel this change.");
    const [change] = await tx.select().from(memberDeviceChanges)
      .where(and(eq(memberDeviceChanges.userId, userId), eq(memberDeviceChanges.status, "pending")))
      .for("update").limit(1);
    if (change) {
      await tx.update(memberDevices).set({ status: "revoked", revokedAt: new Date() })
        .where(and(eq(memberDevices.id, change.newDeviceId), eq(memberDevices.status, "pending")));
      await tx.update(memberDeviceChanges).set({
        status: "cancelled", resolvedAt: new Date(), resolvedBy: userId, resolutionReason: "Cancelled by primary installation.",
      }).where(eq(memberDeviceChanges.id, change.id));
      await writeEvent(tx, {
        userId, kind: "device_change_cancelled", detail: "The primary installation cancelled the pending change.",
        changeId: change.id, deviceId: device.id, actorId: userId, createdAt: new Date(),
      });
    }
    return readStatus(tx, userId, installationHash, new Date(), rules.deviceChangeWaitHours);
  });
}

export async function listPendingMemberDeviceChanges() {
  const rows = await db.select().from(memberDeviceChanges)
    .where(eq(memberDeviceChanges.status, "pending"))
    .orderBy(memberDeviceChanges.requestedAt).limit(100);
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap(row => [row.oldDeviceId, row.newDeviceId]))];
  const devices = await db.select({ id: memberDevices.id, platform: memberDevices.platform }).from(memberDevices)
    .where(inArray(memberDevices.id, ids));
  const platformById = new Map(devices.map(device => [
    device.id, isPlatform(device.platform) ? device.platform : "unknown" as const,
  ]));
  return rows.map(row => ({
    id: row.id, userId: row.userId, requestedAt: row.requestedAt, activateAt: row.activateAt,
    fromPlatform: platformById.get(row.oldDeviceId) ?? "unknown",
    toPlatform: platformById.get(row.newDeviceId) ?? "unknown",
    riskFlag: row.riskFlag,
  }));
}

export async function approveMemberDeviceChange(changeId: string, actorId: string, reason: string) {
  const [initial] = await db.select({ userId: memberDeviceChanges.userId }).from(memberDeviceChanges)
    .where(eq(memberDeviceChanges.id, changeId)).limit(1);
  if (!initial) throw new DeviceSecurityError(409, "DEVICE_CHANGE_NOT_PENDING", "This device change is no longer pending.");
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${initial.userId}))`);
    const [lockedChange] = await tx.select().from(memberDeviceChanges)
      .where(eq(memberDeviceChanges.id, changeId)).for("update").limit(1);
    if (!lockedChange || lockedChange.status !== "pending") {
      throw new DeviceSecurityError(409, "DEVICE_CHANGE_NOT_PENDING", "This device change is no longer pending.");
    }
    const now = new Date();
    await tx.update(memberDevices).set({ status: "revoked", revokedAt: now, lastSeenAt: now })
      .where(and(eq(memberDevices.id, lockedChange.oldDeviceId), eq(memberDevices.status, "primary")));
    await tx.update(memberDevices).set({ status: "primary", lastSeenAt: now })
      .where(and(eq(memberDevices.id, lockedChange.newDeviceId), eq(memberDevices.status, "pending")));
    await tx.update(memberDeviceChanges).set({
      status: "support_approved", resolvedAt: now, resolvedBy: actorId, resolutionReason: reason.trim(),
    }).where(eq(memberDeviceChanges.id, changeId));
    await writeEvent(tx, {
      userId: lockedChange.userId, kind: "support_approved_early",
      detail: `Support approved the device change early: ${reason.trim()}`,
      changeId, deviceId: lockedChange.newDeviceId, actorId, createdAt: now,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(), actorId, action: "support.member_device.approve",
      targetId: lockedChange.userId, detail: `changeId=${changeId}; reason=${reason.trim()}`,
    });
    return { id: changeId, status: "support_approved" as const };
  });
}

export function requirePrimaryMemberDevice(req: Request, res: Response, next: NextFunction) {
  // Keep the authenticated support channel reachable from a replacement phone
  // so a member can ask for help during the waiting period.
  if (req.path.startsWith("/support/")) {
    next();
    return;
  }
  // Browser sessions remain usable on the website. Native bearer requests must
  // prove possession of their registered installation secret.
  if (!req.header("authorization")?.startsWith("Bearer ")) {
    next();
    return;
  }
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to use your member account." });
    return;
  }
  const token = readMemberDeviceToken(req);
  if (!token) {
    res.status(403).json({
      code: "DEVICE_REGISTRATION_REQUIRED",
      message: "Secure device registration is required before using member features.",
    });
    return;
  }
  void getMemberDeviceStatus(userId, token).then(status => {
    if (status.status === "primary") {
      next();
      return;
    }
    const pending = status.status === "pending";
    res.status(pending ? 423 : 403).json({
      code: pending ? "DEVICE_CHANGE_PENDING" : "DEVICE_REVOKED",
      status: status.status,
      pendingActivationAt: status.pendingActivationAt,
      message: pending
        ? `This phone is waiting for the ${status.waitHours}-hour device change period to end.`
        : "This phone is no longer the primary device for this account.",
    });
  }).catch(next);
}
