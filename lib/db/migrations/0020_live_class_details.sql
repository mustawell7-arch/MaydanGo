ALTER TABLE booking_offerings
  ADD COLUMN localized_instructor jsonb,
  ADD COLUMN difficulty_level text,
  ADD COLUMN instruction_language text,
  ADD COLUMN required_equipment jsonb;
