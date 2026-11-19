ALTER TABLE learning_lessons
  ADD COLUMN IF NOT EXISTS quiz jsonb;

CREATE TABLE IF NOT EXISTS course_quiz_attempts (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  score_percent integer NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_quiz_attempt_enrollment_lesson_submitted
  ON course_quiz_attempts (enrollment_id, lesson_id, submitted_at);
