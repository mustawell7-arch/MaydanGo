import { pgTable, text, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const supportTickets = pgTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull(),
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
  index("support_tickets_assignee_idx").on(t.assignedTo, t.status),
]);

export const supportMessages = pgTable("support_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull(),
  authorRole: text("author_role").notNull(),
  body: text("body").notNull(),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("support_messages_ticket_created_idx").on(t.ticketId, t.createdAt)]);

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
  status: text("status").notNull().default("pending"),
  error: text("error"),
  providerTicketId: text("provider_ticket_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, t => [
  index("push_deliveries_status_created_idx").on(t.status, t.createdAt),
  index("push_deliveries_user_created_idx").on(t.userId, t.createdAt),
]);
