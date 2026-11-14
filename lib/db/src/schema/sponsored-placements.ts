import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { facilityProfiles } from "./facilities";
import { partners } from "./operations";

export const sponsoredFacilityCampaigns = pgTable("sponsored_facility_campaigns", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilityProfiles.id, { onDelete: "restrict" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "restrict" }),
  campaignName: text("campaign_name").notNull(),
  placementTypes: text("placement_types").array().notNull(),
  targetCity: text("target_city"),
  targetActivity: text("target_activity"),
  targetMembershipTiers: text("target_membership_tiers").array().notNull().default(sql`'{}'::text[]`),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("sponsored_facility_campaign_status_dates").on(table.status, table.startsAt, table.endsAt),
  index("sponsored_facility_campaign_partner").on(table.partnerId),
  check("sponsored_facility_campaign_status_valid", sql`${table.status} IN ('draft', 'active', 'paused')`),
  check("sponsored_facility_campaign_dates_valid", sql`${table.endsAt} > ${table.startsAt}`),
]);

export const sponsoredPlacementEvents = pgTable("sponsored_placement_events", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => sponsoredFacilityCampaigns.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  placementType: text("placement_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("sponsored_placement_event_campaign_type").on(table.campaignId, table.eventType),
  index("sponsored_placement_event_created").on(table.createdAt),
  check("sponsored_placement_event_type_valid", sql`${table.eventType} IN ('impression', 'click')`),
]);

export type SponsoredFacilityCampaign = typeof sponsoredFacilityCampaigns.$inferSelect;
export type SponsoredPlacementEvent = typeof sponsoredPlacementEvents.$inferSelect;
