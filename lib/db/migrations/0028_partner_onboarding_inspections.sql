CREATE TABLE partner_onboarding_inspections (
  id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES partner_onboarding_applications(id) ON DELETE RESTRICT,
  inspected_on date NOT NULL,
  hygiene_checklist jsonb NOT NULL,
  safety_checklist jsonb NOT NULL,
  status text NOT NULL,
  findings text NOT NULL,
  corrective_action text,
  corrective_due_on date,
  inspected_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_onboarding_inspection_status_valid
    CHECK (status IN ('approved', 'action_required')),
  CONSTRAINT partner_onboarding_inspection_action_plan_required
    CHECK (status <> 'action_required' OR (
      length(btrim(findings)) >= 4
      AND corrective_action IS NOT NULL
      AND length(btrim(corrective_action)) >= 4
      AND corrective_due_on IS NOT NULL
    ))
);

CREATE INDEX partner_onboarding_inspections_application_created
  ON partner_onboarding_inspections(application_id, created_at);
