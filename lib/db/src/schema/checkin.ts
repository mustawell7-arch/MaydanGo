import { pgTable, text, timestamp, integer, doublePrecision, jsonb, boolean, index, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { offerings, reservations } from "./bookings";
import { facilityProfiles } from "./facilities";
import type { LocalizedText } from "./learning";

export const checkinPolicies = pgTable("checkin_policies", {
  offeringId: text("offering_id").primaryKey().references(() => offerings.id),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radius: integer("radius").notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  correctionEndsAt: timestamp("correction_ends_at", { withTimezone: true }).notNull(),
});
// Only a SHA-256 digest is stored. Each challenge belongs to one reservation.
export const checkinChallenges = pgTable("checkin_challenges", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  digest: text("digest").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
export const manualCheckinChallenges = pgTable("manual_checkin_challenges", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  digest: text("digest").notNull().unique(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
export const attendanceEvents = pgTable("attendance_events", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  before: text("before").notNull(),
  after: text("after").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// Attendance events are append-only audit records. Application flows must
// create a new event for every change and never update or delete an existing one.

export const facilityCheckinPoints = pgTable("facility_checkin_points", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  label: jsonb("label").$type<LocalizedText>().notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radius: integer("radius").notNull(),
  mode: text("mode").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
}, t => [
  index("facility_checkin_points_facility_active").on(t.facilityId, t.active),
  check("facility_checkin_point_latitude_range", sql`${t.latitude} BETWEEN -90 AND 90`),
  check("facility_checkin_point_longitude_range", sql`${t.longitude} BETWEEN -180 AND 180`),
  check("facility_checkin_point_radius_range", sql`${t.radius} BETWEEN 25 AND 800`),
  check("facility_checkin_point_mode", sql`${t.mode} IN ('static', 'dynamic', 'rotating')`),
]);

// QR secrets are never returned by list APIs or stored in plaintext. Static
// codes remain active until replaced; dynamic and rotating codes expire.
export const facilityCheckinQrCodes = pgTable("facility_checkin_qr_codes", {
  id: text("id").primaryKey(),
  pointId: text("point_id").notNull().references(() => facilityCheckinPoints.id, { onDelete: "restrict" }),
  digest: text("digest").notNull(),
  mode: text("mode").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("facility_checkin_qr_digest_unique").on(t.digest),
  index("facility_checkin_qr_point_active").on(t.pointId, t.revokedAt, t.expiresAt),
  check("facility_checkin_qr_mode", sql`${t.mode} IN ('static', 'dynamic', 'rotating')`),
]);

export const facilityCheckinQrActivity = pgTable("facility_checkin_qr_activity", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  pointId: text("point_id").references(() => facilityCheckinPoints.id, { onDelete: "restrict" }),
  qrCodeId: text("qr_code_id").references(() => facilityCheckinQrCodes.id, { onDelete: "restrict" }),
  reservationId: text("reservation_id").references(() => reservations.id, { onDelete: "restrict" }),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  riskFlag: boolean("risk_flag").notNull().default(false),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("facility_checkin_qr_activity_facility_created").on(t.facilityId, t.createdAt),
  index("facility_checkin_qr_activity_code_created").on(t.qrCodeId, t.createdAt),
]);
