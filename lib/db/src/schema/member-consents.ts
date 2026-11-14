import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type MemberConsentPurpose = "terms_of_use" | "privacy_policy" | "marketing";
export type MemberConsentChoice = "accepted" | "declined";

export const memberConsentEvents = pgTable("member_consent_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  purpose: text("purpose").$type<MemberConsentPurpose>().notNull(),
  policyVersion: text("policy_version").notNull(),
  choice: text("choice").$type<MemberConsentChoice>().notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("member_consent_owner_history").on(table.userId, table.recordedAt),
  index("member_consent_purpose_history").on(table.userId, table.purpose, table.recordedAt),
]);

export const insertMemberConsentEventSchema = createInsertSchema(memberConsentEvents)
  .omit({ id: true, recordedAt: true });
export type InsertMemberConsentEvent = z.infer<typeof insertMemberConsentEventSchema>;
export type MemberConsentEvent = typeof memberConsentEvents.$inferSelect;
