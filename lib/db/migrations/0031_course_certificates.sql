CREATE TABLE "course_certificates" (
  "id" text PRIMARY KEY NOT NULL,
  "enrollment_id" text NOT NULL REFERENCES "course_enrollments"("id") ON DELETE CASCADE,
  "instructor_user_id" text NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "course_certificate_enrollment" ON "course_certificates" ("enrollment_id");
CREATE INDEX "course_certificate_instructor" ON "course_certificates" ("instructor_user_id", "issued_at");
