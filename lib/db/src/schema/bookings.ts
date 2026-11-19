import { pgTable, text, timestamp, integer, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { LocalizedText } from "./learning";
import { membershipBilling } from "./payments";

export type AccessRules = {
  cities?: string[]; facilities?: string[]; categories?: string[];
  quota: number; dailyLimit: number;
  quotaMode?: "shared" | "separate";
  physicalQuota?: number; premiumQuota?: number; liveQuota?: number;
  partnerGroupLimits?: Record<string, number>;
  trialAllowedTypes?: string[];
  corporateId?: string;
  facilityLimits?: Record<string, number>;
  categoryLimits?: Record<string, number>;
  planTerms?: {
    description: LocalizedText;
    trialPeriodDays: number;
    minimumContractMonths: number;
    renewalPeriodDays: number;
    cancellationPeriodDays: number;
    automaticRenewal: boolean;
    pauseAllowanceDays: number;
    priceProtectionMonths: number;
    promotionalPriceIqd: number | null;
    corporatePriceIqd: number | null;
    digitalContentAccess: boolean;
    guestPasses: number;
    eventAccess: boolean;
    additionalPaymentAllowed: boolean;
  };
};
export type OfferingApprovalStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "suspended"
  | "rejected"
  | "archived";
export type BookingModel =
  | "booking_required"
  | "booking_request"
  | "open_access"
  | "resource_booking"
  | "event"
  | "live_class";
export type SessionType = "unspecified" | "women_only" | "men_only" | "mixed" | "family" | "children" | "private";
export type InstructorGender = "female" | "male" | "unspecified";
export type ReservationStatus =
  | "requested"
  | "reserved"
  | "confirmed"
  | "cancelled"
  | "partner_cancelled"
  | "admin_cancelled"
  | "rejected";
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ["reserved", "requested", "confirmed"];
export const BOOKED_RESERVATION_STATUSES: ReservationStatus[] = ["reserved", "confirmed"];
export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  gender: text("gender").notNull(),
  birthDate: text("birth_date").notNull(),
});
export const memberships = pgTable("memberships", {
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),
  status: text("status").notNull(),
  paymentStatus: text("payment_status").notNull(),
  tier: text("tier").notNull(),
  source: text("source").notNull().default("legacy"),
  billingId: text("billing_id").references(() => membershipBilling.id),
  corporateId: text("corporate_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  rules: jsonb("rules").$type<AccessRules>().notNull(),
}, t => [
  uniqueIndex("membership_owner_scope").on(t.userId, t.scope),
  uniqueIndex("membership_billing_owner").on(t.billingId).where(sql`${t.billingId} is not null`),
]);

export const offerings = pgTable("booking_offerings", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  targetId: text("target_id").notNull(),
  slot: text("slot").notNull().default(""),
  title: text("title").notNull(),
  localizedTitle: jsonb("localized_title").$type<LocalizedText>(),
  localizedDescription: jsonb("localized_description").$type<LocalizedText>(),
  sessionType: text("session_type").$type<SessionType>().notNull().default("unspecified"),
  instructorGender: text("instructor_gender").$type<InstructorGender>(),
  familyRequirements: jsonb("family_requirements").$type<LocalizedText | null>(),
  healthSafetyInstructions: jsonb("health_safety_instructions").$type<LocalizedText | null>(),
  accessibilityInformation: jsonb("accessibility_information").$type<LocalizedText | null>(),
  resourceName: jsonb("resource_name").$type<LocalizedText | null>(),
  instructions: text("instructions"),
  imagePath: text("image_path"),
  bookingCutoffMinutes: integer("booking_cutoff_minutes").notNull().default(0),
  localizedInstructor: jsonb("localized_instructor").$type<LocalizedText | null>(),
  difficultyLevel: text("difficulty_level"),
  environment: text("environment"),
  instructionLanguage: text("instruction_language"),
  requiredEquipment: jsonb("required_equipment").$type<LocalizedText | null>(),
  joinUrl: text("join_url"),
  scope: text("scope").notNull(),
  partnerId: text("partner_id"),
  partnerGroup: text("partner_group"),
  recurrenceGroupId: text("recurrence_group_id"),
  activityStatus: text("activity_status").$type<OfferingApprovalStatus>().notNull().default("draft"),
  reviewNote: text("review_note"),
  approvalStatus: text("approval_status").$type<OfferingApprovalStatus>().notNull().default("draft"),
  approvalReason: text("approval_reason"),
  partnerResponse: text("partner_response"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  accessType: text("access_type").notNull().default("physical"),
  bookingModel: text("booking_model").$type<BookingModel>().notNull().default("booking_required"),
  active: boolean("active").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  city: text("city").notNull(),
  facility: text("facility").notNull(),
  category: text("category").notNull(),
  tiers: jsonb("tiers").$type<string[]>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  cancellationDeadline: timestamp("cancellation_deadline", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
  waitlistOfferMinutes: integer("waitlist_offer_minutes").notNull().default(30),
  additionalPayment: boolean("additional_payment").notNull().default(false),
  gender: text("gender").notNull().default("all"),
  minAge: integer("min_age").notNull().default(0),
  maxAge: integer("max_age"),
}, t => [
  uniqueIndex("offering_target_slot").on(t.kind, t.targetId, t.slot),
  index("offering_recurrence_group").on(t.recurrenceGroupId, t.startsAt)
    .where(sql`${t.recurrenceGroupId} is not null`),
  index("offering_review_status").on(t.partnerId, t.approvalStatus, t.startsAt),
  index("offering_resource_booking_lookup").on(t.scope, t.partnerId, t.city, t.facility, t.bookingModel, t.startsAt),
]);

export const reservations = pgTable("reservations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  status: text("status").$type<ReservationStatus>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, t => [
  uniqueIndex("one_active_reservation_including_confirmed").on(t.userId, t.offeringId)
    .where(sql`${t.status} in ('reserved', 'requested', 'confirmed')`),
  index("reservation_active_offering_including_confirmed").on(t.offeringId)
    .where(sql`${t.status} in ('reserved', 'requested', 'confirmed')`),
]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  queuePosition: integer("queue_position").notNull(),
  status: text("status").notNull().default("waiting"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
  reminderAt: timestamp("reminder_at", { withTimezone: true }),
  reminderAttemptedAt: timestamp("reminder_attempted_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, t => [
  uniqueIndex("waitlist_position_per_offering").on(t.offeringId, t.queuePosition),
  uniqueIndex("one_active_waitlist_entry").on(t.userId, t.offeringId)
    .where(sql`${t.status} in ('waiting', 'offered')`),
]);

export const waitlistLegacyHistory = pgTable("waitlist_legacy_history", {
  waitlistEntryId: text("waitlist_entry_id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull(),
  reservationId: text("reservation_id"),
  reason: text("reason"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
});

// Attendance is intentionally separate. Customer booking endpoints never insert here.
export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  offeringId: text("offering_id").notNull().references(() => offerings.id),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull(),
  verifiedBy: text("verified_by").notNull(),
  reservationId: text("reservation_id").references(() => reservations.id),
  status: text("status").notNull().default("pending"),
  settlementEligible: boolean("settlement_eligible").notNull().default(false),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
}, t => [
  uniqueIndex("attendance_reservation").on(t.reservationId),
  uniqueIndex("one_verified_visit_per_offering").on(t.userId, t.offeringId)
    .where(sql`${t.reservationId} is not null and ${t.status} in ('pending', 'confirmed', 'disputed')`),
]);
