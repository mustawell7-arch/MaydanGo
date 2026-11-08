BEGIN;

CREATE TABLE IF NOT EXISTS facility_quality_assessments (
  id text PRIMARY KEY,
  facility_id text NOT NULL REFERENCES facility_profiles(id) ON DELETE RESTRICT,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  reviewed_on date NOT NULL,
  next_review_on date,
  licence_expires_on date,
  insurance_expires_on date,
  hygiene_checklist jsonb NOT NULL,
  safety_checklist jsonb NOT NULL,
  status text NOT NULL DEFAULT 'action_required'
    CHECK (status IN ('approved', 'action_required', 'suspended')),
  findings text NOT NULL,
  corrective_action text,
  corrective_due_on date,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facility_quality_assessment_facility_date
  ON facility_quality_assessments (facility_id, reviewed_on DESC);
CREATE INDEX IF NOT EXISTS facility_quality_assessment_partner_date
  ON facility_quality_assessments (partner_id, reviewed_on DESC);
CREATE INDEX IF NOT EXISTS facility_quality_assessment_status_due
  ON facility_quality_assessments (status, corrective_due_on);

CREATE TABLE IF NOT EXISTS facility_quality_incidents (
  id text PRIMARY KEY,
  facility_id text NOT NULL REFERENCES facility_profiles(id) ON DELETE RESTRICT,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  incident_type text NOT NULL
    CHECK (incident_type IN ('safety', 'hygiene', 'equipment', 'facility', 'other')),
  occurred_at timestamptz NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'resolved')),
  resolution text,
  reported_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facility_quality_incident_facility_date
  ON facility_quality_incidents (facility_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS facility_quality_incident_partner_date
  ON facility_quality_incidents (partner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS facility_quality_incident_status_date
  ON facility_quality_incidents (status, created_at DESC);

COMMIT;
