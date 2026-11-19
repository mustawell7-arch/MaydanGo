CREATE TABLE "fitness_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "localized_title" jsonb NOT NULL,
  "localized_description" jsonb NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "goal_active_days" integer NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fitness_challenge_date_order" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "fitness_challenge_goal_range" CHECK (
    "goal_active_days" BETWEEN 1 AND 366
    AND "goal_active_days" <= ("end_date" - "start_date" + 1)
  ),
  CONSTRAINT "fitness_challenge_status_valid" CHECK ("status" IN ('draft', 'published', 'archived'))
);

CREATE INDEX "fitness_challenges_status_dates"
  ON "fitness_challenges" ("status", "start_date", "end_date");

CREATE TABLE "fitness_challenge_participants" (
  "id" text PRIMARY KEY NOT NULL,
  "challenge_id" text NOT NULL REFERENCES "fitness_challenges"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "fitness_challenge_participant_unique"
  ON "fitness_challenge_participants" ("challenge_id", "user_id");
CREATE INDEX "fitness_challenge_participant_user"
  ON "fitness_challenge_participants" ("user_id", "challenge_id");

CREATE TABLE "fitness_challenge_self_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "challenge_id" text NOT NULL REFERENCES "fitness_challenges"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "activity_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "fitness_challenge_self_report_day"
  ON "fitness_challenge_self_reports" ("challenge_id", "user_id", "activity_date");
CREATE INDEX "fitness_challenge_self_report_user"
  ON "fitness_challenge_self_reports" ("user_id", "challenge_id", "activity_date");
