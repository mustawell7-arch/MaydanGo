import { pgTable, text, boolean, timestamp, integer, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";

export const supportTickets = pgTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull(),
  urgent: boolean("urgent").notNull().default(false),
  urgentAlertStatus: text("urgent_alert_status").notNull().default("not_applicable"),
  urgentEscalatedAt: timestamp("urgent_escalated_at", { withTimezone: true }),
  language: text("language").notNull().default("en"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, t => [
  index("support_tickets_owner_activity_idx").on(t.userId, t.lastMessageAt),
  index("support_tickets_queue_idx").on(t.status, t.lastMessageAt),
  index("support_tickets_urgent_queue_idx").on(t.urgent, t.status, t.lastMessageAt),
  index("support_tickets_assignee_idx").on(t.assignedTo, t.status),
]);

export const supportMessages = pgTable("support_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull(),
  authorRole: text("author_role").notNull(),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("support_messages_ticket_created_idx").on(t.ticketId, t.createdAt)]);

export const supportAttachments = pgTable("support_attachments", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().references(() => supportMessages.id, { onDelete: "cascade" }),
  uploaderId: text("uploader_id").notNull(),
  uploaderRole: text("uploader_role").notNull().default("member"),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  objectPath: text("object_path").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("support_attachments_ticket_created_idx").on(t.ticketId, t.createdAt),
  index("support_attachments_message_status_idx").on(t.messageId, t.status),
]);

export const supportTicketEvents = pgTable("support_ticket_events", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status"),
  previousAssignee: text("previous_assignee"),
  nextAssignee: text("next_assignee"),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("support_ticket_events_ticket_created_idx").on(t.ticketId, t.createdAt)]);

export const memberNotificationPreferences = pgTable("member_notification_preferences", {
  userId: text("user_id").primaryKey(),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  language: text("language").notNull().default("en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushDevices = pgTable("push_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("push_devices_token_unique").on(t.token),
  index("push_devices_user_enabled_idx").on(t.userId, t.enabled),
]);

export const pushDeliveries = pgTable("push_deliveries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  deviceId: text("device_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  payloadData: jsonb("payload_data").$type<Record<string, string>>().notNull().default({}),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  providerTicketId: text("provider_ticket_id"),
  dedupeKey: text("dedupe_key"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  receiptStatus: text("receipt_status"),
  receiptError: text("receipt_error"),
  receiptCheckedAt: timestamp("receipt_checked_at", { withTimezone: true }),
  receiptAttemptCount: integer("receipt_attempt_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, t => [
  uniqueIndex("push_deliveries_dedupe_key_unique").on(t.dedupeKey),
  index("push_deliveries_status_created_idx").on(t.status, t.createdAt),
  index("push_deliveries_retry_due_idx").on(t.status, t.nextAttemptAt),
  index("push_deliveries_receipt_due_idx").on(t.status, t.receiptStatus, t.acceptedAt),
  index("push_deliveries_user_created_idx").on(t.userId, t.createdAt),
]);

export const memberUpdates = pgTable("member_updates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventKey: text("event_key").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("member_updates_event_key_unique").on(t.eventKey),
  index("member_updates_owner_created_idx").on(t.userId, t.createdAt),
]);
