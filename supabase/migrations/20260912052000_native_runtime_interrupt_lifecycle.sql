BEGIN;

CREATE TABLE agent.agent_run_interrupt_terminal_actions
(
    interrupt_id uuid PRIMARY KEY
        REFERENCES agent.agent_run_interrupts(id)
        ON DELETE CASCADE,
    action text NOT NULL,
    source text NOT NULL,
    reason_code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_run_interrupt_terminal_actions_action_check
        CHECK (action IN ('ESCALATED','CANCELLED')),
    CONSTRAINT agent_run_interrupt_terminal_actions_source_check
        CHECK (source IN ('TIMEOUT','REJECTION')),
    CONSTRAINT agent_run_interrupt_terminal_actions_reason_check
        CHECK (length(trim(reason_code)) BETWEEN 1 AND 160)
);

CREATE TABLE agent.agent_run_interrupt_late_decisions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interrupt_id uuid NOT NULL
        REFERENCES agent.agent_run_interrupts(id)
        ON DELETE CASCADE,
    attempted_by uuid NOT NULL
        REFERENCES auth.users(id),
    attempted_decision text NOT NULL,
    action_payload_hash text,
    attempted_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_run_interrupt_late_decisions_decision_check
        CHECK (attempted_decision IN ('APPROVED','REJECTED')),
    CONSTRAINT agent_run_interrupt_late_decisions_hash_check
        CHECK (action_payload_hash IS NULL OR action_payload_hash ~ '^sha256:[0-9a-f]{64}$')
);

CREATE INDEX agent_run_interrupt_late_decisions_interrupt_idx
ON agent.agent_run_interrupt_late_decisions(interrupt_id, attempted_at DESC);

ALTER TABLE agent.agent_run_interrupt_terminal_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent.agent_run_interrupt_late_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_run_interrupt_terminal_actions_project_read
ON agent.agent_run_interrupt_terminal_actions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_run_interrupts i
        JOIN agent.agent_runs r ON r.id = i.agent_run_id
        WHERE i.id = agent_run_interrupt_terminal_actions.interrupt_id
          AND app_private.is_project_member(r.project_id)
    )
);

CREATE POLICY agent_run_interrupt_late_decisions_project_read
ON agent.agent_run_interrupt_late_decisions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_run_interrupts i
        JOIN agent.agent_runs r ON r.id = i.agent_run_id
        WHERE i.id = agent_run_interrupt_late_decisions.interrupt_id
          AND app_private.is_project_member(r.project_id)
    )
);

GRANT SELECT ON agent.agent_run_interrupt_terminal_actions, agent.agent_run_interrupt_late_decisions TO authenticated;
GRANT ALL ON agent.agent_run_interrupt_terminal_actions, agent.agent_run_interrupt_late_decisions TO service_role;

CREATE OR REPLACE FUNCTION app_private.prevent_agent_runtime_interrupt_terminal_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Agent runtime interrupt terminal evidence is append-only';
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_agent_runtime_interrupt_terminal_mutation() FROM public, anon, authenticated;

CREATE TRIGGER agent_run_interrupt_terminal_actions_append_only
BEFORE UPDATE OR DELETE ON agent.agent_run_interrupt_terminal_actions
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_runtime_interrupt_terminal_mutation();

CREATE TRIGGER agent_run_interrupt_late_decisions_append_only
BEFORE UPDATE OR DELETE ON agent.agent_run_interrupt_late_decisions
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_runtime_interrupt_terminal_mutation();

CREATE OR REPLACE FUNCTION agent.process_expired_runtime_interrupt_internal(
    p_interrupt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_interrupt agent.agent_run_interrupts%ROWTYPE;
    v_existing agent.agent_run_interrupt_terminal_actions%ROWTYPE;
    v_action text;
    v_run_status agent.run_status;
    v_changed boolean := false;
BEGIN
    SELECT i.* INTO v_interrupt
    FROM agent.agent_run_interrupts i
    WHERE i.id = p_interrupt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent runtime interrupt not found';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_interrupt.agent_run_id::text, 0));

    SELECT a.* INTO v_existing
    FROM agent.agent_run_interrupt_terminal_actions a
    WHERE a.interrupt_id = p_interrupt_id;

    SELECT r.status INTO v_run_status
    FROM agent.agent_runs r
    WHERE r.id = v_interrupt.agent_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;

    IF FOUND AND v_existing.interrupt_id IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'interruptId', p_interrupt_id,
            'interruptStatus', v_interrupt.status,
            'terminalAction', v_existing.action,
            'runStatus', v_run_status::text,
            'changed', false
        );
    END IF;

    IF v_interrupt.status = 'PENDING' THEN
        IF v_interrupt.expires_at IS NULL OR v_interrupt.expires_at > now() THEN
            RETURN pg_catalog.jsonb_build_object(
                'interruptId', p_interrupt_id,
                'interruptStatus', v_interrupt.status,
                'terminalAction', NULL,
                'runStatus', v_run_status::text,
                'changed', false
            );
        END IF;

        UPDATE agent.agent_run_interrupts
        SET status = 'EXPIRED',
            resolved_at = now(),
            response = COALESCE(response, '{}'::jsonb) || pg_catalog.jsonb_build_object('automatedTimeout', true)
        WHERE id = p_interrupt_id;
        v_interrupt.status := 'EXPIRED';
        v_changed := true;
    ELSIF v_interrupt.status <> 'EXPIRED' THEN
        RETURN pg_catalog.jsonb_build_object(
            'interruptId', p_interrupt_id,
            'interruptStatus', v_interrupt.status,
            'terminalAction', NULL,
            'runStatus', v_run_status::text,
            'changed', false
        );
    END IF;

    IF v_run_status NOT IN ('WAITING'::agent.run_status, 'CANCELLED'::agent.run_status) THEN
        RAISE EXCEPTION 'Timed-out interrupt run must remain WAITING or already be CANCELLED';
    END IF;

    v_action := CASE
        WHEN v_interrupt.interrupt_type IN ('HUMAN_APPROVAL','MANUAL_REVIEW') THEN 'ESCALATED'
        ELSE 'CANCELLED'
    END;

    IF v_action = 'CANCELLED' AND v_run_status = 'WAITING'::agent.run_status THEN
        UPDATE agent.agent_runs
        SET status = 'CANCELLED'::agent.run_status,
            completed_at = COALESCE(completed_at, now())
        WHERE id = v_interrupt.agent_run_id;
        v_run_status := 'CANCELLED'::agent.run_status;
    END IF;

    INSERT INTO agent.agent_run_interrupt_terminal_actions (
        interrupt_id, action, source, reason_code
    ) VALUES (
        p_interrupt_id,
        v_action,
        'TIMEOUT',
        CASE WHEN v_action = 'ESCALATED' THEN 'INTERRUPT_TIMEOUT_ESCALATED' ELSE 'INTERRUPT_TIMEOUT_CANCELLED' END
    )
    ON CONFLICT (interrupt_id) DO NOTHING;

    RETURN pg_catalog.jsonb_build_object(
        'interruptId', p_interrupt_id,
        'interruptStatus', 'EXPIRED',
        'terminalAction', v_action,
        'runStatus', v_run_status::text,
        'changed', v_changed
    );
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
    v_action_payload_hash text;
    v_timeout_action text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required';
    END IF;

    v_decision := upper(trim(p_decision));
    IF v_decision NOT IN ('APPROVED','REJECTED') THEN
        RAISE EXCEPTION 'Decision must be APPROVED or REJECTED';
    END IF;

    v_action_payload_hash := CASE WHEN p_action_payload_hash IS NULL THEN NULL ELSE lower(trim(p_action_payload_hash)) END;

    SELECT i.* INTO v_interrupt
    FROM agent.agent_run_interrupts i
    WHERE i.id = p_interrupt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent runtime interrupt not found';
    END IF;

    SELECT r.project_id INTO v_project_id
    FROM agent.agent_runs r
    WHERE r.id = v_interrupt.agent_run_id;

    IF NOT app_private.is_project_admin(v_project_id) THEN
        RAISE EXCEPTION 'Project administrator approval is required';
    END IF;

    IF v_interrupt.status IN ('EXPIRED','CANCELLED') THEN
        INSERT INTO agent.agent_run_interrupt_late_decisions (
            interrupt_id, attempted_by, attempted_decision, action_payload_hash
        ) VALUES (
            p_interrupt_id, v_user_id, v_decision, v_action_payload_hash
        );

        RETURN QUERY SELECT p_interrupt_id, v_interrupt.status, NULL::text;
        RETURN;
    END IF;

    IF v_interrupt.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Agent runtime interrupt is not pending';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_interrupt.agent_run_id::text, 0));

    IF v_interrupt.expires_at IS NOT NULL AND v_interrupt.expires_at <= now() THEN
        UPDATE agent.agent_run_interrupts
        SET status = 'EXPIRED',
            resolved_at = now(),
            resolved_by = v_user_id,
            response = COALESCE(p_response, '{}'::jsonb) || pg_catalog.jsonb_build_object('lateDecisionAudited', true)
        WHERE id = p_interrupt_id;

        INSERT INTO agent.agent_run_interrupt_late_decisions (
            interrupt_id, attempted_by, attempted_decision, action_payload_hash
        ) VALUES (
            p_interrupt_id, v_user_id, v_decision, v_action_payload_hash
        );

        v_timeout_action := CASE
            WHEN v_interrupt.interrupt_type IN ('HUMAN_APPROVAL','MANUAL_REVIEW') THEN 'ESCALATED'
            ELSE 'CANCELLED'
        END;

        INSERT INTO agent.agent_run_interrupt_terminal_actions (
            interrupt_id, action, source, reason_code
        ) VALUES (
            p_interrupt_id,
            v_timeout_action,
            'TIMEOUT',
            CASE WHEN v_timeout_action = 'ESCALATED' THEN 'INTERRUPT_TIMEOUT_ESCALATED' ELSE 'INTERRUPT_TIMEOUT_CANCELLED' END
        )
        ON CONFLICT (interrupt_id) DO NOTHING;

        IF v_timeout_action = 'CANCELLED' THEN
            UPDATE agent.agent_runs
            SET status = 'CANCELLED'::agent.run_status,
                completed_at = COALESCE(completed_at, now())
            WHERE id = v_interrupt.agent_run_id
              AND status = 'WAITING'::agent.run_status;
        END IF;

        RETURN QUERY SELECT p_interrupt_id, 'EXPIRED'::text, NULL::text;
        RETURN;
    END IF;

    IF v_interrupt.action_payload_hash IS NOT NULL
       AND v_interrupt.action_payload_hash IS DISTINCT FROM v_action_payload_hash THEN
        RAISE EXCEPTION 'Approval payload does not match the pending action';
    END IF;

    UPDATE agent.agent_run_interrupts
    SET status = 'RESOLVED',
        decision = v_decision,
        response = COALESCE(p_response, '{}'::jsonb),
        resolved_at = now(),
        resolved_by = v_user_id
    WHERE id = p_interrupt_id;

    IF v_decision = 'REJECTED' THEN
        UPDATE agent.agent_runs
        SET status = 'CANCELLED'::agent.run_status,
            completed_at = COALESCE(completed_at, now())
        WHERE id = v_interrupt.agent_run_id
          AND status = 'WAITING'::agent.run_status;

        INSERT INTO agent.agent_run_interrupt_terminal_actions (
            interrupt_id, action, source, reason_code
        ) VALUES (
            p_interrupt_id, 'CANCELLED', 'REJECTION', 'INTERRUPT_REJECTED_BY_HUMAN'
        )
        ON CONFLICT (interrupt_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT p_interrupt_id, 'RESOLVED'::text, v_decision;
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

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent runtime interrupt not found';
    END IF;

    SELECT r.status INTO v_run_status
    FROM agent.agent_runs r
    WHERE r.id = v_interrupt.agent_run_id
    FOR UPDATE;

    IF v_interrupt.status <> 'RESOLVED' OR v_interrupt.decision <> 'APPROVED' THEN
        RAISE EXCEPTION 'Agent runtime interrupt must be APPROVED before resume';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM agent.agent_run_interrupt_terminal_actions a
        WHERE a.interrupt_id = p_interrupt_id
    ) THEN
        RAISE EXCEPTION 'Terminal interrupt cannot be resumed';
    END IF;

    IF v_run_status <> 'WAITING'::agent.run_status THEN
        RAISE EXCEPTION 'Agent run must be WAITING before resume';
    END IF;

    v_checkpoint_id := agent.create_runtime_checkpoint_internal(
        v_interrupt.agent_run_id,
        'RESUME',
        p_state_version,
        p_state,
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

REVOKE ALL ON FUNCTION agent.process_expired_runtime_interrupt_internal(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.resume_runtime_interrupt_internal(uuid,text,jsonb,text,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) FROM public, anon;

GRANT EXECUTE ON FUNCTION agent.process_expired_runtime_interrupt_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.resume_runtime_interrupt_internal(uuid,text,jsonb,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) TO authenticated;

COMMENT ON TABLE agent.agent_run_interrupt_terminal_actions IS 'Append-only terminal outcome evidence for runtime interrupts. Timeout policy is server-owned: approval/manual-review timeouts escalate; dependency/input timeouts cancel.';
COMMENT ON TABLE agent.agent_run_interrupt_late_decisions IS 'Append-only audit evidence for human decisions attempted after a runtime interrupt already became terminal.';

COMMIT;
