import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberReferralCodes = pgTable("member_referral_codes", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("member_referral_codes_owner_unique").on(table.ownerUserId),
  uniqueIndex("member_referral_codes_code_unique").on(table.code),
  check("member_referral_codes_code_format", sql`${table.code} ~ '^[A-HJ-NP-Z2-9]{10}$'`),
]);

export const memberReferralAttributions = pgTable("member_referral_attributions", {
  id: text("id").primaryKey(),
  codeId: text("code_id").notNull().references(() => memberReferralCodes.id, { onDelete: "restrict" }),
  referrerUserId: text("referrer_user_id").notNull(),
  referredUserId: text("referred_user_id").notNull(),
  attributedAt: timestamp("attributed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("member_referral_attributions_referred_unique").on(table.referredUserId),
  index("member_referral_attributions_referrer_date").on(table.referrerUserId, table.attributedAt),
  check("member_referral_attributions_not_self", sql`${table.referrerUserId} <> ${table.referredUserId}`),
]);

export const insertMemberReferralCodeSchema = createInsertSchema(memberReferralCodes)
  .omit({ id: true, createdAt: true });
export type InsertMemberReferralCode = z.infer<typeof insertMemberReferralCodeSchema>;
export type MemberReferralCode = typeof memberReferralCodes.$inferSelect;
export type MemberReferralAttribution = typeof memberReferralAttributions.$inferSelect;
