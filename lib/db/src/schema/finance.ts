import { date, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { partners } from "./operations";

export const financeReviewItems = pgTable("finance_review_items", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  billingId: text("billing_id"),
  partnerId: text("partner_id").references(() => partners.id),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  amountIqd: integer("amount_iqd"),
  reason: text("reason").notNull(),
  requestedBy: text("requested_by").notNull(),
  reviewedBy: text("reviewed_by"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, t => [uniqueIndex("finance_review_idempotency_key").on(t.idempotencyKey)]);

// Decision records are append-only in the application: no update or delete routes exist.
export const financeReviewEvents = pgTable("finance_review_events", {
  id: text("id").primaryKey(),
  reviewItemId: text("review_item_id").notNull().references(() => financeReviewItems.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
