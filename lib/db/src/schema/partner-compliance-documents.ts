import { date, index, integer, pgTable, text, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { facilityProfiles } from "./facilities";
import { partners } from "./operations";

export type PartnerComplianceDocumentType = "licence" | "insurance" | "supporting_document";
export type PartnerComplianceDocumentStatus = "upload_pending" | "submitted" | "approved" | "rejected";

export const partnerComplianceDocuments = pgTable("partner_compliance_documents", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  documentType: text("document_type").$type<PartnerComplianceDocumentType>().notNull(),
  documentName: text("document_name").notNull(),
  documentPath: text("document_path").notNull(),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  expiresOn: date("expires_on", { mode: "string" }),
  status: text("status").$type<PartnerComplianceDocumentStatus>().notNull().default("upload_pending"),
  reviewNote: text("review_note"),
  uploadedBy: text("uploaded_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("partner_compliance_document_path").on(table.documentPath),
  index("partner_compliance_partner_facility_created").on(table.partnerId, table.facilityId, table.createdAt),
  index("partner_compliance_expiry").on(table.documentType, table.status, table.expiresOn),
  check("partner_compliance_document_type_valid", sql`${table.documentType} IN ('licence', 'insurance', 'supporting_document')`),
  check("partner_compliance_document_status_valid", sql`${table.status} IN ('upload_pending', 'submitted', 'approved', 'rejected')`),
  check("partner_compliance_document_file_size_valid", sql`${table.fileSize} IS NULL OR (${table.fileSize} > 0 AND ${table.fileSize} <= 10485760)`),
]);

export type PartnerComplianceDocument = typeof partnerComplianceDocuments.$inferSelect;
