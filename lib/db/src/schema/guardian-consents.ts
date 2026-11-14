import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { attendance } from "./bookings";

export type GuardianConsentStatus = "pending" | "ready" | "expired";
export type GuardianConsentContentType = "image/jpeg" | "image/png" | "image/webp";

export const guardianConsentDocuments = pgTable("guardian_consent_documents", {
  id: text("id").primaryKey(),
  attendanceId: text("attendance_id").notNull().references(() => attendance.id, { onDelete: "restrict" }),
  memberUserId: text("member_user_id").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  objectPath: text("object_path"),
  stagingObjectPath: text("staging_object_path"),
  contentType: text("content_type").$type<GuardianConsentContentType>().notNull(),
  size: integer("size").notNull(),
  status: text("status").$type<GuardianConsentStatus>().notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  fileDeletedAt: timestamp("file_deleted_at", { withTimezone: true }),
}, t => [
  uniqueIndex("guardian_consent_attendance").on(t.attendanceId),
  index("guardian_consent_retention").on(t.status, t.expiresAt),
]);
