CREATE TABLE "partner_contract_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "partner_id" text NOT NULL REFERENCES "partners"("id") ON DELETE RESTRICT,
  "version_number" integer NOT NULL,
  "replaces_version_id" text,
  "document_name" text NOT NULL,
  "document_path" text NOT NULL,
  "change_summary" text NOT NULL,
  "content_type" text,
  "file_size" integer,
  "status" text DEFAULT 'upload_pending' NOT NULL,
  "review_note" text,
  "uploaded_by" text NOT NULL,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "partner_contract_replaces_version_fk"
    FOREIGN KEY ("replaces_version_id") REFERENCES "partner_contract_versions"("id") ON DELETE RESTRICT,
  CONSTRAINT "partner_contract_version_number_positive" CHECK ("version_number" > 0),
  CONSTRAINT "partner_contract_status_valid" CHECK ("status" IN ('upload_pending', 'submitted', 'approved', 'rejected', 'superseded')),
  CONSTRAINT "partner_contract_file_size_valid" CHECK ("file_size" IS NULL OR ("file_size" > 0 AND "file_size" <= 10485760))
);

CREATE UNIQUE INDEX "partner_contract_version_number_unique" ON "partner_contract_versions" USING btree ("partner_id", "version_number");
CREATE UNIQUE INDEX "partner_contract_document_path_unique" ON "partner_contract_versions" USING btree ("document_path");
CREATE UNIQUE INDEX "partner_contract_one_current_version" ON "partner_contract_versions" USING btree ("partner_id") WHERE "status" = 'approved';
CREATE INDEX "partner_contract_partner_history" ON "partner_contract_versions" USING btree ("partner_id", "version_number");
CREATE INDEX "partner_contract_review_queue" ON "partner_contract_versions" USING btree ("status", "created_at");
