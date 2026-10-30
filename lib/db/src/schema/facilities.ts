import { pgTable, text, jsonb, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";
import { partners } from "./operations";
import type { LocalizedText } from "./learning";

export type FacilityHours = {
  day: number;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type FacilityProfileContent = {
  localizedName: LocalizedText;
  localizedDistrict: LocalizedText;
  localizedAddress: LocalizedText;
  localizedDescription: LocalizedText;
  activities: LocalizedText[];
  amenities: LocalizedText[];
  accessibility: LocalizedText[];
  openingHours: FacilityHours[];
  contactPhone: string | null;
  websiteUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const facilityProfiles = pgTable("facility_profiles", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  city: text("city").notNull(),
  facility: text("facility").notNull(),
  localizedName: jsonb("localized_name").$type<LocalizedText>().notNull(),
  localizedDistrict: jsonb("localized_district").$type<LocalizedText>().notNull(),
  localizedAddress: jsonb("localized_address").$type<LocalizedText>().notNull(),
  localizedDescription: jsonb("localized_description").$type<LocalizedText>().notNull(),
  activities: jsonb("activities").$type<LocalizedText[]>().notNull().default([]),
  amenities: jsonb("amenities").$type<LocalizedText[]>().notNull().default([]),
  accessibility: jsonb("accessibility").$type<LocalizedText[]>().notNull().default([]),
  openingHours: jsonb("opening_hours").$type<FacilityHours[]>().notNull(),
  contactPhone: text("contact_phone"),
  websiteUrl: text("website_url"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("facility_profile_partner_city_name").on(t.partnerId, t.city, t.facility)]);
