import { pgTable, text, boolean, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { membershipPlans } from "./operations";

// Local ownership mapping. PayTabs remains authoritative for payment and agreement state.
export const membershipBilling = pgTable("membership_billing", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").notNull().references(() => membershipPlans.id),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  amountIqd: integer("amount_iqd"),
  providerCheckoutRef: text("provider_checkout_ref"),
  paytabsAgreementId: text("paytabs_agreement_id"),
  // Legacy Whop columns are retained during this additive provider migration.
  checkoutConfigurationId: text("checkout_configuration_id"),
  purchaseUrl: text("purchase_url"),
  whopMembershipId: text("whop_membership_id"),
  lastPaymentId: text("last_payment_id"),
  recoveryUrl: text("recovery_url"),
  providerMembershipStatus: text("provider_membership_status"),
  periodStartsAt: timestamp("period_starts_at", { withTimezone: true }),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  refundStatus: text("refund_status").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("membership_billing_checkout").on(t.checkoutConfigurationId),
  uniqueIndex("membership_billing_whop_membership").on(t.whopMembershipId),
  uniqueIndex("membership_billing_paytabs_checkout").on(t.providerCheckoutRef),
  uniqueIndex("membership_billing_paytabs_agreement").on(t.paytabsAgreementId),
  uniqueIndex("membership_billing_pending_user").on(t.userId).where(sql`${t.status} = 'pending'`),
  index("membership_billing_user_created").on(t.userId, t.createdAt),
]);

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
