BEGIN;

CREATE TABLE IF NOT EXISTS facility_reviews (
  id text PRIMARY KEY,
  attendance_id text NOT NULL REFERENCES attendance(id) ON DELETE RESTRICT,
  reservation_id text NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  facility_id text NOT NULL REFERENCES facility_profiles(id) ON DELETE RESTRICT,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  reviewer_user_id text NOT NULL,
  overall_rating integer NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  category_ratings jsonb NOT NULL,
  content text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  moderation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facility_review_attendance_unique ON facility_reviews(attendance_id);
CREATE UNIQUE INDEX IF NOT EXISTS facility_review_reservation_unique ON facility_reviews(reservation_id);
CREATE INDEX IF NOT EXISTS facility_review_facility_status_created ON facility_reviews(facility_id, status, created_at);
CREATE INDEX IF NOT EXISTS facility_review_partner_status_created ON facility_reviews(partner_id, status, created_at);
CREATE INDEX IF NOT EXISTS facility_review_reviewer_created ON facility_reviews(reviewer_user_id, created_at);

CREATE TABLE IF NOT EXISTS facility_review_reports (
  id text PRIMARY KEY,
  review_id text NOT NULL REFERENCES facility_reviews(id) ON DELETE RESTRICT,
  reporter_user_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('abusive', 'personal_information', 'misleading', 'other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facility_review_reporter_unique ON facility_review_reports(review_id, reporter_user_id);
CREATE INDEX IF NOT EXISTS facility_review_reports_status_created ON facility_review_reports(status, created_at);

CREATE TABLE IF NOT EXISTS facility_review_responses (
  review_id text PRIMARY KEY REFERENCES facility_reviews(id) ON DELETE RESTRICT,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  response text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facility_review_privileges (
  user_id text PRIMARY KEY,
  reason text NOT NULL,
  suspended_by text NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
