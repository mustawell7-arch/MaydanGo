BEGIN;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS support_tickets_urgent_queue_idx
  ON support_tickets (urgent, status, last_message_at);

COMMIT;
