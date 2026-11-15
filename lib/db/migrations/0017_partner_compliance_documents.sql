CREATE TABLE partner_compliance_documents (
  id text PRIMARY KEY,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  facility_id text NOT NULL REFERENCES facility_profiles(id) ON DELETE RESTRICT,
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
  CONSTRAINT partner_compliance_document_type_valid CHECK (document_type IN ('licence', 'insurance', 'supporting_document')),
  CONSTRAINT partner_compliance_document_status_valid CHECK (status IN ('upload_pending', 'submitted', 'approved', 'rejected')),
  CONSTRAINT partner_compliance_document_file_size_valid CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 10485760))
);
CREATE UNIQUE INDEX partner_compliance_document_path ON partner_compliance_documents(document_path);
CREATE INDEX partner_compliance_partner_facility_created ON partner_compliance_documents(partner_id, facility_id, created_at);
CREATE INDEX partner_compliance_expiry ON partner_compliance_documents(document_type, status, expires_on);
