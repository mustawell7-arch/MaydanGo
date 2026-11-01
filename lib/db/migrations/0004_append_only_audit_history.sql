BEGIN;

CREATE OR REPLACE FUNCTION reject_audit_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only; % is not permitted.', TG_OP
    USING ERRCODE = '55000';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS finance_review_events_no_update_delete ON finance_review_events;
CREATE TRIGGER finance_review_events_no_update_delete
  BEFORE UPDATE OR DELETE ON finance_review_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_history_mutation();

DROP TRIGGER IF EXISTS finance_review_events_no_truncate ON finance_review_events;
CREATE TRIGGER finance_review_events_no_truncate
  BEFORE TRUNCATE ON finance_review_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_history_mutation();

DROP TRIGGER IF EXISTS operation_audit_no_update_delete ON operation_audit;
CREATE TRIGGER operation_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON operation_audit
  FOR EACH ROW EXECUTE FUNCTION reject_audit_history_mutation();

DROP TRIGGER IF EXISTS operation_audit_no_truncate ON operation_audit;
CREATE TRIGGER operation_audit_no_truncate
  BEFORE TRUNCATE ON operation_audit
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_history_mutation();

COMMIT;
