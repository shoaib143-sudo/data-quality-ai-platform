BEGIN;

-- Hash-only append-only evidence for the native autonomous supervisor.
-- Raw goals, prompts, tool inputs, tool outputs and hidden reasoning are deliberately excluded.

CREATE TABLE agent.agent_supervisor_events
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,
    event_type text NOT NULL,
    plan_hash text NOT NULL,
    step_id text,
    step_order integer,
    agent_key text,
    tool_key text,
    contract_hash text,
    input_hash text,
    output_hash text,
    execution_decision text,
    risk_tier integer,
    attempt integer,
    detail_code text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_supervisor_events_type_check
        CHECK (event_type IN (
            'PLAN_STARTED',
            'STEP_STARTED',
            'STEP_EXECUTED',
            'STEP_VALIDATED',
            'STEP_FAILED',
            'RECOVERY_DECIDED',
            'APPROVAL_REQUIRED',
            'PLAN_SUCCEEDED',
            'PLAN_FAILED'
        )),
    CONSTRAINT agent_supervisor_events_plan_hash_check
        CHECK (plan_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_supervisor_events_contract_hash_check
        CHECK (contract_hash IS NULL OR contract_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_supervisor_events_input_hash_check
        CHECK (input_hash IS NULL OR input_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_supervisor_events_output_hash_check
        CHECK (output_hash IS NULL OR output_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_supervisor_events_step_id_check
        CHECK (step_id IS NULL OR length(trim(step_id)) BETWEEN 1 AND 160),
    CONSTRAINT agent_supervisor_events_step_order_check
        CHECK (step_order IS NULL OR step_order > 0),
    CONSTRAINT agent_supervisor_events_attempt_check
        CHECK (attempt IS NULL OR attempt > 0),
    CONSTRAINT agent_supervisor_events_risk_tier_check
        CHECK (risk_tier IS NULL OR risk_tier BETWEEN 0 AND 3),
    CONSTRAINT agent_supervisor_events_decision_check
        CHECK (execution_decision IS NULL OR execution_decision IN (
            'AUTO_TIER_0',
            'AUTO_TIER_1',
            'AUTO_TIER_2_PREAPPROVED',
            'APPROVAL_REQUIRED',
            'PROHIBITED'
        )),
    CONSTRAINT agent_supervisor_events_detail_code_check
        CHECK (detail_code IS NULL OR length(detail_code) <= 160)
);

CREATE INDEX agent_supervisor_events_run_created_idx
ON agent.agent_supervisor_events(agent_run_id, created_at, id);

CREATE INDEX agent_supervisor_events_plan_idx
ON agent.agent_supervisor_events(plan_hash, created_at, id);

ALTER TABLE agent.agent_supervisor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_supervisor_events_project_read
ON agent.agent_supervisor_events
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_supervisor_events.agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);

REVOKE ALL ON agent.agent_supervisor_events FROM public, anon, authenticated;
GRANT SELECT ON agent.agent_supervisor_events TO authenticated;
GRANT ALL ON agent.agent_supervisor_events TO service_role;

CREATE OR REPLACE FUNCTION app_private.prevent_supervisor_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Native supervisor evidence is append-only';
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_supervisor_event_mutation() FROM public, anon, authenticated;

CREATE TRIGGER agent_supervisor_events_append_only
BEFORE UPDATE OR DELETE ON agent.agent_supervisor_events
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_supervisor_event_mutation();

CREATE OR REPLACE FUNCTION agent.record_supervisor_event_internal(
    p_agent_run_id uuid,
    p_event_type text,
    p_plan_hash text,
    p_step_id text DEFAULT NULL,
    p_step_order integer DEFAULT NULL,
    p_agent_key text DEFAULT NULL,
    p_tool_key text DEFAULT NULL,
    p_contract_hash text DEFAULT NULL,
    p_input_hash text DEFAULT NULL,
    p_output_hash text DEFAULT NULL,
    p_execution_decision text DEFAULT NULL,
    p_risk_tier integer DEFAULT NULL,
    p_attempt integer DEFAULT NULL,
    p_detail_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event_id uuid;
    v_event_type text;
    v_execution_decision text;
BEGIN
    v_event_type := upper(trim(COALESCE(p_event_type, '')));
    v_execution_decision := CASE
        WHEN p_execution_decision IS NULL THEN NULL
        ELSE upper(trim(p_execution_decision))
    END;

    IF v_event_type NOT IN (
        'PLAN_STARTED',
        'STEP_STARTED',
        'STEP_EXECUTED',
        'STEP_VALIDATED',
        'STEP_FAILED',
        'RECOVERY_DECIDED',
        'APPROVAL_REQUIRED',
        'PLAN_SUCCEEDED',
        'PLAN_FAILED'
    ) THEN
        RAISE EXCEPTION 'Unsupported native supervisor event type';
    END IF;
    IF p_plan_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Native supervisor plan hash must be sha256';
    END IF;
    IF p_contract_hash IS NOT NULL AND p_contract_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Native supervisor contract hash must be sha256';
    END IF;
    IF p_input_hash IS NOT NULL AND p_input_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Native supervisor input hash must be sha256';
    END IF;
    IF p_output_hash IS NOT NULL AND p_output_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Native supervisor output hash must be sha256';
    END IF;
    IF p_step_id IS NOT NULL AND length(trim(p_step_id)) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'Native supervisor step id is invalid';
    END IF;
    IF p_step_order IS NOT NULL AND p_step_order <= 0 THEN
        RAISE EXCEPTION 'Native supervisor step order must be positive';
    END IF;
    IF p_attempt IS NOT NULL AND p_attempt <= 0 THEN
        RAISE EXCEPTION 'Native supervisor attempt must be positive';
    END IF;
    IF p_risk_tier IS NOT NULL AND p_risk_tier NOT BETWEEN 0 AND 3 THEN
        RAISE EXCEPTION 'Native supervisor risk tier is invalid';
    END IF;
    IF v_execution_decision IS NOT NULL AND v_execution_decision NOT IN (
        'AUTO_TIER_0',
        'AUTO_TIER_1',
        'AUTO_TIER_2_PREAPPROVED',
        'APPROVAL_REQUIRED',
        'PROHIBITED'
    ) THEN
        RAISE EXCEPTION 'Native supervisor execution decision is invalid';
    END IF;
    IF p_detail_code IS NOT NULL AND length(p_detail_code) > 160 THEN
        RAISE EXCEPTION 'Native supervisor detail code is too long';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM agent.agent_runs r WHERE r.id = p_agent_run_id) THEN
        RAISE EXCEPTION 'Native supervisor agent run not found';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM agent.agent_run_runtime_manifests m
        WHERE m.agent_run_id = p_agent_run_id
    ) THEN
        RAISE EXCEPTION 'Native supervisor run must have a pinned runtime manifest';
    END IF;

    INSERT INTO agent.agent_supervisor_events (
        agent_run_id,
        event_type,
        plan_hash,
        step_id,
        step_order,
        agent_key,
        tool_key,
        contract_hash,
        input_hash,
        output_hash,
        execution_decision,
        risk_tier,
        attempt,
        detail_code
    ) VALUES (
        p_agent_run_id,
        v_event_type,
        lower(trim(p_plan_hash)),
        CASE WHEN p_step_id IS NULL THEN NULL ELSE trim(p_step_id) END,
        p_step_order,
        CASE WHEN p_agent_key IS NULL THEN NULL ELSE trim(p_agent_key) END,
        CASE WHEN p_tool_key IS NULL THEN NULL ELSE trim(p_tool_key) END,
        CASE WHEN p_contract_hash IS NULL THEN NULL ELSE lower(trim(p_contract_hash)) END,
        CASE WHEN p_input_hash IS NULL THEN NULL ELSE lower(trim(p_input_hash)) END,
        CASE WHEN p_output_hash IS NULL THEN NULL ELSE lower(trim(p_output_hash)) END,
        v_execution_decision,
        p_risk_tier,
        p_attempt,
        CASE WHEN p_detail_code IS NULL THEN NULL ELSE left(trim(p_detail_code), 160) END
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION agent.record_supervisor_event_internal(uuid,text,text,text,integer,text,text,text,text,text,text,integer,integer,text)
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent.record_supervisor_event_internal(uuid,text,text,text,integer,text,text,text,text,text,text,integer,integer,text)
TO service_role;

COMMENT ON TABLE agent.agent_supervisor_events IS
'Append-only hash-only execution trajectory evidence for the native DataNexus supervisor. Raw plans, prompts, tool inputs and outputs are intentionally excluded.';

COMMIT;
