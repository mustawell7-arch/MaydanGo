BEGIN;

ALTER TABLE push_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_status text,
  ADD COLUMN IF NOT EXISTS receipt_error text,
  ADD COLUMN IF NOT EXISTS receipt_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_attempt_count integer NOT NULL DEFAULT 0;

UPDATE push_deliveries
SET receipt_status = 'pending'
WHERE status = 'sent'
  AND provider_ticket_id IS NOT NULL
  AND receipt_status IS NULL;

CREATE INDEX IF NOT EXISTS push_deliveries_retry_due_idx
  ON push_deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS push_deliveries_receipt_due_idx
  ON push_deliveries (status, receipt_status, accepted_at);

COMMIT;
