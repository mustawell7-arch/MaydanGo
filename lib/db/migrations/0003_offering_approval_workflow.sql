BEGIN;

ALTER TABLE booking_offerings
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS partner_response text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

UPDATE booking_offerings
SET approval_status = 'published'
WHERE active = true
  AND approval_status = 'draft';

CREATE INDEX IF NOT EXISTS offering_review_status
  ON booking_offerings (partner_id, approval_status, starts_at);

COMMIT;
