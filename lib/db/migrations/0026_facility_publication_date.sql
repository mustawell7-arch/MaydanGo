ALTER TABLE "facility_profiles"
  ADD COLUMN IF NOT EXISTS "published_at" timestamptz;
