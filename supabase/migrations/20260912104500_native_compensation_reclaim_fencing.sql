-- Make Recovery V2 compensation execution crash-recoverable without weakening the
-- ordinary native tool invocation path. Compensation workers claim a bounded lease,
-- stale claims advance a monotonic generation, and terminal writes are fenced by the
-- exact owner/generation pair that currently owns execution.

ALTER TABLE agent.agent_tool_invocations
    ADD COLUMN compensation_generation bigint NOT NULL DEFAULT 0,
    ADD COLUMN compensation_owner_id uuid,
    ADD COLUMN compensation_lease_expires_at timestamptz;

ALTER TABLE agent.agent_tool_invocations
    DROP CONSTRAINT IF EXISTS agent_tool_invocations_status_check;

ALTER TABLE agent.agent_tool_invocations
    ADD CONSTRAINT agent_tool_invocations_status_check
    CHECK (status IN ('ADMITTED','RUNNING','SUCCEEDED','FAILED','REJECTED'));

ALTER TABLE agent.agent_tool_invocations
    ADD CONSTRAINT agent_tool_invocations_compensation_generation_check
    CHECK (compensation_generation >= 0);

ALTER TABLE agent.agent_tool_invocations
    ADD CONSTRAINT agent_tool_invocations_compensation_lease_shape_check
    CHECK (
        (compensation_generation = 0 AND compensation_owner_id IS NULL AND compensation_lease_expires_at IS NULL)
        OR
        (compensation_generation > 0 AND compensation_owner_id IS NOT NULL AND compensation_lease_expires_at IS NOT NULL)
    );

CREATE INDEX agent_tool_invocations_compensation_lease_idx
ON agent.agent_tool_invocations(compensation_lease_expires_at)
WHERE status = 'RUNNING';

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

    IF OLD.status IN ('SUCCEEDED','FAILED','REJECTED') THEN
        RAISE EXCEPTION 'Terminal agent tool invocation evidence is immutable';
    END IF;

    IF OLD.status = 'ADMITTED' AND NEW.status IN ('SUCCEEDED','FAILED','REJECTED') THEN
        IF NEW.compensation_generation IS DISTINCT FROM OLD.compensation_generation
           OR NEW.compensation_owner_id IS DISTINCT FROM OLD.compensation_owner_id
           OR NEW.compensation_lease_expires_at IS DISTINCT FROM OLD.compensation_lease_expires_at THEN
            RAISE EXCEPTION 'Ordinary tool completion cannot mutate compensation fencing metadata';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'ADMITTED' AND NEW.status = 'RUNNING' THEN
        IF OLD.compensation_generation <> 0
           OR OLD.compensation_owner_id IS NOT NULL
           OR OLD.compensation_lease_expires_at IS NOT NULL
           OR NEW.compensation_generation <> 1
           OR NEW.compensation_owner_id IS NULL
           OR NEW.compensation_lease_expires_at IS NULL
           OR NEW.compensation_lease_expires_at <= now()
           OR OLD.idempotency_key IS NULL
           OR OLD.idempotency_key NOT LIKE 'recovery:%'
           OR NEW.output_hash IS NOT NULL
           OR NEW.completed_at IS NOT NULL
           OR NEW.error_code IS NOT NULL
           OR NEW.error_summary IS NOT NULL THEN
            RAISE EXCEPTION 'Invalid initial compensation execution claim';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'RUNNING' AND NEW.status = 'RUNNING' THEN
        IF OLD.idempotency_key IS NULL OR OLD.idempotency_key NOT LIKE 'recovery:%' THEN
            RAISE EXCEPTION 'RUNNING state is reserved for governed recovery compensation';
        END IF;
        IF NEW.output_hash IS DISTINCT FROM OLD.output_hash
           OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
           OR NEW.error_code IS DISTINCT FROM OLD.error_code
           OR NEW.error_summary IS DISTINCT FROM OLD.error_summary THEN
            RAISE EXCEPTION 'Compensation lease updates cannot mutate terminal evidence';
        END IF;

        IF NEW.compensation_owner_id = OLD.compensation_owner_id THEN
            IF NEW.compensation_generation <> OLD.compensation_generation
               OR NEW.compensation_lease_expires_at < OLD.compensation_lease_expires_at THEN
                RAISE EXCEPTION 'Compensation lease renewal must preserve owner/generation and extend the lease';
            END IF;
            RETURN NEW;
        END IF;

        IF OLD.compensation_lease_expires_at > now()
           OR NEW.compensation_generation <> OLD.compensation_generation + 1
           OR NEW.compensation_owner_id IS NULL
           OR NEW.compensation_lease_expires_at IS NULL
           OR NEW.compensation_lease_expires_at <= now() THEN
            RAISE EXCEPTION 'Compensation reclaim requires an expired lease and next generation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'RUNNING' AND NEW.status IN ('SUCCEEDED','FAILED') THEN
        IF NEW.compensation_generation IS DISTINCT FROM OLD.compensation_generation
           OR NEW.compensation_owner_id IS DISTINCT FROM OLD.compensation_owner_id
           OR NEW.compensation_lease_expires_at IS DISTINCT FROM OLD.compensation_lease_expires_at THEN
            RAISE EXCEPTION 'Compensation terminal transition cannot alter fencing metadata';
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid agent tool invocation transition: % -> %', OLD.status, NEW.status;
END;
$$;

CREATE OR REPLACE FUNCTION agent.claim_compensation_tool_invocation_internal(
    p_agent_run_id uuid,
    p_invocation_id uuid,
    p_owner_id uuid,
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
    v_now timestamptz := now();
    v_lease_seconds integer;
    v_is_compensation boolean;
BEGIN
    IF p_owner_id IS NULL THEN
        RAISE EXCEPTION 'Compensation owner id is required';
    END IF;

    v_lease_seconds := COALESCE(p_lease_seconds, 120);
    IF v_lease_seconds < 15 OR v_lease_seconds > 900 THEN
        RAISE EXCEPTION 'Compensation lease must be between 15 and 900 seconds';
    END IF;

    SELECT i.* INTO v_invocation
    FROM agent.agent_tool_invocations i
    WHERE i.id = p_invocation_id
      AND i.agent_run_id = p_agent_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compensation invocation not found';
    END IF;

    SELECT m.* INTO v_manifest
    FROM agent.agent_run_runtime_manifests m
    WHERE m.id = v_invocation.runtime_manifest_id
      AND m.agent_run_id = p_agent_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compensation invocation has no pinned runtime manifest';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM jsonb_each(v_manifest.tool_contracts) AS source(tool_key, contract)
        WHERE nullif(btrim(source.contract->'execution_config'->>'compensation_tool_key'), '') = v_invocation.tool_key
    ) INTO v_is_compensation;

    IF NOT v_is_compensation
       OR v_invocation.idempotency_key IS NULL
       OR v_invocation.idempotency_key NOT LIKE 'recovery:%' THEN
        RAISE EXCEPTION 'Invocation is not a governed Recovery V2 compensation';
    END IF;

    IF v_invocation.status IN ('SUCCEEDED','FAILED','REJECTED') THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'status', v_invocation.status,
            'reason', 'TERMINAL',
            'generation', v_invocation.compensation_generation,
            'owner_id', v_invocation.compensation_owner_id,
            'lease_expires_at', v_invocation.compensation_lease_expires_at
        );
    END IF;

    IF v_invocation.status = 'ADMITTED' THEN
        UPDATE agent.agent_tool_invocations
        SET status = 'RUNNING',
            compensation_generation = 1,
            compensation_owner_id = p_owner_id,
            compensation_lease_expires_at = v_now + make_interval(secs => v_lease_seconds)
        WHERE id = v_invocation.id;

        RETURN jsonb_build_object(
            'claimed', true,
            'status', 'RUNNING',
            'reason', 'INITIAL_CLAIM',
            'generation', 1,
            'owner_id', p_owner_id,
            'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
        );
    END IF;

    IF v_invocation.status <> 'RUNNING' THEN
        RAISE EXCEPTION 'Unsupported compensation invocation state: %', v_invocation.status;
    END IF;

    IF v_invocation.compensation_owner_id = p_owner_id THEN
        UPDATE agent.agent_tool_invocations
        SET compensation_lease_expires_at = GREATEST(
            v_invocation.compensation_lease_expires_at,
            v_now + make_interval(secs => v_lease_seconds)
        )
        WHERE id = v_invocation.id;

        RETURN jsonb_build_object(
            'claimed', true,
            'status', 'RUNNING',
            'reason', 'LEASE_RENEWED',
            'generation', v_invocation.compensation_generation,
            'owner_id', p_owner_id,
            'lease_expires_at', GREATEST(
                v_invocation.compensation_lease_expires_at,
                v_now + make_interval(secs => v_lease_seconds)
            )
        );
    END IF;

    IF v_invocation.compensation_lease_expires_at > v_now THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'status', 'RUNNING',
            'reason', 'ACTIVE_LEASE',
            'generation', v_invocation.compensation_generation,
            'owner_id', v_invocation.compensation_owner_id,
            'lease_expires_at', v_invocation.compensation_lease_expires_at
        );
    END IF;

    UPDATE agent.agent_tool_invocations
    SET compensation_generation = v_invocation.compensation_generation + 1,
        compensation_owner_id = p_owner_id,
        compensation_lease_expires_at = v_now + make_interval(secs => v_lease_seconds)
    WHERE id = v_invocation.id;

    RETURN jsonb_build_object(
        'claimed', true,
        'status', 'RUNNING',
        'reason', 'STALE_LEASE_RECLAIMED',
        'generation', v_invocation.compensation_generation + 1,
        'owner_id', p_owner_id,
        'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
    );
END;
$$;

CREATE OR REPLACE FUNCTION agent.complete_compensation_tool_invocation_internal(
    p_invocation_id uuid,
    p_owner_id uuid,
    p_generation bigint,
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
    IF v_status NOT IN ('SUCCEEDED','FAILED') THEN
        RAISE EXCEPTION 'Compensation terminal status must be SUCCEEDED or FAILED';
    END IF;
    IF p_owner_id IS NULL OR p_generation IS NULL OR p_generation <= 0 THEN
        RAISE EXCEPTION 'Compensation completion requires owner and positive generation';
    END IF;
    IF v_status = 'SUCCEEDED' AND (p_output_hash IS NULL OR p_output_hash !~ '^sha256:[0-9a-f]{64}$') THEN
        RAISE EXCEPTION 'Successful compensation requires an output sha256 digest';
    END IF;
    IF p_output_hash IS NOT NULL AND p_output_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Output hash must be a sha256 digest';
    END IF;

    SELECT i.* INTO v_invocation
    FROM agent.agent_tool_invocations i
    WHERE i.id = p_invocation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compensation invocation not found';
    END IF;

    IF v_invocation.compensation_owner_id IS DISTINCT FROM p_owner_id
       OR v_invocation.compensation_generation IS DISTINCT FROM p_generation THEN
        RAISE EXCEPTION 'COMPENSATION_FENCED: owner or generation was superseded';
    END IF;

    IF v_invocation.status IN ('SUCCEEDED','FAILED') THEN
        RETURN jsonb_build_object(
            'status', v_invocation.status,
            'replayed', true,
            'generation', v_invocation.compensation_generation
        );
    END IF;

    IF v_invocation.status <> 'RUNNING' THEN
        RAISE EXCEPTION 'Compensation invocation is not running';
    END IF;

    UPDATE agent.agent_tool_invocations
    SET status = v_status,
        output_hash = CASE WHEN p_output_hash IS NULL THEN NULL ELSE lower(trim(p_output_hash)) END,
        completed_at = now(),
        error_code = CASE WHEN v_status = 'SUCCEEDED' THEN NULL ELSE nullif(trim(p_error_code), '') END,
        error_summary = CASE WHEN p_error_summary IS NULL THEN NULL ELSE left(p_error_summary, 2000) END
    WHERE id = p_invocation_id
      AND status = 'RUNNING'
      AND compensation_owner_id = p_owner_id
      AND compensation_generation = p_generation;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMPENSATION_FENCED: execution claim changed before completion';
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'replayed', false,
        'generation', p_generation
    );
END;
$$;

REVOKE ALL ON FUNCTION agent.claim_compensation_tool_invocation_internal(uuid,uuid,uuid,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.complete_compensation_tool_invocation_internal(uuid,uuid,bigint,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent.claim_compensation_tool_invocation_internal(uuid,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.complete_compensation_tool_invocation_internal(uuid,uuid,bigint,text,text,text,text) TO service_role;

-- Migration-time structural certification. These assertions do not fabricate runtime data.
DO $block$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'agent.agent_tool_invocations'::regclass
          AND conname = 'agent_tool_invocations_status_check'
          AND pg_get_constraintdef(oid) LIKE '%RUNNING%'
    ) THEN
        RAISE EXCEPTION 'Compensation fencing migration failed to enable RUNNING state';
    END IF;

    IF NOT has_function_privilege('service_role', 'agent.claim_compensation_tool_invocation_internal(uuid,uuid,uuid,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'agent.claim_compensation_tool_invocation_internal(uuid,uuid,uuid,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Compensation claim RPC privilege boundary is incorrect';
    END IF;

    IF NOT has_function_privilege('service_role', 'agent.complete_compensation_tool_invocation_internal(uuid,uuid,bigint,text,text,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'agent.complete_compensation_tool_invocation_internal(uuid,uuid,bigint,text,text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Compensation completion RPC privilege boundary is incorrect';
    END IF;
END;
$block$;
