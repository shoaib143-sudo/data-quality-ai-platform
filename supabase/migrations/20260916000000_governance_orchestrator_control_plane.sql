BEGIN;

CREATE SCHEMA IF NOT EXISTS orchestration;

CREATE TABLE IF NOT EXISTS orchestration.autonomy_policies (
    project_id uuid PRIMARY KEY REFERENCES app.projects(id) ON DELETE CASCADE,
    mode text NOT NULL DEFAULT 'OFF' CHECK (mode IN ('OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
    enabled boolean NOT NULL DEFAULT false,
    policy_version text NOT NULL DEFAULT '1.0',
    maximum_risk_tier text NOT NULL DEFAULT 'NONE' CHECK (maximum_risk_tier IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL')),
    allowed_agent_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
    allowed_tool_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
    allowed_model_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
    allowed_mutation_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
    approval_required_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
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
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orchestration.coverage_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    policy_version text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
    supervisor_run_id uuid REFERENCES agent.agent_runs(id) ON DELETE SET NULL,
    mandatory_count integer NOT NULL CHECK (mandatory_count >= 0),
    accounted_count integer NOT NULL CHECK (accounted_count >= 0),
    executed_count integer NOT NULL CHECK (executed_count >= 0),
    passed_count integer NOT NULL CHECK (passed_count >= 0),
    failed_count integer NOT NULL CHECK (failed_count >= 0),
    blocked_count integer NOT NULL CHECK (blocked_count >= 0),
    not_measured_count integer NOT NULL CHECK (not_measured_count >= 0),
    accounting_coverage_pct numeric(7,3) NOT NULL CHECK (accounting_coverage_pct >= 0 AND accounting_coverage_pct <= 100),
    execution_coverage_pct numeric(7,3) NOT NULL CHECK (execution_coverage_pct >= 0 AND execution_coverage_pct <= 100),
    certification_coverage_pct numeric(7,3) NOT NULL CHECK (certification_coverage_pct >= 0 AND certification_coverage_pct <= 100),
    certification_eligible boolean NOT NULL DEFAULT false,
    status text NOT NULL CHECK (status IN ('INCOMPLETE','CERTIFIABLE','CERTIFIED','FAILED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orchestration.coverage_run_capabilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coverage_run_id uuid NOT NULL REFERENCES orchestration.coverage_runs(id) ON DELETE CASCADE,
    capability_key text NOT NULL,
    mandatory_for_e2e boolean NOT NULL DEFAULT true,
    outcome text CHECK (outcome IS NULL OR outcome IN ('EXECUTED_AND_PASSED','EXECUTED_AND_FAILED','BLOCKED_POLICY','BLOCKED_EXTERNAL','NOT_APPLICABLE','NOT_MEASURED')),
    evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (coverage_run_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_coverage_runs_project_created
ON orchestration.coverage_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coverage_run_capabilities_run
ON orchestration.coverage_run_capabilities(coverage_run_id);

ALTER TABLE orchestration.autonomy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration.coverage_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestration.coverage_run_capabilities ENABLE ROW LEVEL SECURITY;

-- These tables are server-authoritative. Authenticated clients never receive direct DML rights.
REVOKE ALL ON TABLE orchestration.autonomy_policies FROM public, anon, authenticated;
REVOKE ALL ON TABLE orchestration.coverage_runs FROM public, anon, authenticated;
REVOKE ALL ON TABLE orchestration.coverage_run_capabilities FROM public, anon, authenticated;

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
    'Coordinates governed Data Governance and AI capabilities through existing specialist agents and deterministic policy boundaries. It does not self-certify.',
    '1.0',
    'Coordinate only authorized governed capabilities. Never bypass authorization, approval, evidence, tenant isolation, budgets, emergency controls, or independent certification. Treat canonical persisted evidence as authoritative over agent claims.',
    jsonb_build_object(
        'authority', 'ORCHESTRATOR_ONLY',
        'self_certification', false,
        'default_mode', 'OFF',
        'runtime', 'native_supervisor'
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
