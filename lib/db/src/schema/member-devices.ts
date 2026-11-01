import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const memberDevices = pgTable("member_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [
  uniqueIndex("member_devices_token_hash_unique").on(t.tokenHash),
  uniqueIndex("member_devices_primary_user_unique").on(t.userId).where(sql`${t.status} = 'primary'`),
  uniqueIndex("member_devices_pending_user_unique").on(t.userId).where(sql`${t.status} = 'pending'`),
  index("member_devices_user_status_idx").on(t.userId, t.status),
]);

export const memberDeviceChanges = pgTable("member_device_changes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  oldDeviceId: text("old_device_id").notNull().references(() => memberDevices.id),
  newDeviceId: text("new_device_id").notNull().references(() => memberDevices.id),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  activateAt: timestamp("activate_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
  resolutionReason: text("resolution_reason"),
  riskFlag: boolean("risk_flag").notNull().default(false),
}, t => [
  uniqueIndex("member_device_changes_pending_user_unique").on(t.userId).where(sql`${t.status} = 'pending'`),
  index("member_device_changes_queue_idx").on(t.status, t.requestedAt),
  index("member_device_changes_user_requested_idx").on(t.userId, t.requestedAt),
]);

export const memberDeviceEvents = pgTable("member_device_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  changeId: text("change_id").references(() => memberDeviceChanges.id),
  deviceId: text("device_id").references(() => memberDevices.id),
  actorId: text("actor_id"),
  kind: text("kind").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("member_device_events_user_created_idx").on(t.userId, t.createdAt),
  index("member_device_events_kind_created_idx").on(t.kind, t.createdAt),
]);
