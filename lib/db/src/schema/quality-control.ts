import { index, jsonb, pgTable, text, date, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { facilityProfiles } from "./facilities";
import { partners } from "./operations";

export type QualityCheckStatus = "pass" | "action_required" | "not_applicable";
export type FacilityInspectionType = "routine" | "mystery";
export type FacilityHygieneChecklist = {
  cleanliness: QualityCheckStatus;
  changingAreas: QualityCheckStatus;
  showers: QualityCheckStatus;
  waterSanitation: QualityCheckStatus;
};
export type FacilitySafetyChecklist = {
  emergencyExits: QualityCheckStatus;
  firstAid: QualityCheckStatus;
  equipmentCondition: QualityCheckStatus;
  incidentPlan: QualityCheckStatus;
};

export const facilityQualityAssessments = pgTable("facility_quality_assessments", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  inspectionType: text("inspection_type").$type<FacilityInspectionType>().notNull().default("routine"),
  reviewedOn: date("reviewed_on", { mode: "string" }).notNull(),
  nextReviewOn: date("next_review_on", { mode: "string" }),
  licenceExpiresOn: date("licence_expires_on", { mode: "string" }),
  insuranceExpiresOn: date("insurance_expires_on", { mode: "string" }),
  hygieneChecklist: jsonb("hygiene_checklist").$type<FacilityHygieneChecklist>().notNull(),
  safetyChecklist: jsonb("safety_checklist").$type<FacilitySafetyChecklist>().notNull(),
  status: text("status").notNull().default("action_required"),
  findings: text("findings").notNull(),
  correctiveAction: text("corrective_action"),
  correctiveDueOn: date("corrective_due_on", { mode: "string" }),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("facility_quality_assessment_facility_date").on(table.facilityId, table.reviewedOn),
  index("facility_quality_assessment_partner_date").on(table.partnerId, table.reviewedOn),
  index("facility_quality_assessment_status_due").on(table.status, table.correctiveDueOn),
  check("facility_quality_assessment_status_valid", sql`${table.status} IN ('approved', 'action_required', 'suspended')`),
  check("facility_quality_assessment_inspection_type_valid", sql`${table.inspectionType} IN ('routine', 'mystery')`),
]);

export const facilityQualityIncidents = pgTable("facility_quality_incidents", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  incidentType: text("incident_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  reportedBy: text("reported_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("facility_quality_incident_facility_date").on(table.facilityId, table.occurredAt),
  index("facility_quality_incident_partner_date").on(table.partnerId, table.occurredAt),
  index("facility_quality_incident_status_date").on(table.status, table.createdAt),
  check("facility_quality_incident_type_valid", sql`${table.incidentType} IN ('safety', 'hygiene', 'equipment', 'facility', 'other')`),
  check("facility_quality_incident_status_valid", sql`${table.status} IN ('open', 'under_review', 'resolved')`),
]);

export const facilityQualityEmergencyContacts = pgTable("facility_quality_emergency_contacts", {
  facilityId: text("facility_id").primaryKey().references(() => facilityProfiles.id, { onDelete: "cascade" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  contactName: text("contact_name").notNull(),
  contactRole: text("contact_role").notNull(),
  contactPhone: text("contact_phone").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("facility_quality_emergency_contact_partner").on(table.partnerId),
]);

export type FacilityQualityAssessment = typeof facilityQualityAssessments.$inferSelect;
export type FacilityQualityIncident = typeof facilityQualityIncidents.$inferSelect;
export type FacilityQualityEmergencyContact = typeof facilityQualityEmergencyContacts.$inferSelect;
