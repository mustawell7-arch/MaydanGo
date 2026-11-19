ALTER TABLE facility_quality_assessments
  ADD COLUMN IF NOT EXISTS inspection_type text NOT NULL DEFAULT 'routine';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facility_quality_assessment_inspection_type_valid'
  ) THEN
    ALTER TABLE facility_quality_assessments
      ADD CONSTRAINT facility_quality_assessment_inspection_type_valid
      CHECK (inspection_type IN ('routine', 'mystery'));
  END IF;
END $$;
