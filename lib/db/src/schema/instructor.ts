import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
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
