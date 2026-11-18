ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
