BEGIN;

ALTER TABLE booking_offerings
  ADD COLUMN IF NOT EXISTS recurrence_group_id text,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS partner_response text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

-- Preserve supported lifecycle values from the older activity_status column.
-- Suspended offerings remain inactive and unpublished; their original status
-- stays in the legacy column for audit/reference rather than being discarded.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'booking_offerings'
      AND column_name = 'activity_status'
  ) THEN
    EXECUTE $migration$
      UPDATE booking_offerings
      SET approval_status = CASE activity_status::text
        WHEN 'draft' THEN 'draft'
        WHEN 'submitted' THEN 'submitted'
        WHEN 'under_review' THEN 'under_review'
        WHEN 'changes_requested' THEN 'changes_requested'
        WHEN 'approved' THEN 'approved'
        WHEN 'published' THEN 'published'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'archived' THEN 'archived'
        WHEN 'suspended' THEN 'draft'
        ELSE approval_status
      END
      WHERE approval_status = 'draft'
        AND activity_status IS NOT NULL
    $migration$;
  END IF;
END;
$$;

UPDATE booking_offerings
SET approval_status = 'published'
WHERE active = true AND approval_status = 'draft';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'booking_offerings'
      AND column_name = 'review_note'
  ) THEN
    EXECUTE $migration$
      UPDATE booking_offerings
      SET approval_reason = review_note
      WHERE approval_reason IS NULL AND review_note IS NOT NULL
    $migration$;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS offering_recurrence_group
  ON booking_offerings (recurrence_group_id, starts_at)
  WHERE recurrence_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offering_review_status
  ON booking_offerings (partner_id, approval_status, starts_at);

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_attempted_at timestamptz;

CREATE TABLE IF NOT EXISTS facility_hours_overrides (
  id text PRIMARY KEY,
  facility_id text NOT NULL REFERENCES facility_profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  closed boolean NOT NULL,
  opens_at text,
  closes_at text,
  localized_reason jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_hours_overrides_date_order CHECK (end_date >= start_date),
  CONSTRAINT facility_hours_overrides_time_shape CHECK (
    (closed = true AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
  )
);
CREATE INDEX IF NOT EXISTS facility_hours_overrides_dates
  ON facility_hours_overrides (facility_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS member_updates (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  event_key text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS member_updates_event_key_unique
  ON member_updates (event_key);
CREATE INDEX IF NOT EXISTS member_updates_owner_created_idx
  ON member_updates (user_id, created_at);

CREATE TABLE IF NOT EXISTS member_devices (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  token_hash text NOT NULL,
  platform text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS member_devices_token_hash_unique
  ON member_devices (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS member_devices_primary_user_unique
  ON member_devices (user_id) WHERE status = 'primary';
CREATE UNIQUE INDEX IF NOT EXISTS member_devices_pending_user_unique
  ON member_devices (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS member_devices_user_status_idx
  ON member_devices (user_id, status);

CREATE TABLE IF NOT EXISTS member_device_changes (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  old_device_id text NOT NULL REFERENCES member_devices(id),
  new_device_id text NOT NULL REFERENCES member_devices(id),
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  activate_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason text,
  risk_flag boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS member_device_changes_pending_user_unique
  ON member_device_changes (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS member_device_changes_queue_idx
  ON member_device_changes (status, requested_at);
CREATE INDEX IF NOT EXISTS member_device_changes_user_requested_idx
  ON member_device_changes (user_id, requested_at);

CREATE TABLE IF NOT EXISTS member_device_events (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  change_id text REFERENCES member_device_changes(id),
  device_id text REFERENCES member_devices(id),
  actor_id text,
  kind text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_device_events_user_created_idx
  ON member_device_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS member_device_events_kind_created_idx
  ON member_device_events (kind, created_at);

COMMIT;
