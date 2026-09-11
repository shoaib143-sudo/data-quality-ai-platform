BEGIN;

-- Native agent runtime state foundation.
-- Canonical business-job authority remains in orchestration.durable_jobs.
-- These tables persist agent reasoning/execution state only; they must never contain
-- hidden chain-of-thought, credentials, raw secrets, or become mutation authority.

CREATE TABLE agent.agent_run_checkpoints
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,
    checkpoint_seq integer NOT NULL,
    checkpoint_kind text NOT NULL,
    state_version text NOT NULL DEFAULT '1.0',
    state jsonb NOT NULL,
    state_hash text NOT NULL,
    parent_checkpoint_id uuid,
    replay_source_checkpoint_id uuid
        REFERENCES agent.agent_run_checkpoints(id),
    step_name text,
    step_order integer,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_run_checkpoints_run_seq_key
        UNIQUE (agent_run_id, checkpoint_seq),
    CONSTRAINT agent_run_checkpoints_id_run_key
        UNIQUE (id, agent_run_id),
    CONSTRAINT agent_run_checkpoints_seq_positive
        CHECK (checkpoint_seq >= 1),
    CONSTRAINT agent_run_checkpoints_kind_check
        CHECK (checkpoint_kind IN ('STEP_BOUNDARY','PAUSE','RESUME','REPLAY_SOURCE','TERMINAL')),
    CONSTRAINT agent_run_checkpoints_state_version_check
        CHECK (length(trim(state_version)) > 0),
    CONSTRAINT agent_run_checkpoints_state_hash_check
        CHECK (state_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_checkpoints_step_order_check
        CHECK (step_order IS NULL OR step_order >= 1),
    CONSTRAINT agent_run_checkpoints_parent_same_run_fk
        FOREIGN KEY (parent_checkpoint_id, agent_run_id)
        REFERENCES agent.agent_run_checkpoints(id, agent_run_id)
);

CREATE INDEX agent_run_checkpoints_run_created_idx
ON agent.agent_run_checkpoints(agent_run_id, created_at DESC);

CREATE INDEX agent_run_checkpoints_parent_idx
ON agent.agent_run_checkpoints(parent_checkpoint_id)
WHERE parent_checkpoint_id IS NOT NULL;

CREATE INDEX agent_run_checkpoints_replay_source_idx
ON agent.agent_run_checkpoints(replay_source_checkpoint_id)
WHERE replay_source_checkpoint_id IS NOT NULL;

CREATE TABLE agent.agent_run_interrupts
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,
    checkpoint_id uuid NOT NULL,
    interrupt_type text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    decision text,
    request_summary text NOT NULL,
    action_key text,
    action_payload_hash text,
    idempotency_key text,
    response jsonb,
    requested_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    resolved_at timestamptz,
    resolved_by uuid REFERENCES auth.users(id),
    resumed_at timestamptz,

    CONSTRAINT agent_run_interrupts_checkpoint_run_fk
        FOREIGN KEY (checkpoint_id, agent_run_id)
        REFERENCES agent.agent_run_checkpoints(id, agent_run_id),
    CONSTRAINT agent_run_interrupts_type_check
        CHECK (interrupt_type IN ('HUMAN_APPROVAL','EXTERNAL_INPUT','DEPENDENCY','MANUAL_REVIEW')),
    CONSTRAINT agent_run_interrupts_status_check
        CHECK (status IN ('PENDING','RESOLVED','RESUMED','CANCELLED','EXPIRED')),
    CONSTRAINT agent_run_interrupts_decision_check
        CHECK (decision IS NULL OR decision IN ('APPROVED','REJECTED')),
    CONSTRAINT agent_run_interrupts_resolution_shape_check
        CHECK (
            (status = 'PENDING' AND decision IS NULL AND resolved_at IS NULL AND resolved_by IS NULL)
            OR (status = 'RESOLVED' AND decision IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
            OR (status = 'RESUMED' AND decision IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resumed_at IS NOT NULL)
            OR (status IN ('CANCELLED','EXPIRED') AND decision IS NULL AND resolved_at IS NOT NULL)
        ),
    CONSTRAINT agent_run_interrupts_summary_check
        CHECK (length(trim(request_summary)) BETWEEN 1 AND 2000),
    CONSTRAINT agent_run_interrupts_action_hash_check
        CHECK (action_payload_hash IS NULL OR action_payload_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_interrupts_human_action_hash_check
        CHECK (interrupt_type <> 'HUMAN_APPROVAL' OR action_payload_hash IS NOT NULL),
    CONSTRAINT agent_run_interrupts_expiry_check
        CHECK (expires_at IS NULL OR expires_at > requested_at)
);

CREATE UNIQUE INDEX agent_run_interrupts_idempotency_idx
ON agent.agent_run_interrupts(agent_run_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX agent_run_interrupts_pending_idx
ON agent.agent_run_interrupts(agent_run_id, requested_at)
WHERE status = 'PENDING';

CREATE TABLE agent.agent_run_replays
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id),
    source_checkpoint_id uuid NOT NULL,
    replay_agent_run_id uuid NOT NULL UNIQUE
        REFERENCES agent.agent_runs(id),
    replay_mode text NOT NULL DEFAULT 'FORK',
    reason text NOT NULL,
    idempotency_key text,
    requested_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_run_replays_source_checkpoint_run_fk
        FOREIGN KEY (source_checkpoint_id, source_agent_run_id)
        REFERENCES agent.agent_run_checkpoints(id, agent_run_id),
    CONSTRAINT agent_run_replays_mode_check
        CHECK (replay_mode = 'FORK'),
    CONSTRAINT agent_run_replays_reason_check
        CHECK (length(trim(reason)) BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX agent_run_replays_idempotency_idx
ON agent.agent_run_replays(source_agent_run_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX agent_run_replays_source_idx
ON agent.agent_run_replays(source_agent_run_id, created_at DESC);

ALTER TABLE agent.agent_run_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent.agent_run_interrupts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent.agent_run_replays ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_run_checkpoints_project_read
ON agent.agent_run_checkpoints
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_run_checkpoints.agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);

CREATE POLICY agent_run_interrupts_project_read
ON agent.agent_run_interrupts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_run_interrupts.agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);

CREATE POLICY agent_run_replays_project_read
ON agent.agent_run_replays
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_run_replays.source_agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);

GRANT SELECT ON agent.agent_run_checkpoints, agent.agent_run_interrupts, agent.agent_run_replays TO authenticated;
GRANT ALL ON agent.agent_run_checkpoints, agent.agent_run_interrupts, agent.agent_run_replays TO service_role;

CREATE OR REPLACE FUNCTION app_private.prevent_agent_runtime_checkpoint_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Agent runtime checkpoints are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION app_private.prevent_agent_runtime_replay_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Agent runtime replay lineage is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_agent_runtime_interrupt_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Agent runtime interrupts cannot be deleted';
    END IF;

    IF NEW.agent_run_id IS DISTINCT FROM OLD.agent_run_id
       OR NEW.checkpoint_id IS DISTINCT FROM OLD.checkpoint_id
       OR NEW.interrupt_type IS DISTINCT FROM OLD.interrupt_type
       OR NEW.request_summary IS DISTINCT FROM OLD.request_summary
       OR NEW.action_key IS DISTINCT FROM OLD.action_key
       OR NEW.action_payload_hash IS DISTINCT FROM OLD.action_payload_hash
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'Resolved interrupt authority fields are immutable';
    END IF;

    IF OLD.status = 'PENDING' AND NEW.status IN ('RESOLVED','CANCELLED','EXPIRED') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'RESOLVED' AND NEW.status = 'RESUMED' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid agent runtime interrupt transition: % -> %', OLD.status, NEW.status;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_agent_runtime_checkpoint_mutation() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.prevent_agent_runtime_replay_mutation() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.enforce_agent_runtime_interrupt_transition() FROM public, anon, authenticated;

CREATE TRIGGER agent_run_checkpoints_append_only
BEFORE UPDATE OR DELETE ON agent.agent_run_checkpoints
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_runtime_checkpoint_mutation();

CREATE TRIGGER agent_run_replays_append_only
BEFORE UPDATE OR DELETE ON agent.agent_run_replays
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_runtime_replay_mutation();

CREATE TRIGGER agent_run_interrupts_transition_guard
BEFORE UPDATE OR DELETE ON agent.agent_run_interrupts
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_agent_runtime_interrupt_transition();

CREATE OR REPLACE FUNCTION agent.create_runtime_checkpoint_internal(
    p_agent_run_id uuid,
    p_checkpoint_kind text,
    p_state_version text,
    p_state jsonb,
    p_state_hash text,
    p_parent_checkpoint_id uuid DEFAULT NULL,
    p_replay_source_checkpoint_id uuid DEFAULT NULL,
    p_step_name text DEFAULT NULL,
    p_step_order integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_checkpoint_id uuid;
    v_checkpoint_seq integer;
BEGIN
    IF p_state IS NULL OR p_state_version IS NULL OR p_state_hash IS NULL THEN
        RAISE EXCEPTION 'Checkpoint state, version, and hash are required';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_agent_run_id::text, 0));

    IF NOT EXISTS (SELECT 1 FROM agent.agent_runs r WHERE r.id = p_agent_run_id) THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;

    IF p_parent_checkpoint_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM agent.agent_run_checkpoints c
           WHERE c.id = p_parent_checkpoint_id
             AND c.agent_run_id = p_agent_run_id
       ) THEN
        RAISE EXCEPTION 'Parent checkpoint is outside the agent run';
    END IF;

    IF p_replay_source_checkpoint_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM agent.agent_run_checkpoints c
           WHERE c.id = p_replay_source_checkpoint_id
       ) THEN
        RAISE EXCEPTION 'Replay source checkpoint not found';
    END IF;

    SELECT COALESCE(MAX(c.checkpoint_seq), 0) + 1
    INTO v_checkpoint_seq
    FROM agent.agent_run_checkpoints c
    WHERE c.agent_run_id = p_agent_run_id;

    INSERT INTO agent.agent_run_checkpoints (
        agent_run_id, checkpoint_seq, checkpoint_kind, state_version, state, state_hash,
        parent_checkpoint_id, replay_source_checkpoint_id, step_name, step_order
    ) VALUES (
        p_agent_run_id, v_checkpoint_seq, upper(trim(p_checkpoint_kind)), trim(p_state_version), p_state, lower(trim(p_state_hash)),
        p_parent_checkpoint_id, p_replay_source_checkpoint_id, p_step_name, p_step_order
    )
    RETURNING id INTO v_checkpoint_id;

    RETURN v_checkpoint_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent.request_runtime_interrupt_internal(
    p_agent_run_id uuid,
    p_interrupt_type text,
    p_request_summary text,
    p_state_version text,
    p_state jsonb,
    p_state_hash text,
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
    v_run_status agent.run_status;
    v_checkpoint_id uuid;
    v_interrupt_id uuid;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_agent_run_id::text, 0));

    IF p_idempotency_key IS NOT NULL THEN
        SELECT i.*, c.state_hash
        INTO v_existing, v_existing_state_hash
        FROM agent.agent_run_interrupts i
        JOIN agent.agent_run_checkpoints c ON c.id = i.checkpoint_id
        WHERE i.agent_run_id = p_agent_run_id
          AND i.idempotency_key = p_idempotency_key;

        IF FOUND THEN
            IF v_existing.interrupt_type IS DISTINCT FROM upper(trim(p_interrupt_type))
               OR v_existing.action_key IS DISTINCT FROM p_action_key
               OR v_existing.action_payload_hash IS DISTINCT FROM p_action_payload_hash
               OR v_existing_state_hash IS DISTINCT FROM lower(trim(p_state_hash)) THEN
                RAISE EXCEPTION 'Interrupt idempotency key collision';
            END IF;
            RETURN v_existing.id;
        END IF;
    END IF;

    SELECT r.status INTO v_run_status
    FROM agent.agent_runs r
    WHERE r.id = p_agent_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;

    IF v_run_status <> 'RUNNING'::agent.run_status THEN
        RAISE EXCEPTION 'Agent run must be RUNNING before an interrupt can be requested';
    END IF;

    v_checkpoint_id := agent.create_runtime_checkpoint_internal(
        p_agent_run_id,
        'PAUSE',
        p_state_version,
        p_state,
        p_state_hash,
        NULL,
        NULL,
        p_step_name,
        p_step_order
    );

    INSERT INTO agent.agent_run_interrupts (
        agent_run_id, checkpoint_id, interrupt_type, request_summary,
        action_key, action_payload_hash, idempotency_key, expires_at
    ) VALUES (
        p_agent_run_id, v_checkpoint_id, upper(trim(p_interrupt_type)), trim(p_request_summary),
        p_action_key, CASE WHEN p_action_payload_hash IS NULL THEN NULL ELSE lower(trim(p_action_payload_hash)) END,
        p_idempotency_key, p_expires_at
    ) RETURNING id INTO v_interrupt_id;

    UPDATE agent.agent_runs
    SET status = 'WAITING'::agent.run_status
    WHERE id = p_agent_run_id;

    RETURN v_interrupt_id;
END;
$$;

CREATE OR REPLACE FUNCTION agent.resolve_runtime_interrupt(
    p_interrupt_id uuid,
    p_decision text,
    p_action_payload_hash text DEFAULT NULL,
    p_response jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(interrupt_id uuid, status text, decision text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_interrupt agent.agent_run_interrupts%ROWTYPE;
    v_project_id uuid;
    v_user_id uuid;
    v_decision text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required';
    END IF;

    v_decision := upper(trim(p_decision));
    IF v_decision NOT IN ('APPROVED','REJECTED') THEN
        RAISE EXCEPTION 'Decision must be APPROVED or REJECTED';
    END IF;

    SELECT i.*, r.project_id
    INTO v_interrupt, v_project_id
    FROM agent.agent_run_interrupts i
    JOIN agent.agent_runs r ON r.id = i.agent_run_id
    WHERE i.id = p_interrupt_id
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent runtime interrupt not found';
    END IF;

    IF NOT app_private.is_project_admin(v_project_id) THEN
        RAISE EXCEPTION 'Project administrator approval is required';
    END IF;

    IF v_interrupt.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Agent runtime interrupt is not pending';
    END IF;

    IF v_interrupt.expires_at IS NOT NULL AND v_interrupt.expires_at <= now() THEN
        UPDATE agent.agent_run_interrupts
        SET status = 'EXPIRED', resolved_at = now(), resolved_by = v_user_id, response = COALESCE(p_response, '{}'::jsonb)
        WHERE id = p_interrupt_id;

        RETURN QUERY SELECT p_interrupt_id, 'EXPIRED'::text, NULL::text;
        RETURN;
    END IF;

    IF v_interrupt.action_payload_hash IS NOT NULL
       AND v_interrupt.action_payload_hash IS DISTINCT FROM lower(trim(COALESCE(p_action_payload_hash, ''))) THEN
        RAISE EXCEPTION 'Approval payload does not match the pending action';
    END IF;

    UPDATE agent.agent_run_interrupts
    SET status = 'RESOLVED',
        decision = v_decision,
        response = COALESCE(p_response, '{}'::jsonb),
        resolved_at = now(),
        resolved_by = v_user_id
    WHERE id = p_interrupt_id;

    RETURN QUERY SELECT p_interrupt_id, 'RESOLVED'::text, v_decision;
END;
$$;

CREATE OR REPLACE FUNCTION agent.resume_runtime_interrupt_internal(
    p_interrupt_id uuid,
    p_state_version text,
    p_state jsonb,
    p_state_hash text,
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
    SELECT i.*, r.status
    INTO v_interrupt, v_run_status
    FROM agent.agent_run_interrupts i
    JOIN agent.agent_runs r ON r.id = i.agent_run_id
    WHERE i.id = p_interrupt_id
    FOR UPDATE OF i, r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent runtime interrupt not found';
    END IF;

    IF v_interrupt.status <> 'RESOLVED' OR v_interrupt.decision IS NULL THEN
        RAISE EXCEPTION 'Agent runtime interrupt must have a human decision before resume';
    END IF;

    IF v_run_status <> 'WAITING'::agent.run_status THEN
        RAISE EXCEPTION 'Agent run must be WAITING before resume';
    END IF;

    v_checkpoint_id := agent.create_runtime_checkpoint_internal(
        v_interrupt.agent_run_id,
        'RESUME',
        p_state_version,
        p_state,
        p_state_hash,
        v_interrupt.checkpoint_id,
        NULL,
        p_step_name,
        p_step_order
    );

    UPDATE agent.agent_run_interrupts
    SET status = 'RESUMED', resumed_at = now()
    WHERE id = p_interrupt_id;

    UPDATE agent.agent_runs
    SET status = 'RUNNING'::agent.run_status
    WHERE id = v_interrupt.agent_run_id;

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
    v_existing_run_id uuid;
    v_source_run agent.agent_runs%ROWTYPE;
    v_source_checkpoint agent.agent_run_checkpoints%ROWTYPE;
    v_replay_run_id uuid;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_source_agent_run_id::text, 0));

    IF p_idempotency_key IS NOT NULL THEN
        SELECT replay_agent_run_id INTO v_existing_run_id
        FROM agent.agent_run_replays
        WHERE source_agent_run_id = p_source_agent_run_id
          AND idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN v_existing_run_id;
        END IF;
    END IF;

    SELECT * INTO v_source_run
    FROM agent.agent_runs
    WHERE id = p_source_agent_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source agent run not found';
    END IF;

    SELECT * INTO v_source_checkpoint
    FROM agent.agent_run_checkpoints
    WHERE id = p_source_checkpoint_id
      AND agent_run_id = p_source_agent_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Replay checkpoint is outside the source run';
    END IF;

    INSERT INTO agent.agent_runs (
        agent_definition_id, project_id, dataset_id, dataset_version_id,
        parent_run_id, correlation_id, status, input
    ) VALUES (
        v_source_run.agent_definition_id,
        v_source_run.project_id,
        v_source_run.dataset_id,
        v_source_run.dataset_version_id,
        v_source_run.id,
        v_source_run.correlation_id,
        'CREATED'::agent.run_status,
        v_source_run.input
    ) RETURNING id INTO v_replay_run_id;

    PERFORM agent.create_runtime_checkpoint_internal(
        v_replay_run_id,
        'REPLAY_SOURCE',
        v_source_checkpoint.state_version,
        v_source_checkpoint.state,
        v_source_checkpoint.state_hash,
        NULL,
        v_source_checkpoint.id,
        v_source_checkpoint.step_name,
        v_source_checkpoint.step_order
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

REVOKE ALL ON FUNCTION agent.create_runtime_checkpoint_internal(uuid,text,text,jsonb,text,uuid,uuid,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.request_runtime_interrupt_internal(uuid,text,text,text,jsonb,text,text,text,text,timestamptz,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.resume_runtime_interrupt_internal(uuid,text,jsonb,text,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.create_runtime_replay_internal(uuid,uuid,text,text,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) FROM public, anon;

GRANT EXECUTE ON FUNCTION agent.create_runtime_checkpoint_internal(uuid,text,text,jsonb,text,uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.request_runtime_interrupt_internal(uuid,text,text,text,jsonb,text,text,text,text,timestamptz,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.resume_runtime_interrupt_internal(uuid,text,jsonb,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.create_runtime_replay_internal(uuid,uuid,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) TO authenticated;

COMMENT ON TABLE agent.agent_run_checkpoints IS 'Append-only, versioned native agent runtime checkpoints. Contains structured execution state only; not hidden reasoning and not business-job authority.';
COMMENT ON TABLE agent.agent_run_interrupts IS 'Governed long-lived agent interrupts. Human decisions are recorded separately from runtime resume so approval never directly executes a side effect.';
COMMENT ON TABLE agent.agent_run_replays IS 'Immutable lineage for controlled replay forks. Source runs/checkpoints are never rewritten.';

COMMIT;
