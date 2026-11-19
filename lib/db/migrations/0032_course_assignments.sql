CREATE TABLE "course_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "course_id" text NOT NULL REFERENCES "learning_courses"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "localized_title" jsonb NOT NULL,
  "localized_instructions" jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "course_assignments_course_position" ON "course_assignments" ("course_id", "position");

CREATE TABLE "course_assignment_progress" (
  "id" text PRIMARY KEY NOT NULL,
  "assignment_id" text NOT NULL REFERENCES "course_assignments"("id") ON DELETE CASCADE,
  "enrollment_id" text NOT NULL REFERENCES "course_enrollments"("id") ON DELETE CASCADE,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "course_assignment_progress_enrollment_assignment" ON "course_assignment_progress" ("enrollment_id", "assignment_id");
CREATE INDEX "course_assignment_progress_enrollment" ON "course_assignment_progress" ("enrollment_id");
