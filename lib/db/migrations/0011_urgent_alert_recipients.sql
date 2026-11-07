BEGIN;

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS receive_urgent_alerts boolean NOT NULL DEFAULT true;

-- Preserve alert coverage for staff already receiving alerts while requiring
-- an administrator to opt newly added staff in explicitly.
UPDATE operators
  SET receive_urgent_alerts = false
  WHERE role NOT IN ('admin', 'support');

ALTER TABLE operators
  ALTER COLUMN receive_urgent_alerts SET DEFAULT false;

COMMIT;
