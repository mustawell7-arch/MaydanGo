import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { partners } from "./operations";

export type PartnerContractVersionStatus =
  | "upload_pending"
  | "submitted"
  | "approved"
  | "rejected"
  | "superseded";

export const partnerContractVersions = pgTable("partner_contract_versions", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  replacesVersionId: text("replaces_version_id"),
  documentName: text("document_name").notNull(),
  documentPath: text("document_path").notNull(),
  changeSummary: text("change_summary").notNull(),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  status: text("status").$type<PartnerContractVersionStatus>().notNull().default("upload_pending"),
  reviewNote: text("review_note"),
  uploadedBy: text("uploaded_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("partner_contract_version_number_unique").on(table.partnerId, table.versionNumber),
  uniqueIndex("partner_contract_document_path_unique").on(table.documentPath),
  uniqueIndex("partner_contract_one_current_version").on(table.partnerId).where(sql`${table.status} = 'approved'`),
  index("partner_contract_partner_history").on(table.partnerId, table.versionNumber),
  index("partner_contract_review_queue").on(table.status, table.createdAt),
  foreignKey({
    columns: [table.replacesVersionId],
    foreignColumns: [table.id],
    name: "partner_contract_replaces_version_fk",
  }).onDelete("restrict"),
  check("partner_contract_version_number_positive", sql`${table.versionNumber} > 0`),
  check("partner_contract_status_valid", sql`${table.status} IN ('upload_pending', 'submitted', 'approved', 'rejected', 'superseded')`),
  check("partner_contract_file_size_valid", sql`${table.fileSize} IS NULL OR (${table.fileSize} > 0 AND ${table.fileSize} <= 10485760)`),
]);

export type PartnerContractVersion = typeof partnerContractVersions.$inferSelect;
