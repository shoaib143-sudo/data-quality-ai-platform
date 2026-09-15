BEGIN;

CREATE TABLE IF NOT EXISTS governance.autonomy_policies (
    project_id uuid PRIMARY KEY REFERENCES app.projects(id) ON DELETE CASCADE,
    mode text NOT NULL DEFAULT 'OFF' CHECK (mode IN ('OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
    enabled boolean NOT NULL DEFAULT false,
    policy_version text NOT NULL DEFAULT '1.0',
    maximum_risk_tier text NOT NULL DEFAULT 'NONE' CHECK (maximum_risk_tier IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL')),
    allowed_agent_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_agent_keys) = 'array'),
    allowed_tool_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_tool_keys) = 'array'),
    allowed_model_classes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_model_classes) = 'array'),
    allowed_mutation_classes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_mutation_classes) = 'array'),
    approval_required_actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(approval_required_actions) = 'array'),
    auto_remediation_enabled boolean NOT NULL DEFAULT false,
    auto_rollback_enabled boolean NOT NULL DEFAULT false,
    max_execution_budget numeric(18,6) NOT NULL DEFAULT 0 CHECK (max_execution_budget >= 0),
    max_model_budget numeric(18,6) NOT NULL DEFAULT 0 CHECK (max_model_budget >= 0),
    max_runtime_ms integer NOT NULL DEFAULT 300000 CHECK (max_runtime_ms > 0 AND max_runtime_ms <= 3600000),
    max_datasets_changed_per_run integer NOT NULL DEFAULT 0 CHECK (max_datasets_changed_per_run >= 0),
    max_projects_affected_per_run integer NOT NULL DEFAULT 1 CHECK (max_projects_affected_per_run >= 1),
    max_remediation_actions_per_hour integer NOT NULL DEFAULT 0 CHECK (max_remediation_actions_per_hour >= 0),
    max_concurrent_model_calls integer NOT NULL DEFAULT 0 CHECK (max_concurrent_model_calls >= 0),
    emergency_stop boolean NOT NULL DEFAULT false,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((mode = 'OFF' AND enabled = false) OR (mode <> 'OFF' AND enabled = true))
);

CREATE TABLE IF NOT EXISTS governance.governance_orchestrator_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    policy_version text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
    goal_hash text NOT NULL CHECK (length(goal_hash) = 64),
    supervisor_run_id uuid REFERENCES agent.agent_runs(id) ON DELETE SET NULL,
    ai_capability_e2e_run_id uuid REFERENCES governance.ai_capability_e2e_runs(id) ON DELETE SET NULL,
    status text NOT NULL CHECK (status IN ('CREATED','BLOCKED_POLICY','WAITING_APPROVAL','RUNNING','SUCCEEDED','FAILED','BLOCKED_EXTERNAL')),
    decision_trace jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(decision_trace) = 'object'),
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_orchestrator_runs_project_created
ON governance.governance_orchestrator_runs(project_id, created_at DESC);

ALTER TABLE governance.autonomy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.governance_orchestrator_runs ENABLE ROW LEVEL SECURITY;

-- Server-authoritative control plane. Browser clients never receive direct DML rights.
REVOKE ALL ON TABLE governance.autonomy_policies FROM public, anon, authenticated;
REVOKE ALL ON TABLE governance.governance_orchestrator_runs FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE governance.autonomy_policies TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE governance.governance_orchestrator_runs TO service_role;

INSERT INTO agent.agent_definitions (
    agent_key,
    name,
    description,
    version,
    system_prompt,
    configuration,
    enabled
)
VALUES (
    'governance_orchestrator_agent',
    'DataNexus Governance Orchestrator',
    'Coordinates governed Data Governance and AI capabilities through existing specialist agents, deterministic policy boundaries, and the canonical run-scoped 75-capability evidence ledger. It does not self-certify.',
    '1.0',
    'Coordinate only authorized governed capabilities. Never bypass authorization, approval, evidence, tenant isolation, budgets, emergency controls, or independent certification. Treat governance.ai_capability_e2e_* canonical persisted evidence as authoritative over agent claims.',
    jsonb_build_object(
        'authority', 'ORCHESTRATOR_ONLY',
        'self_certification', false,
        'default_mode', 'OFF',
        'runtime', 'native_supervisor',
        'capability_ledger', 'governance.ai_capability_e2e_runs',
        'mandatory_capability_count', 75
    ),
    true
)
ON CONFLICT (agent_key, version)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    configuration = EXCLUDED.configuration,
    enabled = EXCLUDED.enabled;

COMMIT;
