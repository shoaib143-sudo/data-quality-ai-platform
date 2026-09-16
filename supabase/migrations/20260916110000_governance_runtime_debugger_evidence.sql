BEGIN;

ALTER TABLE orchestration.governance_recovery_events
  ADD COLUMN IF NOT EXISTS debugger_run_id uuid REFERENCES agent.agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_governance_recovery_events_debugger_run
  ON orchestration.governance_recovery_events(debugger_run_id)
  WHERE debugger_run_id IS NOT NULL;

COMMENT ON COLUMN orchestration.governance_recovery_events.debugger_run_id IS
  'Read-only governed support-agent run used to diagnose a runtime/system defect. This evidence does not prove the failed business step succeeded.';

COMMIT;
