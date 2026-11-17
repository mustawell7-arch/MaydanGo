import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { partners } from "./operations";

export const sponsoredContentCampaigns = pgTable("sponsored_content_campaigns", {
  id: text("id").primaryKey(),
  campaignName: text("campaign_name").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  targetName: text("target_name").notNull(),
  partnerId: text("partner_id").references(() => partners.id, { onDelete: "restrict" }),
  city: text("city"),
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
  index("sponsored_content_campaign_status_dates").on(table.status, table.startsAt, table.endsAt),
  index("sponsored_content_campaign_target").on(table.targetType, table.targetId),
  check("sponsored_content_campaign_target_type_valid", sql`${table.targetType} IN ('event', 'course')`),
  check("sponsored_content_campaign_status_valid", sql`${table.status} IN ('draft', 'active', 'paused')`),
  check("sponsored_content_campaign_dates_valid", sql`${table.endsAt} > ${table.startsAt}`),
  check("sponsored_content_campaign_placements_valid",
    sql`array_length(${table.placementTypes}, 1) > 0 AND ${table.placementTypes} <@ ARRAY['featured_event', 'featured_course', 'home_promotion', 'category_featured']::text[]`),
  check("sponsored_content_campaign_tiers_valid",
    sql`${table.targetMembershipTiers} <@ ARRAY['M', 'L', 'XL']::text[]`),
]);

export const sponsoredContentPlacementEvents = pgTable("sponsored_content_placement_events", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => sponsoredContentCampaigns.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  placementType: text("placement_type").notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("sponsored_content_placement_event_campaign_type").on(table.campaignId, table.eventType),
  index("sponsored_content_placement_event_created").on(table.createdAt),
  uniqueIndex("sponsored_content_conversion_once").on(table.campaignId, table.eventType, table.referenceId)
    .where(sql`${table.eventType} = 'conversion' AND ${table.referenceId} IS NOT NULL`),
  check("sponsored_content_placement_event_type_valid", sql`${table.eventType} IN ('impression', 'click', 'conversion')`),
  check("sponsored_content_placement_type_valid",
    sql`${table.placementType} IN ('featured_event', 'featured_course', 'home_promotion', 'category_featured')`),
]);

export type SponsoredContentCampaign = typeof sponsoredContentCampaigns.$inferSelect;
export type SponsoredContentPlacementEvent = typeof sponsoredContentPlacementEvents.$inferSelect;
