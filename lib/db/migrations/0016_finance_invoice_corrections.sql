CREATE TABLE IF NOT EXISTS finance_invoice_corrections (
  id text PRIMARY KEY,
  membership_billing_id text REFERENCES membership_billing(id),
  partner_invoice_id text REFERENCES partner_invoice_submissions(id),
  correction_type text NOT NULL,
  amount_iqd integer,
  refund_transaction_reference text,
  reason text NOT NULL,
  created_by text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL,
  CONSTRAINT finance_invoice_corrections_one_original CHECK (
    (membership_billing_id IS NOT NULL AND partner_invoice_id IS NULL)
    OR (membership_billing_id IS NULL AND partner_invoice_id IS NOT NULL)
  ),
  CONSTRAINT finance_invoice_corrections_positive_amount CHECK (amount_iqd IS NULL OR amount_iqd > 0),
  CONSTRAINT finance_invoice_corrections_reason_length CHECK (char_length(reason) BETWEEN 5 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_invoice_corrections_idempotency
  ON finance_invoice_corrections(idempotency_key);
CREATE INDEX IF NOT EXISTS finance_invoice_corrections_created
  ON finance_invoice_corrections(created_at);
CREATE INDEX IF NOT EXISTS finance_invoice_corrections_retention
  ON finance_invoice_corrections(retention_until);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finance_invoice_corrections_reason_length'
      AND conrelid = 'finance_invoice_corrections'::regclass
  ) THEN
    ALTER TABLE finance_invoice_corrections
      ADD CONSTRAINT finance_invoice_corrections_reason_length
      CHECK (char_length(reason) BETWEEN 5 AND 500);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reject_finance_invoice_correction_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'finance invoice correction history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS finance_invoice_corrections_no_update_delete ON finance_invoice_corrections;
CREATE TRIGGER finance_invoice_corrections_no_update_delete
  BEFORE UPDATE OR DELETE ON finance_invoice_corrections
  FOR EACH ROW EXECUTE FUNCTION reject_finance_invoice_correction_mutation();

DROP TRIGGER IF EXISTS finance_invoice_corrections_no_truncate ON finance_invoice_corrections;
CREATE TRIGGER finance_invoice_corrections_no_truncate
  BEFORE TRUNCATE ON finance_invoice_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION reject_finance_invoice_correction_mutation();
