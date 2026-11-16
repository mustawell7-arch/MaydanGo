ALTER TABLE partners
  ADD COLUMN activity_approval_mode text NOT NULL DEFAULT 'platform_default',
  ADD CONSTRAINT partners_activity_approval_mode_valid
    CHECK (activity_approval_mode IN (
      'platform_default',
      'activity_approval_required',
      'trusted_direct_publish'
    ));

ALTER TABLE booking_offerings
  ADD COLUMN instructions text,
  ADD COLUMN image_path text,
  ADD COLUMN booking_cutoff_minutes integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT booking_offerings_booking_cutoff_minutes_valid
    CHECK (booking_cutoff_minutes BETWEEN 0 AND 10080);
