import { pgTable, text, boolean, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AccessRules } from "./bookings";

export const partners = pgTable("partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupId: text("group_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  approved: boolean("approved").notNull().default(false),
});
// Provisioned by a trusted operator, never from profile/client metadata.
export const operators = pgTable("operators", {
  userId: text("user_id").primaryKey(),
  role: text("role").notNull(),
  partnerId: text("partner_id").references(() => partners.id),
});
export const membershipPlans = pgTable("membership_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tier: text("tier").notNull(),
  kind: text("kind").notNull(),
  durationDays: integer("duration_days").notNull(),
  priceIqd: integer("price_iqd"),
  // Kept only so the additive schema update does not drop old provider data.
  whopPlanId: text("whop_plan_id"),
  active: boolean("active").notNull().default(false),
  rules: jsonb("rules").$type<AccessRules>().notNull(),
}, t => [uniqueIndex("membership_plans_whop_plan").on(t.whopPlanId).where(sql`${t.whopPlanId} is not null`)]);
export const accessGrants = pgTable("access_grants", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").notNull().references(() => membershipPlans.id),
  kind: text("kind").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const operationAudit = pgTable("operation_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
