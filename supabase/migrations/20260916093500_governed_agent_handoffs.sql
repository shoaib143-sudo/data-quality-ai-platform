BEGIN;

CREATE TABLE IF NOT EXISTS agent.governed_handoffs (
  envelope_id uuid PRIMARY KEY,
  schema_version text NOT NULL CHECK (schema_version = '1.0'),
  correlation_id uuid NOT NULL,
  parent_run_id uuid NOT NULL REFERENCES agent.agent_runs(id) ON DELETE CASCADE,
  source_run_id uuid NOT NULL REFERENCES agent.agent_runs(id) ON DELETE CASCADE,
  source_agent text NOT NULL,
  target_agent text NOT NULL,
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  payload_type text NOT NULL,
  payload jsonb NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  policy_snapshot_id text NOT NULL,
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  integrity_hash text NOT NULL CHECK (length(integrity_hash) = 64),
  state text NOT NULL DEFAULT 'SENT' CHECK (state IN ('SENT','DELIVERED','VALIDATED','ACCEPTED','REJECTED')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent.governed_run_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent.agent_runs(id) ON DELETE CASCADE,
  envelope_id uuid REFERENCES agent.governed_handoffs(envelope_id) ON DELETE CASCADE,
  gate_type text NOT NULL CHECK (gate_type IN ('ENTRY_GATE','EXIT_GATE')),
  status text NOT NULL CHECK (status IN ('PASS','FAIL','NOT_MEASURED')),
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'array'),
  reason text,
  evaluated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governed_handoffs_parent_created
ON agent.governed_handoffs(parent_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governed_handoffs_target_state
ON agent.governed_handoffs(target_agent, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governed_run_gates_run_type
ON agent.governed_run_gates(run_id, gate_type, created_at DESC);

ALTER TABLE agent.governed_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent.governed_run_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE agent.governed_handoffs FROM public, anon, authenticated;
REVOKE ALL ON TABLE agent.governed_run_gates FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE agent.governed_handoffs TO service_role;
GRANT SELECT, INSERT ON TABLE agent.governed_run_gates TO service_role;

COMMIT;
