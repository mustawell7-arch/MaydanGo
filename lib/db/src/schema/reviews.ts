import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { attendance, reservations } from "./bookings";
import { facilityProfiles } from "./facilities";
import { partners } from "./operations";

export type ReviewCategoryRatings = {
  cleanliness: number | null;
  staff: number | null;
  equipment: number | null;
  instructor: number | null;
  facilities: number | null;
  informationAccuracy: number | null;
};

export const facilityReviews = pgTable("facility_reviews", {
  id: text("id").primaryKey(),
  attendanceId: text("attendance_id").notNull().references(() => attendance.id, { onDelete: "restrict" }),
  reservationId: text("reservation_id").notNull().references(() => reservations.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  reviewerUserId: text("reviewer_user_id").notNull(),
  overallRating: integer("overall_rating").notNull(),
  categoryRatings: jsonb("category_ratings").$type<ReviewCategoryRatings>().notNull(),
  content: text("content"),
  status: text("status").notNull().default("published"),
  moderationReason: text("moderation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("facility_review_attendance_unique").on(t.attendanceId),
  uniqueIndex("facility_review_reservation_unique").on(t.reservationId),
  index("facility_review_facility_status_created").on(t.facilityId, t.status, t.createdAt),
  index("facility_review_partner_status_created").on(t.partnerId, t.status, t.createdAt),
  index("facility_review_reviewer_created").on(t.reviewerUserId, t.createdAt),
  check("facility_review_rating_range", sql`${t.overallRating} between 1 and 5`),
  check("facility_review_status_valid", sql`${t.status} in ('published', 'hidden', 'removed')`),
]);

export const facilityReviewReports = pgTable("facility_review_reports", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => facilityReviews.id, { onDelete: "restrict" }),
  reporterUserId: text("reporter_user_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("facility_review_reporter_unique").on(t.reviewId, t.reporterUserId),
  index("facility_review_reports_status_created").on(t.status, t.createdAt),
  check("facility_review_report_reason_valid", sql`${t.reason} in ('abusive', 'personal_information', 'misleading', 'other')`),
  check("facility_review_report_status_valid", sql`${t.status} in ('open', 'reviewed')`),
]);

export const facilityReviewResponses = pgTable("facility_review_responses", {
  reviewId: text("review_id").primaryKey().references(() => facilityReviews.id, { onDelete: "restrict" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  response: text("response").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const facilityReviewPrivileges = pgTable("facility_review_privileges", {
  userId: text("user_id").primaryKey(),
  reason: text("reason").notNull(),
  suspendedBy: text("suspended_by").notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
