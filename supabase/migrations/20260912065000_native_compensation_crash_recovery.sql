BEGIN;

ALTER TABLE agent.agent_tool_invocations
    ADD COLUMN execution_owner text,
    ADD COLUMN execution_lease_expires_at timestamptz,
    ADD COLUMN execution_generation bigint NOT NULL DEFAULT 0,
    ADD COLUMN last_claimed_at timestamptz,
    ADD COLUMN reclaim_count bigint NOT NULL DEFAULT 0;

ALTER TABLE agent.agent_tool_invocations
    ADD CONSTRAINT agent_tool_invocations_execution_generation_check CHECK (execution_generation >= 0),
    ADD CONSTRAINT agent_tool_invocations_reclaim_count_check CHECK (reclaim_count >= 0),
    ADD CONSTRAINT agent_tool_invocations_execution_owner_shape_check CHECK (
        (execution_owner IS NULL AND execution_lease_expires_at IS NULL)
        OR (execution_owner IS NOT NULL AND length(trim(execution_owner)) BETWEEN 1 AND 300 AND execution_lease_expires_at IS NOT NULL)
    );

CREATE INDEX agent_tool_invocations_execution_lease_idx
ON agent.agent_tool_invocations(execution_lease_expires_at)
WHERE status = 'ADMITTED' AND execution_owner IS NOT NULL;

CREATE TABLE agent.agent_tool_invocation_events
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invocation_id uuid NOT NULL REFERENCES agent.agent_tool_invocations(id) ON DELETE CASCADE,
    agent_run_id uuid NOT NULL REFERENCES agent.agent_runs(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    execution_generation bigint,
    execution_owner text,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agent_tool_invocation_events_type_check CHECK (event_type IN (
        'COMPENSATION_CLAIMED',
        'COMPENSATION_RECLAIM_ATTEMPTED',
        'COMPENSATION_RECLAIMED',
        'COMPENSATION_COMPLETED',
        'COMPENSATION_FAILED',
        'STALE_COMPLETION_REJECTED',
        'COMPENSATION_REPLAY_BLOCKED_CONTRACT_DRIFT',
        'COMPENSATION_REPLAY_BLOCKED_UNSAFE'
    )),
    CONSTRAINT agent_tool_invocation_events_generation_check CHECK (execution_generation IS NULL OR execution_generation >= 0),
    CONSTRAINT agent_tool_invocation_events_owner_check CHECK (execution_owner IS NULL OR length(trim(execution_owner)) BETWEEN 1 AND 300),
    CONSTRAINT agent_tool_invocation_events_reason_check CHECK (reason IS NULL OR length(reason) <= 1000)
);

CREATE INDEX agent_tool_invocation_events_invocation_idx
ON agent.agent_tool_invocation_events(invocation_id, created_at, id);

ALTER TABLE agent.agent_tool_invocation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_tool_invocation_events_project_read
ON agent.agent_tool_invocation_events
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_tool_invocation_events.agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);
REVOKE ALL ON agent.agent_tool_invocation_events FROM public, anon, authenticated;
GRANT SELECT ON agent.agent_tool_invocation_events TO authenticated;
GRANT ALL ON agent.agent_tool_invocation_events TO service_role;

CREATE OR REPLACE FUNCTION app_private.prevent_agent_tool_invocation_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Agent tool invocation events are append-only';
END;
$$;

CREATE TRIGGER agent_tool_invocation_events_append_only
BEFORE UPDATE OR DELETE ON agent.agent_tool_invocation_events
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_tool_invocation_event_mutation();

CREATE OR REPLACE FUNCTION app_private.enforce_agent_tool_invocation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agent tool invocation evidence cannot be deleted';
    END IF;

    IF NEW.agent_run_id IS DISTINCT FROM OLD.agent_run_id
       OR NEW.runtime_manifest_id IS DISTINCT FROM OLD.runtime_manifest_id
       OR NEW.tool_definition_id IS DISTINCT FROM OLD.tool_definition_id
       OR NEW.tool_key IS DISTINCT FROM OLD.tool_key
       OR NEW.tool_version IS DISTINCT FROM OLD.tool_version
       OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash
       OR NEW.executor_key IS DISTINCT FROM OLD.executor_key
       OR NEW.read_only IS DISTINCT FROM OLD.read_only
       OR NEW.idempotent IS DISTINCT FROM OLD.idempotent
       OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.approval_interrupt_id IS DISTINCT FROM OLD.approval_interrupt_id
       OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION 'Agent tool invocation authority fields are immutable';
    END IF;

    IF OLD.status = 'ADMITTED' AND NEW.status = 'ADMITTED' THEN
        IF NEW.output_hash IS DISTINCT FROM OLD.output_hash
           OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
           OR NEW.error_code IS DISTINCT FROM OLD.error_code
           OR NEW.error_summary IS DISTINCT FROM OLD.error_summary THEN
            RAISE EXCEPTION 'In-flight invocation lease updates cannot mutate terminal evidence';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status <> 'ADMITTED' OR NEW.status NOT IN ('SUCCEEDED','FAILED','REJECTED') THEN
        RAISE EXCEPTION 'Invalid agent tool invocation transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION agent.claim_compensation_tool_invocation_internal(
    p_invocation_id uuid,
    p_agent_run_id uuid,
    p_failed_tool_key text,
    p_compensation_tool_key text,
    p_expected_contract_hash text,
    p_expected_input_hash text,
    p_expected_idempotency_key text,
    p_execution_owner text,
    p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invocation agent.agent_tool_invocations%ROWTYPE;
    v_manifest agent.agent_run_runtime_manifests%ROWTYPE;
    v_failed_contract jsonb;
    v_compensation_contract jsonb;
    v_is_replay_safe boolean;
    v_reclaimed boolean;
    v_generation bigint;
BEGIN
    IF p_execution_owner IS NULL OR length(trim(p_execution_owner)) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'Compensation execution owner is required';
    END IF;
    IF p_lease_seconds < 10 OR p_lease_seconds > 3600 THEN
        RAISE EXCEPTION 'Compensation lease duration must be between 10 and 3600 seconds';
    END IF;
    IF p_expected_contract_hash !~ '^sha256:[0-9a-f]{64}$' OR p_expected_input_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Compensation claim requires canonical sha256 pins';
    END IF;
    IF p_expected_idempotency_key IS NULL OR length(trim(p_expected_idempotency_key)) = 0 THEN
        RAISE EXCEPTION 'Compensation claim requires the original idempotency key';
    END IF;

    SELECT i.* INTO v_invocation
    FROM agent.agent_tool_invocations i
    WHERE i.id = p_invocation_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compensation invocation not found'; END IF;

    IF v_invocation.agent_run_id IS DISTINCT FROM p_agent_run_id
       OR v_invocation.tool_key IS DISTINCT FROM trim(p_compensation_tool_key)
       OR v_invocation.input_hash IS DISTINCT FROM lower(trim(p_expected_input_hash))
       OR v_invocation.idempotency_key IS DISTINCT FROM trim(p_expected_idempotency_key) THEN
        RAISE EXCEPTION 'Compensation invocation identity mismatch';
    END IF;

    SELECT m.* INTO v_manifest
    FROM agent.agent_run_runtime_manifests m
    WHERE m.id = v_invocation.runtime_manifest_id
      AND m.agent_run_id = p_agent_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pinned compensation runtime manifest is unavailable'; END IF;

    v_failed_contract := v_manifest.tool_contracts -> trim(p_failed_tool_key);
    v_compensation_contract := v_manifest.tool_contracts -> trim(p_compensation_tool_key);
    IF v_failed_contract IS NULL OR v_compensation_contract IS NULL THEN
        INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
        VALUES(v_invocation.id,v_invocation.agent_run_id,'COMPENSATION_REPLAY_BLOCKED_CONTRACT_DRIFT',v_invocation.execution_generation,trim(p_execution_owner),'Pinned failed or compensation contract is missing');
        RETURN jsonb_build_object('claimed',false,'reason','CONTRACT_DRIFT','status',v_invocation.status);
    END IF;

    IF v_invocation.contract_hash IS DISTINCT FROM p_expected_contract_hash
       OR (v_compensation_contract->>'contract_hash') IS DISTINCT FROM p_expected_contract_hash
       OR (v_failed_contract->'execution_config'->>'compensation_tool_key') IS DISTINCT FROM trim(p_compensation_tool_key) THEN
        INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
        VALUES(v_invocation.id,v_invocation.agent_run_id,'COMPENSATION_REPLAY_BLOCKED_CONTRACT_DRIFT',v_invocation.execution_generation,trim(p_execution_owner),'Pinned compensation contract changed or no longer matches failed tool');
        RETURN jsonb_build_object('claimed',false,'reason','CONTRACT_DRIFT','status',v_invocation.status);
    END IF;

    v_is_replay_safe :=
        COALESCE((v_compensation_contract->'execution_config'->>'idempotent')::boolean,false)
        AND COALESCE((v_compensation_contract->'execution_config'->>'replay_certified')::boolean,false)
        AND NOT COALESCE((v_compensation_contract->'execution_config'->>'destructive')::boolean,false)
        AND NOT COALESCE((v_compensation_contract->'execution_config'->>'privileged')::boolean,false)
        AND NOT COALESCE((v_compensation_contract->'execution_config'->>'governance_authority_change')::boolean,false)
        AND NOT COALESCE((v_compensation_contract->'execution_config'->>'approval_required')::boolean,false)
        AND NOT COALESCE((v_compensation_contract->'execution_config'->>'requires_human_approval')::boolean,false);

    IF NOT v_is_replay_safe THEN
        INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
        VALUES(v_invocation.id,v_invocation.agent_run_id,'COMPENSATION_REPLAY_BLOCKED_UNSAFE',v_invocation.execution_generation,trim(p_execution_owner),'Pinned compensation tool is not replay-safe');
        RETURN jsonb_build_object('claimed',false,'reason','UNSAFE_REPLAY','status',v_invocation.status);
    END IF;

    IF v_invocation.status <> 'ADMITTED' THEN
        RETURN jsonb_build_object('claimed',false,'reason','TERMINAL','status',v_invocation.status,'execution_generation',v_invocation.execution_generation);
    END IF;

    IF v_invocation.execution_owner IS NOT NULL
       AND v_invocation.execution_owner IS DISTINCT FROM trim(p_execution_owner)
       AND v_invocation.execution_lease_expires_at > now() THEN
        INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
        VALUES(v_invocation.id,v_invocation.agent_run_id,'COMPENSATION_RECLAIM_ATTEMPTED',v_invocation.execution_generation,trim(p_execution_owner),'Active compensation lease blocks reclaim');
        RETURN jsonb_build_object('claimed',false,'reason','ACTIVE_LEASE','status',v_invocation.status,'execution_generation',v_invocation.execution_generation,'lease_expires_at',v_invocation.execution_lease_expires_at);
    END IF;

    v_reclaimed := v_invocation.execution_owner IS NOT NULL
        AND (v_invocation.execution_owner IS DISTINCT FROM trim(p_execution_owner) OR v_invocation.execution_lease_expires_at <= now());

    IF v_reclaimed THEN
        INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
        VALUES(v_invocation.id,v_invocation.agent_run_id,'COMPENSATION_RECLAIM_ATTEMPTED',v_invocation.execution_generation,trim(p_execution_owner),'Stale compensation lease eligible for replay-safe reclaim');
    END IF;

    UPDATE agent.agent_tool_invocations
    SET execution_owner = trim(p_execution_owner),
        execution_lease_expires_at = now() + pg_catalog.make_interval(secs => p_lease_seconds),
        execution_generation = CASE
            WHEN execution_owner IS NULL OR execution_owner IS DISTINCT FROM trim(p_execution_owner) OR execution_lease_expires_at <= now()
                THEN execution_generation + 1
            ELSE execution_generation
        END,
        reclaim_count = reclaim_count + CASE WHEN v_reclaimed THEN 1 ELSE 0 END,
        last_claimed_at = now()
    WHERE id = v_invocation.id
      AND status = 'ADMITTED'
    RETURNING execution_generation INTO v_generation;

    INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
    VALUES(
        v_invocation.id,
        v_invocation.agent_run_id,
        CASE WHEN v_reclaimed THEN 'COMPENSATION_RECLAIMED' ELSE 'COMPENSATION_CLAIMED' END,
        v_generation,
        trim(p_execution_owner),
        CASE WHEN v_reclaimed THEN 'Replay-safe stale invocation reclaimed with original idempotency key' ELSE 'Replay-safe compensation invocation claimed' END
    );

    RETURN jsonb_build_object(
        'claimed',true,
        'reclaimed',v_reclaimed,
        'status','ADMITTED',
        'invocation_id',v_invocation.id,
        'execution_generation',v_generation,
        'execution_owner',trim(p_execution_owner),
        'lease_expires_at',now() + pg_catalog.make_interval(secs => p_lease_seconds)
    );
END;
$$;

CREATE OR REPLACE FUNCTION agent.renew_compensation_tool_invocation_lease_internal(
    p_invocation_id uuid,
    p_execution_owner text,
    p_execution_generation bigint,
    p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result agent.agent_tool_invocations%ROWTYPE;
BEGIN
    IF p_lease_seconds < 10 OR p_lease_seconds > 3600 THEN RAISE EXCEPTION 'Compensation lease duration must be between 10 and 3600 seconds'; END IF;
    UPDATE agent.agent_tool_invocations
    SET execution_lease_expires_at = now() + pg_catalog.make_interval(secs => p_lease_seconds),
        last_claimed_at = now()
    WHERE id = p_invocation_id
      AND status = 'ADMITTED'
      AND execution_owner = trim(p_execution_owner)
      AND execution_generation = p_execution_generation
      AND execution_lease_expires_at > now()
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compensation invocation lease is not owned by this generation'; END IF;
    RETURN jsonb_build_object('invocation_id',v_result.id,'execution_generation',v_result.execution_generation,'lease_expires_at',v_result.execution_lease_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION agent.complete_compensation_tool_invocation_internal(
    p_invocation_id uuid,
    p_execution_owner text,
    p_execution_generation bigint,
    p_status text,
    p_output_hash text DEFAULT NULL,
    p_error_code text DEFAULT NULL,
    p_error_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invocation agent.agent_tool_invocations%ROWTYPE;
    v_status text;
BEGIN
    v_status := upper(trim(p_status));
    IF v_status NOT IN ('SUCCEEDED','FAILED') THEN RAISE EXCEPTION 'Compensation terminal status must be SUCCEEDED or FAILED'; END IF;
    IF v_status = 'SUCCEEDED' AND (p_output_hash IS NULL OR p_output_hash !~ '^sha256:[0-9a-f]{64}$') THEN
        RAISE EXCEPTION 'Successful compensation requires an output sha256 digest';
    END IF;

    SELECT i.* INTO v_invocation
    FROM agent.agent_tool_invocations i
    WHERE i.id = p_invocation_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Compensation invocation not found'; END IF;

    IF v_invocation.status <> 'ADMITTED' THEN
        RETURN jsonb_build_object('completed',false,'reason','TERMINAL','status',v_invocation.status);
    END IF;

    IF v_invocation.execution_owner IS DISTINCT FROM trim(p_execution_owner)
       OR v_invocation.execution_generation IS DISTINCT FROM p_execution_generation THEN
        INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
        VALUES(v_invocation.id,v_invocation.agent_run_id,'STALE_COMPLETION_REJECTED',p_execution_generation,trim(p_execution_owner),'Owner or execution generation no longer owns compensation invocation');
        RETURN jsonb_build_object('completed',false,'reason','STALE_GENERATION','status',v_invocation.status,'current_generation',v_invocation.execution_generation);
    END IF;

    UPDATE agent.agent_tool_invocations
    SET status = v_status,
        output_hash = CASE WHEN p_output_hash IS NULL THEN NULL ELSE lower(trim(p_output_hash)) END,
        completed_at = now(),
        error_code = CASE WHEN v_status = 'SUCCEEDED' THEN NULL ELSE COALESCE(nullif(trim(p_error_code),''),'RECOVERY_COMPENSATION_FAILED') END,
        error_summary = CASE WHEN p_error_summary IS NULL THEN NULL ELSE left(p_error_summary,2000) END,
        execution_lease_expires_at = now()
    WHERE id = v_invocation.id
      AND status = 'ADMITTED'
      AND execution_owner = trim(p_execution_owner)
      AND execution_generation = p_execution_generation;

    INSERT INTO agent.agent_tool_invocation_events(invocation_id,agent_run_id,event_type,execution_generation,execution_owner,reason)
    VALUES(v_invocation.id,v_invocation.agent_run_id,CASE WHEN v_status='SUCCEEDED' THEN 'COMPENSATION_COMPLETED' ELSE 'COMPENSATION_FAILED' END,p_execution_generation,trim(p_execution_owner),CASE WHEN v_status='SUCCEEDED' THEN 'Fenced compensation completed' ELSE left(COALESCE(p_error_summary,p_error_code,'Compensation failed'),1000) END);

    RETURN jsonb_build_object('completed',true,'status',v_status,'execution_generation',p_execution_generation);
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_agent_tool_invocation_event_mutation() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.claim_compensation_tool_invocation_internal(uuid,uuid,text,text,text,text,text,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.renew_compensation_tool_invocation_lease_internal(uuid,text,bigint,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.complete_compensation_tool_invocation_internal(uuid,text,bigint,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent.claim_compensation_tool_invocation_internal(uuid,uuid,text,text,text,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.renew_compensation_tool_invocation_lease_internal(uuid,text,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.complete_compensation_tool_invocation_internal(uuid,text,bigint,text,text,text,text) TO service_role;

COMMENT ON TABLE agent.agent_tool_invocation_events IS 'Append-only execution evidence for replay-safe compensation claim, reclaim, fencing, and terminal completion.';
COMMENT ON FUNCTION agent.claim_compensation_tool_invocation_internal(uuid,uuid,text,text,text,text,text,text,integer) IS 'Claims or reclaims only replay-certified idempotent compensation invocations while preserving the original invocation and business idempotency key.';

COMMIT;
