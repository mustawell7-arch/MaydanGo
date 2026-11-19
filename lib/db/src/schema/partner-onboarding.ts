import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { partners } from "./operations";
import type { FacilityHygieneChecklist, FacilitySafetyChecklist } from "./quality-control";

export const partnerOnboardingStatuses = [
  "application_received",
  "under_review",
  "additional_documents_required",
  "commercial_negotiation",
  "contract_issued",
  "contract_signed",
  "facility_setup",
  "qr_code_issued",
  "staff_training_completed",
  "test_checkin_completed",
  "approved",
  "live",
  "rejected",
] as const;

export type PartnerOnboardingStatus = typeof partnerOnboardingStatuses[number];

export const partnerApplicationDocumentTypes = [
  "business_registration",
  "tax_document",
  "licence",
  "insurance",
  "facility_image",
  "supporting_document",
] as const;

export type PartnerApplicationDocumentType = typeof partnerApplicationDocumentTypes[number];
export type PartnerApplicationHours = {
  day: number;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export const partnerOnboardingApplications = pgTable("partner_onboarding_applications", {
  id: text("id").primaryKey(),
  applicantUserId: text("applicant_user_id").notNull(),
  applicantName: text("applicant_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  legalBusinessName: text("legal_business_name").notNull(),
  facilityName: text("facility_name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  district: text("district"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  businessRegistrationReference: text("business_registration_reference"),
  taxReference: text("tax_reference"),
  activityCategories: jsonb("activity_categories").$type<string[]>().notNull().default([]),
  openingHours: jsonb("opening_hours").$type<PartnerApplicationHours[]>().notNull().default([]),
  capacity: integer("capacity"),
  pricingDetails: text("pricing_details"),
  status: text("status").$type<PartnerOnboardingStatus>().notNull().default("application_received"),
  statusNote: text("status_note"),
  partnerId: text("partner_id").references(() => partners.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  index("partner_onboarding_applicant_created").on(table.applicantUserId, table.createdAt),
  index("partner_onboarding_status_created").on(table.status, table.createdAt),
  uniqueIndex("partner_onboarding_active_applicant").on(table.applicantUserId)
    .where(sql`${table.status} NOT IN ('live', 'rejected')`),
  check(
    "partner_onboarding_status_valid",
    sql`${table.status} IN ('application_received', 'under_review', 'additional_documents_required', 'commercial_negotiation', 'contract_issued', 'contract_signed', 'facility_setup', 'qr_code_issued', 'staff_training_completed', 'test_checkin_completed', 'approved', 'live', 'rejected')`,
  ),
  check("partner_onboarding_capacity_positive", sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
  check(
    "partner_onboarding_coordinates_pair",
    sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL)`,
  ),
  check("partner_onboarding_latitude_range", sql`${table.latitude} IS NULL OR (${table.latitude} >= -90 AND ${table.latitude} <= 90)`),
  check("partner_onboarding_longitude_range", sql`${table.longitude} IS NULL OR (${table.longitude} >= -180 AND ${table.longitude} <= 180)`),
]);

export const partnerOnboardingEvents = pgTable("partner_onboarding_events", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull()
    .references(() => partnerOnboardingApplications.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").$type<PartnerOnboardingStatus>().notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("partner_onboarding_events_application_created").on(table.applicationId, table.createdAt),
  check(
    "partner_onboarding_event_status_valid",
    sql`${table.toStatus} IN ('application_received', 'under_review', 'additional_documents_required', 'commercial_negotiation', 'contract_issued', 'contract_signed', 'facility_setup', 'qr_code_issued', 'staff_training_completed', 'test_checkin_completed', 'approved', 'live', 'rejected')`,
  ),
]);

export const partnerOnboardingDocuments = pgTable("partner_onboarding_documents", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull()
    .references(() => partnerOnboardingApplications.id, { onDelete: "restrict" }),
  documentType: text("document_type").$type<PartnerApplicationDocumentType>().notNull(),
  documentName: text("document_name").notNull(),
  documentPath: text("document_path").notNull(),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  expiresOn: date("expires_on", { mode: "string" }),
  status: text("status").notNull().default("upload_pending"),
  reviewNote: text("review_note"),
  uploadedBy: text("uploaded_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("partner_onboarding_document_path").on(table.documentPath),
  index("partner_onboarding_documents_application_created").on(table.applicationId, table.createdAt),
  check(
    "partner_onboarding_document_type_valid",
    sql`${table.documentType} IN ('business_registration', 'tax_document', 'licence', 'insurance', 'facility_image', 'supporting_document')`,
  ),
  check(
    "partner_onboarding_document_status_valid",
    sql`${table.status} IN ('upload_pending', 'submitted', 'approved', 'rejected')`,
  ),
  check(
    "partner_onboarding_document_file_size_valid",
    sql`${table.fileSize} IS NULL OR (${table.fileSize} > 0 AND ${table.fileSize} <= 10485760)`,
  ),
]);

export const partnerOnboardingInspections = pgTable("partner_onboarding_inspections", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull()
    .references(() => partnerOnboardingApplications.id, { onDelete: "restrict" }),
  inspectedOn: date("inspected_on", { mode: "string" }).notNull(),
  hygieneChecklist: jsonb("hygiene_checklist").$type<FacilityHygieneChecklist>().notNull(),
  safetyChecklist: jsonb("safety_checklist").$type<FacilitySafetyChecklist>().notNull(),
  status: text("status").notNull(),
  findings: text("findings").notNull(),
  correctiveAction: text("corrective_action"),
  correctiveDueOn: date("corrective_due_on", { mode: "string" }),
  inspectedBy: text("inspected_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("partner_onboarding_inspections_application_created").on(table.applicationId, table.createdAt),
  check("partner_onboarding_inspection_status_valid", sql`${table.status} IN ('approved', 'action_required')`),
  check(
    "partner_onboarding_inspection_action_plan_required",
    sql`${table.status} <> 'action_required' OR (
      length(btrim(${table.findings})) >= 4
      AND ${table.correctiveAction} IS NOT NULL
      AND length(btrim(${table.correctiveAction})) >= 4
      AND ${table.correctiveDueOn} IS NOT NULL
    )`,
  ),
]);
