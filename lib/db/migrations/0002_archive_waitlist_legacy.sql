-- Preserve all legacy waitlist metadata before removing its compatibility columns.
LOCK TABLE waitlist_entries IN ACCESS EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS waitlist_legacy_history (
  waitlist_entry_id text PRIMARY KEY,
  user_id text NOT NULL,
  offering_id text NOT NULL,
  reservation_id text,
  reason text,
  joined_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO waitlist_legacy_history (
  waitlist_entry_id, user_id, offering_id, reservation_id, reason, joined_at, updated_at
)
SELECT id, user_id, offering_id, reservation_id, reason, joined_at, updated_at
FROM waitlist_entries
ON CONFLICT (waitlist_entry_id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  offering_id = EXCLUDED.offering_id,
  reservation_id = EXCLUDED.reservation_id,
  reason = EXCLUDED.reason,
  joined_at = EXCLUDED.joined_at,
  updated_at = EXCLUDED.updated_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM waitlist_entries AS entry
    LEFT JOIN waitlist_legacy_history AS history
      ON history.waitlist_entry_id = entry.id
    WHERE history.waitlist_entry_id IS NULL
       OR history.user_id IS DISTINCT FROM entry.user_id
       OR history.offering_id IS DISTINCT FROM entry.offering_id
       OR history.reservation_id IS DISTINCT FROM entry.reservation_id
       OR history.reason IS DISTINCT FROM entry.reason
       OR history.joined_at IS DISTINCT FROM entry.joined_at
       OR history.updated_at IS DISTINCT FROM entry.updated_at
  ) THEN
    RAISE EXCEPTION 'Waitlist legacy values were not fully archived; refusing to drop source columns.';
  END IF;
END $$;

ALTER TABLE waitlist_entries
  DROP COLUMN IF EXISTS reservation_id,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS joined_at,
  DROP COLUMN IF EXISTS updated_at;
