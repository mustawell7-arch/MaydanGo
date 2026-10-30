import { pgTable, text, timestamp, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { LocalizedText } from "./learning";
import { membershipBilling } from "./payments";

export type AccessRules = {
  cities?: string[]; facilities?: string[]; categories?: string[];
  quota: number; dailyLimit: number;
  quotaMode?: "shared" | "separate";
  physicalQuota?: number; premiumQuota?: number; liveQuota?: number;
  partnerGroupLimits?: Record<string, number>;
  trialAllowedTypes?: string[];
  corporateId?: string;
  facilityLimits?: Record<string, number>;
  categoryLimits?: Record<string, number>;
};
export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  gender: text("gender").notNull(),
  birthDate: text("birth_date").notNull(),
});
export const memberships = pgTable("memberships", {
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),
  status: text("status").notNull(),
  paymentStatus: text("payment_status").notNull(),
  tier: text("tier").notNull(),
  source: text("source").notNull().default("legacy"),
  billingId: text("billing_id").references(() => membershipBilling.id),
  corporateId: text("corporate_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  rules: jsonb("rules").$type<AccessRules>().notNull(),
}, t => [
  uniqueIndex("membership_owner_scope").on(t.userId, t.scope),
  uniqueIndex("membership_billing_owner").on(t.billingId).where(sql`${t.billingId} is not null`),
]);

export const offerings = pgTable("booking_offerings", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  targetId: text("target_id").notNull(),
  slot: text("slot").notNull().default(""),
  title: text("title").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>(),
  localizedDescription: jsonb("localized_description").$type<LocalizedText>(),
  joinUrl: text("join_url"),
  scope: text("scope").notNull(),
  partnerId: text("partner_id"),
  partnerGroup: text("partner_group"),
  accessType: text("access_type").notNull().default("physical"),
  active: boolean("active").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  city: text("city").notNull(),
  facility: text("facility").notNull(),
  category: text("category").notNull(),
  tiers: jsonb("tiers").$type<string[]>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  cancellationDeadline: timestamp("cancellation_deadline", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
  waitlistOfferMinutes: integer("waitlist_offer_minutes").notNull().default(30),
  additionalPayment: boolean("additional_payment").notNull().default(false),
  gender: text("gender").notNull().default("all"),
  minAge: integer("min_age").notNull().default(0),
  maxAge: integer("max_age"),
}, t => [uniqueIndex("offering_target_slot").on(t.kind, t.targetId, t.slot)]);

export const reservations = pgTable("reservations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, t => [uniqueIndex("one_active_reservation").on(t.userId, t.offeringId)
  .where(sql`${t.status} in ('reserved', 'requested')`)]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  queuePosition: integer("queue_position").notNull(),
  status: text("status").notNull().default("waiting"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  // Retained for non-destructive upgrades from the earlier waitlist schema.
  legacyReservationId: text("reservation_id").references(() => reservations.id),
  legacyReason: text("reason"),
  legacyJoinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  legacyUpdatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("waitlist_position_per_offering").on(t.offeringId, t.queuePosition),
  uniqueIndex("one_active_waitlist_entry").on(t.userId, t.offeringId)
    .where(sql`${t.status} in ('waiting', 'offered')`),
]);

// Attendance is intentionally separate. Customer booking endpoints never insert here.
export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull(),
  verifiedBy: text("verified_by").notNull(),
  reservationId: text("reservation_id").references(() => reservations.id),
  status: text("status").notNull().default("pending"),
  settlementEligible: boolean("settlement_eligible").notNull().default(false),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
}, t => [
  uniqueIndex("attendance_reservation").on(t.reservationId),
  uniqueIndex("one_verified_visit_per_offering").on(t.userId, t.offeringId)
    .where(sql`${t.reservationId} is not null and ${t.status} in ('pending', 'confirmed', 'disputed')`),
]);
