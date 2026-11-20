ALTER TABLE "facility_profiles"
  ADD COLUMN IF NOT EXISTS "logo_url" text,
  ADD COLUMN IF NOT EXISTS "cover_image_url" text,
  ADD COLUMN IF NOT EXISTS "gallery_image_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "promotional_video_url" text;
