CREATE TABLE IF NOT EXISTS sponsored_content_campaigns (
  id text PRIMARY KEY,
  campaign_name text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_name text NOT NULL,
  partner_id text REFERENCES partners(id) ON DELETE RESTRICT,
  city text,
  placement_types text[] NOT NULL,
  target_city text,
  target_activity text,
  target_membership_tiers text[] NOT NULL DEFAULT '{}'::text[],
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_content_campaign_target_type_valid CHECK (target_type IN ('event', 'course')),
  CONSTRAINT sponsored_content_campaign_status_valid CHECK (status IN ('draft', 'active', 'paused')),
  CONSTRAINT sponsored_content_campaign_dates_valid CHECK (ends_at > starts_at),
  CONSTRAINT sponsored_content_campaign_placements_valid CHECK (
    array_length(placement_types, 1) > 0 AND
    placement_types <@ ARRAY['featured_event', 'featured_course', 'home_promotion', 'category_featured']::text[]
  ),
  CONSTRAINT sponsored_content_campaign_tiers_valid CHECK (
    target_membership_tiers <@ ARRAY['M', 'L', 'XL']::text[]
  )
);
CREATE INDEX IF NOT EXISTS sponsored_content_campaign_status_dates
  ON sponsored_content_campaigns (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS sponsored_content_campaign_target
  ON sponsored_content_campaigns (target_type, target_id);

CREATE TABLE IF NOT EXISTS sponsored_content_placement_events (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES sponsored_content_campaigns(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  placement_type text NOT NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_content_placement_event_type_valid CHECK (event_type IN ('impression', 'click', 'conversion')),
  CONSTRAINT sponsored_content_placement_type_valid CHECK (
    placement_type IN ('featured_event', 'featured_course', 'home_promotion', 'category_featured')
  )
);
CREATE INDEX IF NOT EXISTS sponsored_content_placement_event_campaign_type
  ON sponsored_content_placement_events (campaign_id, event_type);
CREATE INDEX IF NOT EXISTS sponsored_content_placement_event_created
  ON sponsored_content_placement_events (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS sponsored_content_conversion_once
  ON sponsored_content_placement_events (campaign_id, event_type, reference_id)
  WHERE event_type = 'conversion' AND reference_id IS NOT NULL;
