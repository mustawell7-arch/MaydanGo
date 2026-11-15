import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const LEGAL_POLICY_KEYS = [
  "terms_of_use",
  "privacy_policy",
  "booking_policy",
  "cancellation_policy",
  "refund_policy",
] as const;
export type LegalPolicyKey = typeof LEGAL_POLICY_KEYS[number];
export type LegalPolicyVersionStatus = "draft" | "published";
export type LegalPolicyLocale = "en" | "ar" | "ku";
export type LegalPolicyTranslation = {
  title: string;
  introduction: string;
  body: string;
};
export type LegalPolicyTranslations = Record<LegalPolicyLocale, LegalPolicyTranslation>;

export const legalPolicyVersions = pgTable("legal_policy_versions", {
  id: text("id").primaryKey(),
  policyKey: text("policy_key").$type<LegalPolicyKey>().notNull(),
  version: text("version").notNull(),
  status: text("status").$type<LegalPolicyVersionStatus>().notNull().default("draft"),
  translations: jsonb("translations").$type<LegalPolicyTranslations>().notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: text("published_by"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("legal_policy_key_version_unique").on(table.policyKey, table.version),
  index("legal_policy_current_lookup").on(table.policyKey, table.status, table.effectiveAt),
  check("legal_policy_key_check", sql`policy_key IN ('terms_of_use', 'privacy_policy', 'booking_policy', 'cancellation_policy', 'refund_policy')`),
  check("legal_policy_status_check", sql`status IN ('draft', 'published')`),
]);

