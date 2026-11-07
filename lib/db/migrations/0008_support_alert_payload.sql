BEGIN;

ALTER TABLE push_deliveries
  ADD COLUMN IF NOT EXISTS payload_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
