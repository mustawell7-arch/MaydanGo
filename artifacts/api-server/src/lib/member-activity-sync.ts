import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  memberActivitySyncConsentEvents,
  memberActivitySyncSummaries,
  type MemberActivitySyncConsentEvent,
  type MemberActivitySyncProvider,
} from "@workspace/db";

export const MEMBER_ACTIVITY_SYNC_CONSENT_VERSION = "v2";

async function lockMemberActivitySync(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

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
    syncAvailable: true,
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

export async function syncMemberActivitySummaries(
  userId: string,
  provider: MemberActivitySyncProvider,
  summaries: Array<{
    activityDate: string;
    steps: number | null;
    completedWorkouts: number;
  }>,
) {
  await db.transaction(async tx => {
    await lockMemberActivitySync(tx, userId);
    const latest = await tx.select()
      .from(memberActivitySyncConsentEvents)
      .where(eq(memberActivitySyncConsentEvents.userId, userId))
      .orderBy(desc(memberActivitySyncConsentEvents.recordedAt), desc(memberActivitySyncConsentEvents.id))
      .limit(1);
    if (latest[0]?.action !== "accepted"
      || latest[0]?.policyVersion !== MEMBER_ACTIVITY_SYNC_CONSENT_VERSION) {
      throw new MemberActivitySyncConsentRequiredError();
    }
    await tx.insert(memberActivitySyncSummaries).values(summaries.map(summary => ({
      id: randomUUID(),
      userId,
      provider,
      activityDate: summary.activityDate,
      steps: summary.steps,
      completedWorkouts: summary.completedWorkouts,
      syncedAt: new Date(),
    }))).onConflictDoUpdate({
      target: [
        memberActivitySyncSummaries.userId,
        memberActivitySyncSummaries.provider,
        memberActivitySyncSummaries.activityDate,
      ],
      set: {
        steps: sql`excluded.steps`,
        completedWorkouts: sql`excluded.completed_workouts`,
        syncedAt: new Date(),
      },
    });
  });
  return getMemberActivitySyncState(userId);
}

export async function acceptMemberActivitySync(userId: string) {
  await db.transaction(async tx => {
    await lockMemberActivitySync(tx, userId);
    const current = await tx.select()
      .from(memberActivitySyncConsentEvents)
      .where(eq(memberActivitySyncConsentEvents.userId, userId))
      .orderBy(desc(memberActivitySyncConsentEvents.recordedAt), desc(memberActivitySyncConsentEvents.id))
      .limit(1);
    if (current[0]?.action !== "accepted"
      || current[0]?.policyVersion !== MEMBER_ACTIVITY_SYNC_CONSENT_VERSION) {
      await tx.insert(memberActivitySyncConsentEvents).values({
        id: randomUUID(),
        userId,
        action: "accepted",
        policyVersion: MEMBER_ACTIVITY_SYNC_CONSENT_VERSION,
      });
    }
  });
  return getMemberActivitySyncState(userId);
}

export async function revokeMemberActivitySync(userId: string) {
  await db.transaction(async tx => {
    await lockMemberActivitySync(tx, userId);
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
  return db.transaction(async tx => {
    await lockMemberActivitySync(tx, userId);
    const deleted = await tx.delete(memberActivitySyncSummaries)
      .where(eq(memberActivitySyncSummaries.userId, userId))
      .returning({ id: memberActivitySyncSummaries.id });
    return { deletedRecords: deleted.length };
  });
}

export class MemberActivitySyncConsentRequiredError extends Error {
  constructor() {
    super("Enable activity-data sharing before syncing health summaries.");
    this.name = "MemberActivitySyncConsentRequiredError";
  }
}
