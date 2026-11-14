import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { partners } from "./operations";
import { membershipBilling } from "./payments";
import { partnerInvoiceSubmissions } from "./partner-invoices";

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

// Database triggers in migration 0004 enforce append-only decision history.
export const financeReviewEvents = pgTable("finance_review_events", {
  id: text("id").primaryKey(),
  reviewItemId: text("review_item_id").notNull().references(() => financeReviewItems.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financeInvoiceCorrections = pgTable("finance_invoice_corrections", {
  id: text("id").primaryKey(),
  membershipBillingId: text("membership_billing_id").references(() => membershipBilling.id),
  partnerInvoiceId: text("partner_invoice_id").references(() => partnerInvoiceSubmissions.id),
  correctionType: text("correction_type").notNull(),
  amountIqd: integer("amount_iqd"),
  refundTransactionReference: text("refund_transaction_reference"),
  reason: text("reason").notNull(),
  createdBy: text("created_by").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex("finance_invoice_corrections_idempotency").on(t.idempotencyKey),
  index("finance_invoice_corrections_created").on(t.createdAt),
  index("finance_invoice_corrections_retention").on(t.retentionUntil),
  check(
    "finance_invoice_corrections_one_original",
    sql`(${t.membershipBillingId} IS NOT NULL AND ${t.partnerInvoiceId} IS NULL) OR (${t.membershipBillingId} IS NULL AND ${t.partnerInvoiceId} IS NOT NULL)`,
  ),
  check("finance_invoice_corrections_positive_amount", sql`${t.amountIqd} IS NULL OR ${t.amountIqd} > 0`),
  check("finance_invoice_corrections_reason_length", sql`char_length(${t.reason}) BETWEEN 5 AND 500`),
]);
