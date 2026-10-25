import { pgTable, text, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { offerings, reservations } from "./bookings";

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
