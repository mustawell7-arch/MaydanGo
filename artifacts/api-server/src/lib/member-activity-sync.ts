import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  db,
  memberActivitySyncConsentEvents,
  memberActivitySyncSummaries,
  type MemberActivitySyncConsentEvent,
} from "@workspace/db";

export const MEMBER_ACTIVITY_SYNC_CONSENT_VERSION = "v1";

export async function getMemberActivitySyncState(userId: string) {
  const [history, records] = await Promise.all([
    db.select().from(memberActivitySyncConsentEvents)
      .where(eq(memberActivitySyncConsentEvents.userId, userId))
      .orderBy(desc(memberActivitySyncConsentEvents.recordedAt), desc(memberActivitySyncConsentEvents.id)),
    db.select().from(memberActivitySyncSummaries)
      .where(eq(memberActivitySyncSummaries.userId, userId))
      .orderBy(desc(memberActivitySyncSummaries.activityDate), desc(memberActivitySyncSummaries.provider)),
  ]);
  const latest = history[0];
  return {
    syncAvailable: false as const,
    consent: {
      status: latest?.policyVersion === MEMBER_ACTIVITY_SYNC_CONSENT_VERSION
        ? latest.action === "accepted" ? "enabled" as const : "revoked" as const
        : "not_enabled" as const,
      policyVersion: latest?.policyVersion ?? null,
      changedAt: latest?.recordedAt.toISOString() ?? null,
    },
    consentHistory: history.map((event: MemberActivitySyncConsentEvent) => ({
      action: event.action,
      policyVersion: event.policyVersion,
      recordedAt: event.recordedAt.toISOString(),
    })),
    records: records.map(record => ({
      activityDate: record.activityDate,
      steps: record.steps,
      completedWorkouts: record.completedWorkouts,
      source: record.provider,
      syncedAt: record.syncedAt.toISOString(),
    })),
  };
}

export async function acceptMemberActivitySync(userId: string) {
  const current = await db.select()
    .from(memberActivitySyncConsentEvents)
    .where(eq(memberActivitySyncConsentEvents.userId, userId))
    .orderBy(desc(memberActivitySyncConsentEvents.recordedAt), desc(memberActivitySyncConsentEvents.id))
    .limit(1);
  if (current[0]?.action !== "accepted"
    || current[0]?.policyVersion !== MEMBER_ACTIVITY_SYNC_CONSENT_VERSION) {
    await db.insert(memberActivitySyncConsentEvents).values({
      id: randomUUID(),
      userId,
      action: "accepted",
      policyVersion: MEMBER_ACTIVITY_SYNC_CONSENT_VERSION,
    });
  }
  return getMemberActivitySyncState(userId);
}

export async function revokeMemberActivitySync(userId: string) {
  await db.transaction(async tx => {
    const current = await tx.select()
      .from(memberActivitySyncConsentEvents)
      .where(eq(memberActivitySyncConsentEvents.userId, userId))
      .orderBy(desc(memberActivitySyncConsentEvents.recordedAt), desc(memberActivitySyncConsentEvents.id))
      .limit(1);
    if (current[0]?.action !== "revoked"
      || current[0]?.policyVersion !== MEMBER_ACTIVITY_SYNC_CONSENT_VERSION) {
      await tx.insert(memberActivitySyncConsentEvents).values({
        id: randomUUID(),
        userId,
        action: "revoked",
        policyVersion: MEMBER_ACTIVITY_SYNC_CONSENT_VERSION,
      });
    }
    await tx.delete(memberActivitySyncSummaries)
      .where(eq(memberActivitySyncSummaries.userId, userId));
  });
  return getMemberActivitySyncState(userId);
}

export async function deleteMemberActivitySyncData(userId: string) {
  const deleted = await db.delete(memberActivitySyncSummaries)
    .where(eq(memberActivitySyncSummaries.userId, userId))
    .returning({ id: memberActivitySyncSummaries.id });
  return { deletedRecords: deleted.length };
}
