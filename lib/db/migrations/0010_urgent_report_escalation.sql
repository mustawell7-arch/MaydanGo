BEGIN;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS urgent_escalated_at timestamptz;

CREATE INDEX IF NOT EXISTS support_tickets_urgent_unassigned_created_idx
  ON support_tickets (created_at)
  WHERE urgent = true
    AND assigned_to IS NULL
    AND urgent_escalated_at IS NULL
    AND status IN ('open', 'in_progress', 'waiting_member');

COMMIT;
