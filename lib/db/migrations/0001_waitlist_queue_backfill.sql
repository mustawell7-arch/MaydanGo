-- Run through scripts/backfill-waitlist.ts before Drizzle schema sync.
-- Keep reservation_id, reason, joined_at, and updated_at intact for legacy history.
LOCK TABLE waitlist_entries IN ACCESS EXCLUSIVE MODE;

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS queue_position integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- Re-ranking can move rows through positions currently held by other rows.
-- Drop the derived index inside the same transaction, then recreate it below.
DROP INDEX IF EXISTS waitlist_position_per_offering;

-- Older schemas may have added created_at with a current-time default already.
-- Prefer the original join timestamp so queue history stays tied to the member's
-- actual position in line.
UPDATE waitlist_entries
SET joined_at = COALESCE(joined_at, created_at, now())
WHERE joined_at IS NULL;

UPDATE waitlist_entries
SET created_at = COALESCE(joined_at, created_at, now());

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY offering_id
      ORDER BY queue_position NULLS LAST, joined_at NULLS LAST, id
    )::integer AS next_position
  FROM waitlist_entries
)
UPDATE waitlist_entries AS entry
SET queue_position = ranked.next_position
FROM ranked
WHERE entry.id = ranked.id;

ALTER TABLE waitlist_entries
  ALTER COLUMN queue_position SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN joined_at SET DEFAULT now(),
  ALTER COLUMN joined_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_position_per_offering
  ON waitlist_entries (offering_id, queue_position);
