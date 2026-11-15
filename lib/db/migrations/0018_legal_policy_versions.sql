CREATE TABLE "legal_policy_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "policy_key" text NOT NULL,
  "version" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "translations" jsonb NOT NULL,
  "effective_at" timestamp with time zone NOT NULL,
  "published_at" timestamp with time zone,
  "published_by" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_policy_key_check" CHECK ("policy_key" IN ('terms_of_use', 'privacy_policy', 'booking_policy', 'cancellation_policy', 'refund_policy')),
  CONSTRAINT "legal_policy_status_check" CHECK ("status" IN ('draft', 'published'))
);

CREATE UNIQUE INDEX "legal_policy_key_version_unique" ON "legal_policy_versions" USING btree ("policy_key", "version");
CREATE INDEX "legal_policy_current_lookup" ON "legal_policy_versions" USING btree ("policy_key", "status", "effective_at");
