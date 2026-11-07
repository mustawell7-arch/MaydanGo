BEGIN;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS urgent_alert_status text NOT NULL DEFAULT 'not_applicable';

COMMIT;
