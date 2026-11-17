CREATE TABLE IF NOT EXISTS "member_profile_photos" (
  "user_id" text PRIMARY KEY,
  "object_path" text,
  "consent_version" text NOT NULL DEFAULT 'member-photo-v1',
  "consent_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "member_profile_photos_object_path_unique"
  ON "member_profile_photos" ("object_path");
