import { pgTable, text, timestamp, uniqueIndex, index, jsonb, integer } from "drizzle-orm/pg-core";
import { learningCourses } from "./learning";
import { offerings } from "./bookings";

export const instructorPortalRequests = pgTable("instructor_portal_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"),
  decisionReason: text("decision_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
}, table => [
  uniqueIndex("instructor_portal_request_user").on(table.userId),
  index("instructor_portal_request_queue").on(table.status, table.submittedAt),
]);

export const instructorCourseAssignments = pgTable("instructor_course_assignments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: text("course_id").notNull().references(() => learningCourses.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("instructor_course_assignment_unique").on(table.userId, table.courseId),
  index("instructor_course_assignment_user").on(table.userId),
]);

export const instructorOfferingAssignments = pgTable("instructor_offering_assignments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("instructor_offering_assignment_unique").on(table.userId, table.offeringId),
  index("instructor_offering_assignment_user").on(table.userId),
]);

export const instructorContentDrafts = pgTable("instructor_content_drafts", {
  id: text("id").primaryKey(),
  instructorUserId: text("instructor_user_id").notNull(),
  contentType: text("content_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("draft"),
  decisionReason: text("decision_reason"),
  publishedCourseId: text("published_course_id").references(() => learningCourses.id, { onDelete: "set null" }),
  publishedOfferingId: text("published_offering_id").references(() => offerings.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("instructor_content_draft_owner").on(table.instructorUserId, table.updatedAt),
  index("instructor_content_draft_review_queue").on(table.status, table.submittedAt),
]);

export const instructorDraftUploads = pgTable("instructor_draft_uploads", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull().references(() => instructorContentDrafts.id, { onDelete: "cascade" }),
  instructorUserId: text("instructor_user_id").notNull(),
  purpose: text("purpose").notNull(),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("instructor_draft_upload_owner").on(table.instructorUserId, table.draftId),
]);

export const instructorProfiles = pgTable("instructor_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceDraftId: text("source_draft_id").notNull().unique()
    .references(() => instructorContentDrafts.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  biography: text("biography").notNull(),
  qualifications: jsonb("qualifications").$type<string[]>().notNull().default([]),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  specialties: jsonb("specialties").$type<string[]>().notNull().default([]),
  photoPath: text("photo_path"),
  approvedBy: text("approved_by").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("instructor_profile_owner").on(table.userId),
  index("instructor_profile_approved").on(table.approvedAt),
]);
