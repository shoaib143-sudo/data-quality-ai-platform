BEGIN;

ALTER TABLE governance.governance_orchestrator_runs
  ADD COLUMN IF NOT EXISTS reporting_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_persona text NOT NULL DEFAULT 'EXECUTIVE'
    CHECK (report_persona IN ('EXECUTIVE','GOVERNANCE_COUNCIL','DATA_STEWARD','AUDIT')),
  ADD COLUMN IF NOT EXISTS report_depth text NOT NULL DEFAULT 'EXECUTIVE'
    CHECK (report_depth IN ('EXECUTIVE','GOVERNANCE','AUDIT'));

CREATE TABLE IF NOT EXISTS governance.governance_outcome_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  orchestrator_run_id uuid NOT NULL REFERENCES governance.governance_orchestrator_runs(id) ON DELETE CASCADE,
  capability_run_id uuid REFERENCES governance.ai_capability_e2e_runs(id) ON DELETE SET NULL,
  schema_version text NOT NULL DEFAULT '1.0' CHECK (schema_version = '1.0'),
  persona text NOT NULL CHECK (persona IN ('EXECUTIVE','GOVERNANCE_COUNCIL','DATA_STEWARD','AUDIT')),
  depth text NOT NULL CHECK (depth IN ('EXECUTIVE','GOVERNANCE','AUDIT')),
  report_hash text NOT NULL CHECK (length(report_hash) = 64),
  report_payload jsonb NOT NULL CHECK (jsonb_typeof(report_payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (orchestrator_run_id, report_hash)
);

CREATE INDEX IF NOT EXISTS idx_governance_outcome_reports_project_created
ON governance.governance_outcome_reports(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_outcome_reports_run_created
ON governance.governance_outcome_reports(orchestrator_run_id, created_at DESC);

ALTER TABLE governance.governance_outcome_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE governance.governance_outcome_reports FROM public, anon, authenticated;
GRANT SELECT, INSERT ON TABLE governance.governance_outcome_reports TO service_role;

COMMIT;
