CREATE TABLE "member_activity_sync_consent_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "action" text NOT NULL,
  "policy_version" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "member_activity_sync_consent_action_valid"
    CHECK ("action" IN ('accepted', 'revoked'))
);

CREATE INDEX "member_activity_sync_consent_owner_history"
  ON "member_activity_sync_consent_events" ("user_id", "recorded_at");

CREATE TABLE "member_activity_sync_summaries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL,
  "activity_date" date NOT NULL,
  "steps" integer,
  "completed_workouts" integer DEFAULT 0 NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "member_activity_sync_provider_valid"
    CHECK ("provider" IN ('apple_health', 'health_connect')),
  CONSTRAINT "member_activity_sync_steps_valid"
    CHECK ("steps" IS NULL OR "steps" BETWEEN 0 AND 300000),
  CONSTRAINT "member_activity_sync_workouts_valid"
    CHECK ("completed_workouts" BETWEEN 0 AND 100),
  CONSTRAINT "member_activity_sync_summary_nonempty"
    CHECK ("steps" IS NOT NULL OR "completed_workouts" > 0)
);

CREATE UNIQUE INDEX "member_activity_sync_summary_owner_source_day"
  ON "member_activity_sync_summaries" ("user_id", "provider", "activity_date");
CREATE INDEX "member_activity_sync_summary_owner_day"
  ON "member_activity_sync_summaries" ("user_id", "activity_date");
