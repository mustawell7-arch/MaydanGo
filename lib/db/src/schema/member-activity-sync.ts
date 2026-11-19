import { date, index, integer, pgTable, text, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export type MemberActivitySyncAction = "accepted" | "revoked";
export type MemberActivitySyncProvider = "apple_health" | "health_connect";

export const memberActivitySyncConsentEvents = pgTable("member_activity_sync_consent_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").$type<MemberActivitySyncAction>().notNull(),
  policyVersion: text("policy_version").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("member_activity_sync_consent_owner_history").on(table.userId, table.recordedAt),
  check("member_activity_sync_consent_action_valid", sql`${table.action} in ('accepted', 'revoked')`),
]);

export const memberActivitySyncSummaries = pgTable("member_activity_sync_summaries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").$type<MemberActivitySyncProvider>().notNull(),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  steps: integer("steps"),
  completedWorkouts: integer("completed_workouts").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("member_activity_sync_summary_owner_source_day").on(
    table.userId,
    table.provider,
    table.activityDate,
  ),
  index("member_activity_sync_summary_owner_day").on(table.userId, table.activityDate),
  check("member_activity_sync_provider_valid", sql`${table.provider} in ('apple_health', 'health_connect')`),
  check("member_activity_sync_steps_valid", sql`${table.steps} is null or ${table.steps} between 0 and 300000`),
  check("member_activity_sync_workouts_valid", sql`${table.completedWorkouts} between 0 and 100`),
  check("member_activity_sync_summary_nonempty", sql`${table.steps} is not null or ${table.completedWorkouts} > 0`),
]);

export const insertMemberActivitySyncSummarySchema = createInsertSchema(memberActivitySyncSummaries)
  .omit({ id: true, syncedAt: true })
  .extend({
    steps: z.number().int().min(0).max(300_000).nullable(),
    completedWorkouts: z.number().int().min(0).max(100),
  });

export type MemberActivitySyncConsentEvent = typeof memberActivitySyncConsentEvents.$inferSelect;
export type MemberActivitySyncSummary = typeof memberActivitySyncSummaries.$inferSelect;
