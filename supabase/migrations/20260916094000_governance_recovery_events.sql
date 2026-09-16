BEGIN;

CREATE TABLE IF NOT EXISTS orchestration.governance_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  orchestrator_run_id uuid NOT NULL REFERENCES governance.governance_orchestrator_runs(id) ON DELETE CASCADE,
  failing_run_id uuid REFERENCES agent.agent_runs(id) ON DELETE SET NULL,
  failing_step_id text NOT NULL,
  correlation_id text NOT NULL,
  failure_class text NOT NULL CHECK (failure_class IN ('TRANSIENT_RETRY_SAFE','APPROVAL_REQUIRED','POLICY_BLOCKED','RUNTIME_SYSTEM_DEFECT','SECURITY_INCIDENT','UNSAFE_AMBIGUOUS')),
  disposition text NOT NULL CHECK (disposition IN ('RETRY_SAFE','REQUIRES_APPROVAL','BLOCKED_POLICY','DEBUGGER_REQUIRED','SECURITY_ESCALATION','FAIL_CLOSED')),
  reason text NOT NULL,
  retry_allowed boolean NOT NULL DEFAULT false,
  debugger_outcome text CHECK (debugger_outcome IS NULL OR debugger_outcome IN ('RECOVERED_AND_REVALIDATED','RETRY_SAFE','REQUIRES_APPROVAL','REQUIRES_ROLLBACK','NOT_RECOVERABLE','SECURITY_ESCALATION')),
  original_step_reexecuted boolean NOT NULL DEFAULT false,
  original_exit_gate_passed boolean NOT NULL DEFAULT false,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_recovery_events_orchestrator_created
ON orchestration.governance_recovery_events(orchestrator_run_id, created_at DESC);

ALTER TABLE orchestration.governance_recovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE orchestration.governance_recovery_events FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE orchestration.governance_recovery_events TO service_role;

COMMIT;
