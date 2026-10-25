import { pgTable, text, timestamp, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type AccessRules = {
  cities?: string[]; facilities?: string[]; categories?: string[];
  quota: number; dailyLimit: number;
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
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  rules: jsonb("rules").$type<AccessRules>().notNull(),
}, t => [uniqueIndex("membership_owner_scope").on(t.userId, t.scope)]);

export const offerings = pgTable("booking_offerings", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  targetId: text("target_id").notNull(),
  slot: text("slot").notNull().default(""),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  active: boolean("active").notNull().default(false),
  city: text("city").notNull(),
  facility: text("facility").notNull(),
  category: text("category").notNull(),
  tiers: jsonb("tiers").$type<string[]>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  cancellationDeadline: timestamp("cancellation_deadline", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
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

// Attendance is intentionally separate. Customer booking endpoints never insert here.
export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull(),
  verifiedBy: text("verified_by").notNull(),
});
