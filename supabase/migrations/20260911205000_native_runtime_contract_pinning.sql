BEGIN;

-- Native runtime contract pinning.
-- Full behavior snapshots are service-only because they contain system prompts and
-- execution configuration. Public/project-readable evidence stores hashes only.

CREATE TABLE agent.agent_run_runtime_manifests
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id uuid NOT NULL UNIQUE
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,
    agent_definition_id uuid NOT NULL
        REFERENCES agent.agent_definitions(id),
    agent_key text NOT NULL,
    agent_version text NOT NULL,
    runtime_version text NOT NULL,
    definition_snapshot jsonb NOT NULL,
    definition_hash text NOT NULL,
    tool_contracts jsonb NOT NULL,
    tool_contract_set_hash text NOT NULL,
    manifest_hash text NOT NULL,
    replay_source_manifest_id uuid
        REFERENCES agent.agent_run_runtime_manifests(id),
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_run_runtime_manifests_definition_hash_check
        CHECK (definition_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_runtime_manifests_tool_hash_check
        CHECK (tool_contract_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_runtime_manifests_manifest_hash_check
        CHECK (manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_runtime_manifests_runtime_version_check
        CHECK (length(trim(runtime_version)) BETWEEN 1 AND 200),
    CONSTRAINT agent_run_runtime_manifests_agent_version_check
        CHECK (length(trim(agent_version)) BETWEEN 1 AND 100),
    CONSTRAINT agent_run_runtime_manifests_tool_contracts_check
        CHECK (jsonb_typeof(tool_contracts) = 'object')
);

CREATE INDEX agent_run_runtime_manifests_definition_idx
ON agent.agent_run_runtime_manifests(agent_definition_id, created_at DESC);

CREATE INDEX agent_run_runtime_manifests_replay_source_idx
ON agent.agent_run_runtime_manifests(replay_source_manifest_id)
WHERE replay_source_manifest_id IS NOT NULL;

CREATE TABLE agent.agent_tool_invocations
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,
    runtime_manifest_id uuid NOT NULL
        REFERENCES agent.agent_run_runtime_manifests(id),
    tool_definition_id uuid NOT NULL
        REFERENCES agent.tool_definitions(id),
    tool_key text NOT NULL,
    tool_version text NOT NULL,
    contract_hash text NOT NULL,
    executor_key text NOT NULL,
    read_only boolean NOT NULL,
    idempotent boolean NOT NULL,
    input_hash text NOT NULL,
    output_hash text,
    status text NOT NULL DEFAULT 'ADMITTED',
    idempotency_key text,
    approval_interrupt_id uuid
        REFERENCES agent.agent_run_interrupts(id),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    error_code text,
    error_summary text,

    CONSTRAINT agent_tool_invocations_status_check
        CHECK (status IN ('ADMITTED','SUCCEEDED','FAILED','REJECTED')),
    CONSTRAINT agent_tool_invocations_contract_hash_check
        CHECK (contract_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_tool_invocations_input_hash_check
        CHECK (input_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_tool_invocations_output_hash_check
        CHECK (output_hash IS NULL OR output_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_tool_invocations_terminal_shape_check
        CHECK (
            (status = 'ADMITTED' AND completed_at IS NULL AND output_hash IS NULL AND error_code IS NULL)
            OR (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND output_hash IS NOT NULL AND error_code IS NULL)
            OR (status IN ('FAILED','REJECTED') AND completed_at IS NOT NULL)
        ),
    CONSTRAINT agent_tool_invocations_error_summary_check
        CHECK (error_summary IS NULL OR length(error_summary) <= 2000)
);

CREATE UNIQUE INDEX agent_tool_invocations_idempotency_idx
ON agent.agent_tool_invocations(agent_run_id, tool_key, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX agent_tool_invocations_run_started_idx
ON agent.agent_tool_invocations(agent_run_id, started_at DESC);

CREATE INDEX agent_tool_invocations_manifest_idx
ON agent.agent_tool_invocations(runtime_manifest_id, started_at DESC);

CREATE INDEX agent_tool_invocations_approval_idx
ON agent.agent_tool_invocations(approval_interrupt_id)
WHERE approval_interrupt_id IS NOT NULL;

ALTER TABLE agent.agent_run_runtime_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent.agent_tool_invocations ENABLE ROW LEVEL SECURITY;

-- Full manifests intentionally have no browser SELECT policy or grant.
-- They include behavior-defining system prompts/configuration and are runtime-private.
REVOKE ALL ON agent.agent_run_runtime_manifests FROM public, anon, authenticated;
GRANT ALL ON agent.agent_run_runtime_manifests TO service_role;

CREATE POLICY agent_tool_invocations_project_read
ON agent.agent_tool_invocations
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_tool_invocations.agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);

REVOKE ALL ON agent.agent_tool_invocations FROM public, anon, authenticated;
GRANT SELECT ON agent.agent_tool_invocations TO authenticated;
GRANT ALL ON agent.agent_tool_invocations TO service_role;

CREATE OR REPLACE FUNCTION app_private.prevent_agent_runtime_manifest_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Agent runtime manifests are immutable';
END;
$$;

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

    IF OLD.status <> 'ADMITTED' OR NEW.status NOT IN ('SUCCEEDED','FAILED','REJECTED') THEN
        RAISE EXCEPTION 'Invalid agent tool invocation transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_agent_runtime_manifest_mutation() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.enforce_agent_tool_invocation_transition() FROM public, anon, authenticated;

CREATE TRIGGER agent_run_runtime_manifests_append_only
BEFORE UPDATE OR DELETE ON agent.agent_run_runtime_manifests
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_runtime_manifest_mutation();

CREATE TRIGGER agent_tool_invocations_transition_guard
BEFORE UPDATE OR DELETE ON agent.agent_tool_invocations
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_agent_tool_invocation_transition();

CREATE OR REPLACE FUNCTION agent.ensure_runtime_manifest_internal(
    p_agent_run_id uuid,
    p_runtime_version text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing agent.agent_run_runtime_manifests%ROWTYPE;
    v_run agent.agent_runs%ROWTYPE;
    v_definition agent.agent_definitions%ROWTYPE;
    v_definition_snapshot jsonb;
    v_tool_contracts jsonb;
    v_definition_hash text;
    v_tool_contract_set_hash text;
    v_manifest_hash text;
    v_manifest_id uuid;
    v_runtime_version text;
    v_duplicate_enabled_tool text;
BEGIN
    v_runtime_version := trim(COALESCE(p_runtime_version, ''));
    IF length(v_runtime_version) = 0 OR length(v_runtime_version) > 200 THEN
        RAISE EXCEPTION 'A bounded runtime version is required';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_agent_run_id::text, 41));

    SELECT m.* INTO v_existing
    FROM agent.agent_run_runtime_manifests m
    WHERE m.agent_run_id = p_agent_run_id;
    IF FOUND THEN
        IF v_existing.runtime_version IS DISTINCT FROM v_runtime_version THEN
            RAISE EXCEPTION 'Runtime version drift: run is pinned to %, current runtime is %', v_existing.runtime_version, v_runtime_version;
        END IF;
        RETURN v_existing.id;
    END IF;

    SELECT r.* INTO v_run
    FROM agent.agent_runs r
    WHERE r.id = p_agent_run_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;

    SELECT d.* INTO v_definition
    FROM agent.agent_definitions d
    WHERE d.id = v_run.agent_definition_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent definition not found';
    END IF;
    IF NOT v_definition.enabled THEN
        RAISE EXCEPTION 'Agent definition is disabled';
    END IF;

    SELECT t.tool_key INTO v_duplicate_enabled_tool
    FROM agent.tool_definitions t
    WHERE t.agent_definition_id = v_run.agent_definition_id
      AND t.enabled
    GROUP BY t.tool_key
    HAVING count(*) > 1
    LIMIT 1;
    IF v_duplicate_enabled_tool IS NOT NULL THEN
        RAISE EXCEPTION 'Multiple enabled versions exist for tool %', v_duplicate_enabled_tool;
    END IF;

    v_definition_snapshot := jsonb_build_object(
        'id', v_definition.id,
        'agent_key', v_definition.agent_key,
        'name', v_definition.name,
        'description', v_definition.description,
        'version', v_definition.version,
        'system_prompt', v_definition.system_prompt,
        'configuration', v_definition.configuration
    );

    SELECT COALESCE(jsonb_object_agg(x.tool_key, x.contract ORDER BY x.tool_key), '{}'::jsonb)
    INTO v_tool_contracts
    FROM (
        SELECT t.tool_key,
               jsonb_build_object(
                   'tool_definition_id', t.id,
                   'tool_key', t.tool_key,
                   'name', t.name,
                   'description', t.description,
                   'version', t.version,
                   'input_schema', t.input_schema,
                   'output_schema', t.output_schema,
                   'execution_config', t.execution_config,
                   'contract_hash', 'sha256:' || pg_catalog.encode(
                       extensions.digest(
                           jsonb_build_object(
                               'tool_definition_id', t.id,
                               'tool_key', t.tool_key,
                               'version', t.version,
                               'input_schema', t.input_schema,
                               'output_schema', t.output_schema,
                               'execution_config', t.execution_config
                           )::text,
                           'sha256'
                       ),
                       'hex'
                   )
               ) AS contract
        FROM agent.tool_definitions t
        WHERE t.agent_definition_id = v_run.agent_definition_id
          AND t.enabled
    ) x;

    v_definition_hash := 'sha256:' || pg_catalog.encode(extensions.digest(v_definition_snapshot::text, 'sha256'), 'hex');
    v_tool_contract_set_hash := 'sha256:' || pg_catalog.encode(extensions.digest(v_tool_contracts::text, 'sha256'), 'hex');
    v_manifest_hash := 'sha256:' || pg_catalog.encode(
        extensions.digest(
            jsonb_build_object(
                'contract_version', '1.0',
                'agent_definition_id', v_definition.id,
                'agent_key', v_definition.agent_key,
                'agent_version', v_definition.version,
                'runtime_version', v_runtime_version,
                'definition_hash', v_definition_hash,
                'tool_contract_set_hash', v_tool_contract_set_hash
            )::text,
            'sha256'
        ),
        'hex'
    );

    INSERT INTO agent.agent_run_runtime_manifests (
        agent_run_id, agent_definition_id, agent_key, agent_version, runtime_version,
        definition_snapshot, definition_hash, tool_contracts, tool_contract_set_hash, manifest_hash
    ) VALUES (
        p_agent_run_id, v_definition.id, v_definition.agent_key, v_definition.version, v_runtime_version,
        v_definition_snapshot, v_definition_hash, v_tool_contracts, v_tool_contract_set_hash, v_manifest_hash
    ) RETURNING id INTO v_manifest_id;

    RETURN v_manifest_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent.copy_runtime_manifest_internal(
    p_source_agent_run_id uuid,
    p_target_agent_run_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source agent.agent_run_runtime_manifests%ROWTYPE;
    v_target_run agent.agent_runs%ROWTYPE;
    v_existing agent.agent_run_runtime_manifests%ROWTYPE;
    v_manifest_id uuid;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target_agent_run_id::text, 41));

    SELECT m.* INTO v_existing
    FROM agent.agent_run_runtime_manifests m
    WHERE m.agent_run_id = p_target_agent_run_id;
    IF FOUND THEN
        RETURN v_existing.id;
    END IF;

    SELECT m.* INTO v_source
    FROM agent.agent_run_runtime_manifests m
    WHERE m.agent_run_id = p_source_agent_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source agent run has no pinned runtime manifest';
    END IF;

    SELECT r.* INTO v_target_run
    FROM agent.agent_runs r
    WHERE r.id = p_target_agent_run_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target agent run not found';
    END IF;
    IF v_target_run.agent_definition_id IS DISTINCT FROM v_source.agent_definition_id THEN
        RAISE EXCEPTION 'Replay target definition does not match pinned source definition';
    END IF;

    INSERT INTO agent.agent_run_runtime_manifests (
        agent_run_id, agent_definition_id, agent_key, agent_version, runtime_version,
        definition_snapshot, definition_hash, tool_contracts, tool_contract_set_hash,
        manifest_hash, replay_source_manifest_id
    ) VALUES (
        p_target_agent_run_id, v_source.agent_definition_id, v_source.agent_key, v_source.agent_version,
        v_source.runtime_version, v_source.definition_snapshot, v_source.definition_hash,
        v_source.tool_contracts, v_source.tool_contract_set_hash, v_source.manifest_hash, v_source.id
    ) RETURNING id INTO v_manifest_id;

    RETURN v_manifest_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent.admit_tool_invocation_internal(
    p_agent_run_id uuid,
    p_tool_key text,
    p_expected_executor text,
    p_input_hash text,
    p_idempotency_key text DEFAULT NULL,
    p_approval_interrupt_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_run agent.agent_runs%ROWTYPE;
    v_manifest agent.agent_run_runtime_manifests%ROWTYPE;
    v_contract jsonb;
    v_tool_definition_id uuid;
    v_tool_version text;
    v_contract_hash text;
    v_executor_key text;
    v_read_only boolean;
    v_idempotent boolean;
    v_approval_required boolean;
    v_interrupt agent.agent_run_interrupts%ROWTYPE;
    v_existing agent.agent_tool_invocations%ROWTYPE;
    v_invocation_id uuid;
BEGIN
    IF p_tool_key IS NULL OR length(trim(p_tool_key)) = 0 THEN
        RAISE EXCEPTION 'Tool key is required';
    END IF;
    IF p_expected_executor IS NULL OR length(trim(p_expected_executor)) = 0 THEN
        RAISE EXCEPTION 'Expected executor is required';
    END IF;
    IF p_input_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Input hash must be a sha256 digest';
    END IF;

    SELECT r.* INTO v_run
    FROM agent.agent_runs r
    WHERE r.id = p_agent_run_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;
    IF v_run.status <> 'RUNNING'::agent.run_status THEN
        RAISE EXCEPTION 'Agent run must be RUNNING before tool admission';
    END IF;

    SELECT m.* INTO v_manifest
    FROM agent.agent_run_runtime_manifests m
    WHERE m.agent_run_id = p_agent_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run has no pinned runtime manifest';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM agent.agent_definitions d
        WHERE d.id = v_manifest.agent_definition_id AND d.enabled
    ) THEN
        RAISE EXCEPTION 'Pinned agent definition is currently disabled';
    END IF;

    v_contract := v_manifest.tool_contracts -> trim(p_tool_key);
    IF v_contract IS NULL THEN
        RAISE EXCEPTION 'Tool % is not pinned to this agent run', trim(p_tool_key);
    END IF;

    v_tool_definition_id := (v_contract->>'tool_definition_id')::uuid;
    v_tool_version := v_contract->>'version';
    v_contract_hash := v_contract->>'contract_hash';
    v_executor_key := v_contract->'execution_config'->>'executor';
    v_read_only := COALESCE((v_contract->'execution_config'->>'read_only')::boolean, false);
    v_idempotent := COALESCE((v_contract->'execution_config'->>'idempotent')::boolean, false);
    v_approval_required := COALESCE(
        (v_contract->'execution_config'->>'approval_required')::boolean,
        (v_contract->'execution_config'->>'requires_human_approval')::boolean,
        false
    );

    IF v_executor_key IS NULL OR v_executor_key IS DISTINCT FROM trim(p_expected_executor) THEN
        RAISE EXCEPTION 'Pinned executor does not match the requested executor';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM agent.tool_definitions t
        WHERE t.id = v_tool_definition_id AND t.enabled
    ) THEN
        RAISE EXCEPTION 'Pinned tool has been administratively disabled';
    END IF;

    -- Non-idempotent side effects fail closed unless the tool contract explicitly
    -- requires approval and an idempotency key protects duplicate admission.
    IF NOT v_read_only AND NOT v_idempotent THEN
        IF NOT v_approval_required THEN
            RAISE EXCEPTION 'Native runtime rejects non-idempotent side effects without explicit approval_required';
        END IF;
        IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
            RAISE EXCEPTION 'Non-idempotent side effects require an idempotency key';
        END IF;
    END IF;

    IF v_approval_required THEN
        IF p_approval_interrupt_id IS NULL THEN
            RAISE EXCEPTION 'This pinned tool requires an approved human interrupt';
        END IF;
        SELECT i.* INTO v_interrupt
        FROM agent.agent_run_interrupts i
        WHERE i.id = p_approval_interrupt_id
          AND i.agent_run_id = p_agent_run_id;
        IF NOT FOUND
           OR v_interrupt.status NOT IN ('RESOLVED','RESUMED')
           OR v_interrupt.decision <> 'APPROVED'
           OR v_interrupt.action_key IS DISTINCT FROM trim(p_tool_key)
           OR v_interrupt.action_payload_hash IS DISTINCT FROM p_input_hash THEN
            RAISE EXCEPTION 'Tool approval does not match the exact pinned invocation';
        END IF;
    ELSIF p_approval_interrupt_id IS NOT NULL THEN
        RAISE EXCEPTION 'Approval interrupt supplied for a tool that does not require approval';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT i.* INTO v_existing
        FROM agent.agent_tool_invocations i
        WHERE i.agent_run_id = p_agent_run_id
          AND i.tool_key = trim(p_tool_key)
          AND i.idempotency_key = trim(p_idempotency_key);
        IF FOUND THEN
            IF v_existing.contract_hash IS DISTINCT FROM v_contract_hash
               OR v_existing.input_hash IS DISTINCT FROM p_input_hash
               OR v_existing.approval_interrupt_id IS DISTINCT FROM p_approval_interrupt_id THEN
                RAISE EXCEPTION 'Tool invocation idempotency key collision';
            END IF;
            RETURN jsonb_build_object(
                'invocation_id', v_existing.id,
                'status', v_existing.status,
                'reused', true,
                'contract', v_contract
            );
        END IF;
    END IF;

    INSERT INTO agent.agent_tool_invocations (
        agent_run_id, runtime_manifest_id, tool_definition_id, tool_key, tool_version,
        contract_hash, executor_key, read_only, idempotent, input_hash,
        idempotency_key, approval_interrupt_id
    ) VALUES (
        p_agent_run_id, v_manifest.id, v_tool_definition_id, trim(p_tool_key), v_tool_version,
        v_contract_hash, v_executor_key, v_read_only, v_idempotent, p_input_hash,
        CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE trim(p_idempotency_key) END,
        p_approval_interrupt_id
    ) RETURNING id INTO v_invocation_id;

    RETURN jsonb_build_object(
        'invocation_id', v_invocation_id,
        'status', 'ADMITTED',
        'reused', false,
        'contract', v_contract
    );
END;
$$;

CREATE OR REPLACE FUNCTION agent.complete_tool_invocation_internal(
    p_invocation_id uuid,
    p_status text,
    p_output_hash text DEFAULT NULL,
    p_error_code text DEFAULT NULL,
    p_error_summary text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status text;
BEGIN
    v_status := upper(trim(p_status));
    IF v_status NOT IN ('SUCCEEDED','FAILED','REJECTED') THEN
        RAISE EXCEPTION 'Tool invocation terminal status must be SUCCEEDED, FAILED, or REJECTED';
    END IF;
    IF v_status = 'SUCCEEDED' AND (p_output_hash IS NULL OR p_output_hash !~ '^sha256:[0-9a-f]{64}$') THEN
        RAISE EXCEPTION 'Successful tool invocation requires an output sha256 digest';
    END IF;
    IF p_output_hash IS NOT NULL AND p_output_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Output hash must be a sha256 digest';
    END IF;

    UPDATE agent.agent_tool_invocations
    SET status = v_status,
        output_hash = CASE WHEN p_output_hash IS NULL THEN NULL ELSE lower(trim(p_output_hash)) END,
        completed_at = now(),
        error_code = CASE WHEN v_status = 'SUCCEEDED' THEN NULL ELSE nullif(trim(p_error_code), '') END,
        error_summary = CASE WHEN p_error_summary IS NULL THEN NULL ELSE left(p_error_summary, 2000) END
    WHERE id = p_invocation_id
      AND status = 'ADMITTED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tool invocation not found or already terminal';
    END IF;
END;
$$;

-- Upgrade pause/resume/replay so native long-lived execution always has a pinned
-- manifest and exact replay carries the same behavior contract forward.
CREATE OR REPLACE FUNCTION agent.request_runtime_interrupt_internal(
    p_agent_run_id uuid,
    p_interrupt_type text,
    p_request_summary text,
    p_state_version text,
    p_state jsonb,
    p_action_key text DEFAULT NULL,
    p_action_payload_hash text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL,
    p_expires_at timestamptz DEFAULT NULL,
    p_step_name text DEFAULT NULL,
    p_step_order integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing agent.agent_run_interrupts%ROWTYPE;
    v_existing_state_hash text;
    v_requested_state_hash text;
    v_run_status agent.run_status;
    v_checkpoint_id uuid;
    v_interrupt_id uuid;
    v_interrupt_type text;
    v_action_payload_hash text;
BEGIN
    v_interrupt_type := upper(trim(p_interrupt_type));
    v_action_payload_hash := CASE WHEN p_action_payload_hash IS NULL THEN NULL ELSE lower(trim(p_action_payload_hash)) END;
    v_requested_state_hash := 'sha256:' || pg_catalog.encode(extensions.digest(p_state::text, 'sha256'), 'hex');

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_agent_run_id::text, 0));

    IF NOT EXISTS (SELECT 1 FROM agent.agent_run_runtime_manifests m WHERE m.agent_run_id = p_agent_run_id) THEN
        RAISE EXCEPTION 'Agent run must have a pinned runtime manifest before an interrupt can be requested';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT i.* INTO v_existing
        FROM agent.agent_run_interrupts i
        WHERE i.agent_run_id = p_agent_run_id
          AND i.idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT c.state_hash INTO v_existing_state_hash
            FROM agent.agent_run_checkpoints c
            WHERE c.id = v_existing.checkpoint_id;

            IF v_existing.interrupt_type IS DISTINCT FROM v_interrupt_type
               OR v_existing.request_summary IS DISTINCT FROM trim(p_request_summary)
               OR v_existing.action_key IS DISTINCT FROM p_action_key
               OR v_existing.action_payload_hash IS DISTINCT FROM v_action_payload_hash
               OR v_existing.expires_at IS DISTINCT FROM p_expires_at
               OR v_existing_state_hash IS DISTINCT FROM v_requested_state_hash THEN
                RAISE EXCEPTION 'Interrupt idempotency key collision';
            END IF;
            RETURN v_existing.id;
        END IF;
    END IF;

    SELECT r.status INTO v_run_status
    FROM agent.agent_runs r
    WHERE r.id = p_agent_run_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agent run not found'; END IF;
    IF v_run_status <> 'RUNNING'::agent.run_status THEN
        RAISE EXCEPTION 'Agent run must be RUNNING before an interrupt can be requested';
    END IF;

    v_checkpoint_id := agent.create_runtime_checkpoint_internal(
        p_agent_run_id, 'PAUSE', p_state_version, p_state, NULL, NULL, p_step_name, p_step_order
    );

    INSERT INTO agent.agent_run_interrupts (
        agent_run_id, checkpoint_id, interrupt_type, request_summary,
        action_key, action_payload_hash, idempotency_key, expires_at
    ) VALUES (
        p_agent_run_id, v_checkpoint_id, v_interrupt_type, trim(p_request_summary),
        p_action_key, v_action_payload_hash, p_idempotency_key, p_expires_at
    ) RETURNING id INTO v_interrupt_id;

    UPDATE agent.agent_runs SET status = 'WAITING'::agent.run_status WHERE id = p_agent_run_id;
    RETURN v_interrupt_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent.resume_runtime_interrupt_internal(
    p_interrupt_id uuid,
    p_state_version text,
    p_state jsonb,
    p_step_name text DEFAULT NULL,
    p_step_order integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_interrupt agent.agent_run_interrupts%ROWTYPE;
    v_run_status agent.run_status;
    v_checkpoint_id uuid;
BEGIN
    SELECT i.* INTO v_interrupt
    FROM agent.agent_run_interrupts i
    WHERE i.id = p_interrupt_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agent runtime interrupt not found'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM agent.agent_run_runtime_manifests m
        WHERE m.agent_run_id = v_interrupt.agent_run_id
    ) THEN
        RAISE EXCEPTION 'Agent run has no pinned runtime manifest';
    END IF;

    SELECT r.status INTO v_run_status
    FROM agent.agent_runs r
    WHERE r.id = v_interrupt.agent_run_id
    FOR UPDATE;

    IF v_interrupt.status <> 'RESOLVED' OR v_interrupt.decision IS NULL THEN
        RAISE EXCEPTION 'Agent runtime interrupt must have a human decision before resume';
    END IF;
    IF v_run_status <> 'WAITING'::agent.run_status THEN
        RAISE EXCEPTION 'Agent run must be WAITING before resume';
    END IF;

    v_checkpoint_id := agent.create_runtime_checkpoint_internal(
        v_interrupt.agent_run_id, 'RESUME', p_state_version, p_state,
        v_interrupt.checkpoint_id, NULL, p_step_name, p_step_order
    );

    UPDATE agent.agent_run_interrupts SET status = 'RESUMED', resumed_at = now() WHERE id = p_interrupt_id;
    UPDATE agent.agent_runs SET status = 'RUNNING'::agent.run_status WHERE id = v_interrupt.agent_run_id;
    RETURN v_checkpoint_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent.create_runtime_replay_internal(
    p_source_agent_run_id uuid,
    p_source_checkpoint_id uuid,
    p_reason text,
    p_idempotency_key text DEFAULT NULL,
    p_requested_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing agent.agent_run_replays%ROWTYPE;
    v_source_run agent.agent_runs%ROWTYPE;
    v_source_checkpoint agent.agent_run_checkpoints%ROWTYPE;
    v_replay_run_id uuid;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_source_agent_run_id::text, 0));

    IF NOT EXISTS (
        SELECT 1 FROM agent.agent_run_runtime_manifests m
        WHERE m.agent_run_id = p_source_agent_run_id
    ) THEN
        RAISE EXCEPTION 'Source agent run has no pinned runtime manifest and cannot be replayed exactly';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT r.* INTO v_existing
        FROM agent.agent_run_replays r
        WHERE r.source_agent_run_id = p_source_agent_run_id
          AND r.idempotency_key = p_idempotency_key;
        IF FOUND THEN
            IF v_existing.source_checkpoint_id IS DISTINCT FROM p_source_checkpoint_id
               OR v_existing.reason IS DISTINCT FROM trim(p_reason)
               OR v_existing.requested_by IS DISTINCT FROM p_requested_by THEN
                RAISE EXCEPTION 'Replay idempotency key collision';
            END IF;
            RETURN v_existing.replay_agent_run_id;
        END IF;
    END IF;

    SELECT r.* INTO v_source_run FROM agent.agent_runs r WHERE r.id = p_source_agent_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source agent run not found'; END IF;

    SELECT c.* INTO v_source_checkpoint
    FROM agent.agent_run_checkpoints c
    WHERE c.id = p_source_checkpoint_id AND c.agent_run_id = p_source_agent_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Replay checkpoint is outside the source run'; END IF;

    INSERT INTO agent.agent_runs (
        agent_definition_id, project_id, dataset_id, dataset_version_id,
        parent_run_id, correlation_id, status, input
    ) VALUES (
        v_source_run.agent_definition_id, v_source_run.project_id, v_source_run.dataset_id,
        v_source_run.dataset_version_id, v_source_run.id, v_source_run.correlation_id,
        'CREATED'::agent.run_status, v_source_run.input
    ) RETURNING id INTO v_replay_run_id;

    PERFORM agent.copy_runtime_manifest_internal(p_source_agent_run_id, v_replay_run_id);

    PERFORM agent.create_runtime_checkpoint_internal(
        v_replay_run_id, 'REPLAY_SOURCE', v_source_checkpoint.state_version,
        v_source_checkpoint.state, NULL, v_source_checkpoint.id,
        v_source_checkpoint.step_name, v_source_checkpoint.step_order
    );

    INSERT INTO agent.agent_run_replays (
        source_agent_run_id, source_checkpoint_id, replay_agent_run_id,
        reason, idempotency_key, requested_by
    ) VALUES (
        p_source_agent_run_id, p_source_checkpoint_id, v_replay_run_id,
        trim(p_reason), p_idempotency_key, p_requested_by
    );

    RETURN v_replay_run_id;
END;
$$;

REVOKE ALL ON FUNCTION agent.ensure_runtime_manifest_internal(uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.copy_runtime_manifest_internal(uuid,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.admit_tool_invocation_internal(uuid,text,text,text,text,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.complete_tool_invocation_internal(uuid,text,text,text,text) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION agent.ensure_runtime_manifest_internal(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION agent.copy_runtime_manifest_internal(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.admit_tool_invocation_internal(uuid,text,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.complete_tool_invocation_internal(uuid,text,text,text,text) TO service_role;

-- Preserve service-only mutation boundary on replaced functions.
REVOKE ALL ON FUNCTION agent.request_runtime_interrupt_internal(uuid,text,text,text,jsonb,text,text,text,timestamptz,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.resume_runtime_interrupt_internal(uuid,text,jsonb,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.create_runtime_replay_internal(uuid,uuid,text,text,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent.request_runtime_interrupt_internal(uuid,text,text,text,jsonb,text,text,text,timestamptz,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.resume_runtime_interrupt_internal(uuid,text,jsonb,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.create_runtime_replay_internal(uuid,uuid,text,text,uuid) TO service_role;

COMMENT ON TABLE agent.agent_run_runtime_manifests IS 'Private immutable per-run snapshot of behavior-defining agent and tool contracts, including exact runtime version. Never exposed to browser roles.';
COMMENT ON TABLE agent.agent_tool_invocations IS 'Hash-only governed tool invocation evidence. Raw tool input/output are intentionally not persisted here.';

COMMIT;
