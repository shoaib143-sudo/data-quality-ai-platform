BEGIN;

-- The platform already owns governance.autonomy_policies for action-level autonomy rules.
-- The Governance Orchestrator requires a separate project-scoped policy record with a
-- different contract. Keep the two authorities distinct so CREATE TABLE IF NOT EXISTS
-- can never silently bind the orchestrator to the legacy action policy schema.
CREATE TABLE IF NOT EXISTS governance.orchestrator_autonomy_policies (
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

ALTER TABLE governance.orchestrator_autonomy_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE governance.orchestrator_autonomy_policies FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE governance.orchestrator_autonomy_policies TO service_role;

COMMENT ON TABLE governance.orchestrator_autonomy_policies IS
  'Project-scoped Governance Orchestrator policy authority. Distinct from governance.autonomy_policies, which stores action-level autonomy policies.';

COMMIT;
