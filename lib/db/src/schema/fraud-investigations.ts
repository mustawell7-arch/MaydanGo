import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { facilityCheckinQrActivity } from "./checkin";

export type FraudInvestigationStatus =
  | "open"
  | "under_review"
  | "resolved_no_action"
  | "action_taken";

export const fraudInvestigations = pgTable("fraud_investigations", {
  id: text("id").primaryKey(),
  sourceActivityId: text("source_activity_id").notNull()
    .references(() => facilityCheckinQrActivity.id, { onDelete: "restrict" }),
  status: text("status").$type<FraudInvestigationStatus>().notNull().default("open"),
  openedBy: text("opened_by").notNull(),
  resolutionReason: text("resolution_reason"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("fraud_investigation_source_unique").on(table.sourceActivityId),
  index("fraud_investigation_status_date_idx").on(table.status, table.createdAt),
  check(
    "fraud_investigation_status_valid",
    sql`${table.status} IN ('open', 'under_review', 'resolved_no_action', 'action_taken')`,
  ),
  check(
    "fraud_investigation_resolution_consistent",
    sql`(${table.status} IN ('open', 'under_review') AND ${table.resolutionReason} IS NULL AND ${table.resolvedBy} IS NULL) OR (${table.status} IN ('resolved_no_action', 'action_taken') AND ${table.resolutionReason} IS NOT NULL AND ${table.resolvedBy} IS NOT NULL)`,
  ),
]);

export type FraudInvestigation = typeof fraudInvestigations.$inferSelect;
