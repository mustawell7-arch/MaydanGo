CREATE TABLE partner_onboarding_applications (
  id text PRIMARY KEY,
  applicant_user_id text NOT NULL,
  applicant_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  legal_business_name text NOT NULL,
  facility_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  district text,
  latitude double precision,
  longitude double precision,
  business_registration_reference text,
  tax_reference text,
  activity_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  opening_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  capacity integer,
  pricing_details text,
  status text NOT NULL DEFAULT 'application_received',
  status_note text,
  partner_id text REFERENCES partners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_onboarding_status_valid CHECK (
    status IN ('application_received', 'under_review', 'additional_documents_required',
      'commercial_negotiation', 'contract_issued', 'contract_signed', 'facility_setup',
      'qr_code_issued', 'staff_training_completed', 'test_checkin_completed', 'approved',
      'live', 'rejected')
  ),
  CONSTRAINT partner_onboarding_capacity_positive CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT partner_onboarding_coordinates_pair CHECK (
    (latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT partner_onboarding_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT partner_onboarding_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE INDEX partner_onboarding_applicant_created
  ON partner_onboarding_applications(applicant_user_id, created_at);
CREATE INDEX partner_onboarding_status_created
  ON partner_onboarding_applications(status, created_at);
CREATE UNIQUE INDEX partner_onboarding_active_applicant
  ON partner_onboarding_applications(applicant_user_id)
  WHERE status NOT IN ('live', 'rejected');

CREATE TABLE partner_onboarding_events (
  id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES partner_onboarding_applications(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_onboarding_event_status_valid CHECK (
    to_status IN ('application_received', 'under_review', 'additional_documents_required',
      'commercial_negotiation', 'contract_issued', 'contract_signed', 'facility_setup',
      'qr_code_issued', 'staff_training_completed', 'test_checkin_completed', 'approved',
      'live', 'rejected')
  )
);
CREATE INDEX partner_onboarding_events_application_created
  ON partner_onboarding_events(application_id, created_at);

CREATE TABLE partner_onboarding_documents (
  id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES partner_onboarding_applications(id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  document_name text NOT NULL,
  document_path text NOT NULL,
  content_type text,
  file_size integer,
  expires_on date,
  status text NOT NULL DEFAULT 'upload_pending',
  review_note text,
  uploaded_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_onboarding_document_type_valid CHECK (
    document_type IN ('business_registration', 'tax_document', 'licence', 'insurance',
      'facility_image', 'supporting_document')
  ),
  CONSTRAINT partner_onboarding_document_status_valid CHECK (
    status IN ('upload_pending', 'submitted', 'approved', 'rejected')
  ),
  CONSTRAINT partner_onboarding_document_file_size_valid CHECK (
    file_size IS NULL OR (file_size > 0 AND file_size <= 10485760)
  )
);
CREATE UNIQUE INDEX partner_onboarding_document_path
  ON partner_onboarding_documents(document_path);
CREATE INDEX partner_onboarding_documents_application_created
  ON partner_onboarding_documents(application_id, created_at);
