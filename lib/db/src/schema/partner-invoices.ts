import { date, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { partners } from "./operations";

export const partnerInvoiceSubmissions = pgTable("partner_invoice_submissions", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  invoiceNumber: text("invoice_number").notNull(),
  amountIqd: integer("amount_iqd").notNull(),
  issuedAt: date("issued_at", { mode: "string" }).notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  taxNumber: text("tax_number"),
  documentPath: text("document_path").notNull(),
  documentName: text("document_name").notNull(),
  status: text("status").notNull().default("submitted"),
  submittedBy: text("submitted_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("partner_invoice_partner_number").on(t.partnerId, t.invoiceNumber),
  uniqueIndex("partner_invoice_document_path").on(t.documentPath),
]);
