import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { corporateOrganizations } from "./corporate";

export type CorporateAgreementVersionStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "signed"
  | "superseded";

export const corporateAgreementVersions = pgTable("corporate_agreement_versions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull()
    .references(() => corporateOrganizations.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  replacesVersionId: text("replaces_version_id"),
  agreementText: text("agreement_text").notNull(),
  changeSummary: text("change_summary").notNull(),
  status: text("status").$type<CorporateAgreementVersionStatus>().notNull().default("draft"),
  reviewNote: text("review_note"),
  signedDocumentName: text("signed_document_name"),
  signedDocumentPath: text("signed_document_path"),
  signedContentType: text("signed_content_type"),
  signedFileSize: integer("signed_file_size"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  pendingUploadId: text("pending_upload_id"),
  pendingDocumentName: text("pending_document_name"),
  pendingUploadedBy: text("pending_uploaded_by"),
  createdBy: text("created_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("corporate_agreement_version_number_unique")
    .on(table.organizationId, table.versionNumber),
  uniqueIndex("corporate_agreement_signed_path_unique").on(table.signedDocumentPath),
  uniqueIndex("corporate_agreement_one_current").on(table.organizationId)
    .where(sql`${table.status} IN ('approved', 'signed')`),
  index("corporate_agreement_history").on(table.organizationId, table.versionNumber),
  index("corporate_agreement_review_queue").on(table.status, table.createdAt),
  foreignKey({
    columns: [table.replacesVersionId],
    foreignColumns: [table.id],
    name: "corporate_agreement_replaces_version_fk",
  }).onDelete("restrict"),
  check("corporate_agreement_version_number_positive", sql`${table.versionNumber} > 0`),
  check(
    "corporate_agreement_status_valid",
    sql`${table.status} IN ('draft', 'approved', 'rejected', 'signed', 'superseded')`,
  ),
  check(
    "corporate_agreement_signed_file_metadata",
    sql`(${table.signedDocumentPath} IS NULL AND ${table.signedDocumentName} IS NULL AND ${table.signedContentType} IS NULL AND ${table.signedFileSize} IS NULL AND ${table.signedAt} IS NULL)
      OR (${table.signedDocumentPath} IS NOT NULL AND ${table.signedDocumentName} IS NOT NULL AND ${table.signedContentType} = 'application/pdf' AND ${table.signedFileSize} > 0 AND ${table.signedAt} IS NOT NULL)`,
  ),
  check(
    "corporate_agreement_signed_status_has_document",
    sql`${table.status} <> 'signed' OR ${table.signedDocumentPath} IS NOT NULL`,
  ),
  check(
    "corporate_agreement_file_size_valid",
    sql`${table.signedFileSize} IS NULL OR (${table.signedFileSize} > 0 AND ${table.signedFileSize} <= 10485760)`,
  ),
]);

export type CorporateAgreementVersion = typeof corporateAgreementVersions.$inferSelect;
