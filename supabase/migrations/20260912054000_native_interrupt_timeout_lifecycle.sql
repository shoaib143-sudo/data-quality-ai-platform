BEGIN;

-- Governed automated lifecycle for long-lived native runtime interrupts.
-- Approval authority remains in agent.resolve_runtime_interrupt; service-role
-- automation may only expire or cancel a still-pending interrupt.

CREATE TABLE agent.agent_run_interrupt_events
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interrupt_id uuid NOT NULL
        REFERENCES agent.agent_run_interrupts(id)
        ON DELETE CASCADE,
    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,
    event_type text NOT NULL,
    event_source text NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_run_interrupt_events_type_check
        CHECK (event_type IN (
            'INTERRUPT_TIMED_OUT',
            'INTERRUPT_ESCALATED',
            'INTERRUPT_CANCELLED',
            'RUN_CANCELLED',
            'LATE_DECISION_REJECTED'
        )),
    CONSTRAINT agent_run_interrupt_events_source_check
        CHECK (event_source IN ('TIMEOUT_PROCESSOR','EXPLICIT_CANCEL','HUMAN_RESOLVE')),
    CONSTRAINT agent_run_interrupt_events_reason_check
        CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 2000),
    CONSTRAINT agent_run_interrupt_events_once_key
        UNIQUE (interrupt_id, event_type)
);

CREATE INDEX agent_run_interrupt_events_run_created_idx
ON agent.agent_run_interrupt_events(agent_run_id, created_at DESC);

ALTER TABLE agent.agent_run_interrupt_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_run_interrupt_events_project_read
ON agent.agent_run_interrupt_events
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_run_interrupt_events.agent_run_id
          AND app_private.is_project_member(r.project_id)
    )
);

GRANT SELECT ON agent.agent_run_interrupt_events TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.prevent_agent_runtime_interrupt_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Agent runtime interrupt events are append-only';
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_agent_runtime_interrupt_event_mutation() FROM public, anon, authenticated;

CREATE TRIGGER agent_run_interrupt_events_append_only
BEFORE UPDATE OR DELETE ON agent.agent_run_interrupt_events
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_agent_runtime_interrupt_event_mutation();

CREATE OR REPLACE FUNCTION app_private.record_agent_runtime_interrupt_event(
    p_interrupt_id uuid,
    p_agent_run_id uuid,
    p_event_type text,
    p_event_source text,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event_id uuid;
BEGIN
    INSERT INTO agent.agent_run_interrupt_events (
        interrupt_id,
        agent_run_id,
        event_type,
        event_source,
        reason
    ) VALUES (
        p_interrupt_id,
        p_agent_run_id,
        upper(trim(p_event_type)),
        upper(trim(p_event_source)),
        CASE WHEN p_reason IS NULL THEN NULL ELSE left(trim(p_reason), 2000) END
    )
    ON CONFLICT (interrupt_id, event_type) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        SELECT e.id INTO v_event_id
        FROM agent.agent_run_interrupt_events e
        WHERE e.interrupt_id = p_interrupt_id
          AND e.event_type = upper(trim(p_event_type));
    END IF;

    RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.record_agent_runtime_interrupt_event(uuid,uuid,text,text,text) FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION agent.process_runtime_interrupt_timeout_internal(
    p_interrupt_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_interrupt agent.agent_run_interrupts%ROWTYPE;
    v_run_status agent.run_status;
    v_now timestamptz := now();
    v_reason text;
BEGIN
    v_reason := CASE
        WHEN p_reason IS NULL OR length(trim(p_reason)) = 0 THEN 'Runtime interrupt approval deadline expired'
        ELSE left(trim(p_reason), 2000)
    END;

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

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;

    IF v_interrupt.status <> 'PENDING' THEN
        RETURN jsonb_build_object(
            'interrupt_id', v_interrupt.id,
            'agent_run_id', v_interrupt.agent_run_id,
            'status', v_interrupt.status,
            'run_status', v_run_status,
            'applied', false,
            'reason_code', 'INTERRUPT_ALREADY_TERMINAL_OR_DECIDED'
        );
    END IF;

    IF v_interrupt.expires_at IS NULL OR v_interrupt.expires_at > v_now THEN
        RETURN jsonb_build_object(
            'interrupt_id', v_interrupt.id,
            'agent_run_id', v_interrupt.agent_run_id,
            'status', v_interrupt.status,
            'run_status', v_run_status,
            'applied', false,
            'reason_code', 'INTERRUPT_NOT_EXPIRED'
        );
    END IF;

    IF v_run_status <> 'WAITING'::agent.run_status THEN
        RAISE EXCEPTION 'Pending runtime interrupt requires WAITING agent run before timeout processing';
    END IF;

    UPDATE agent.agent_run_interrupts
    SET status = 'EXPIRED',
        resolved_at = v_now,
        response = COALESCE(response, '{}'::jsonb) || jsonb_build_object(
            'timeout_handling', 'ESCALATE',
            'timeout_processed_at', v_now,
            'timeout_reason', v_reason
        )
    WHERE id = v_interrupt.id;

    PERFORM app_private.record_agent_runtime_interrupt_event(
        v_interrupt.id,
        v_interrupt.agent_run_id,
        'INTERRUPT_TIMED_OUT',
        'TIMEOUT_PROCESSOR',
        v_reason
    );

    PERFORM app_private.record_agent_runtime_interrupt_event(
        v_interrupt.id,
        v_interrupt.agent_run_id,
        'INTERRUPT_ESCALATED',
        'TIMEOUT_PROCESSOR',
        'Timed out interrupt requires governed human follow-up; run remains WAITING'
    );

    RETURN jsonb_build_object(
        'interrupt_id', v_interrupt.id,
        'agent_run_id', v_interrupt.agent_run_id,
        'status', 'EXPIRED',
        'run_status', 'WAITING',
        'applied', true,
        'reason_code', 'INTERRUPT_TIMED_OUT_AND_ESCALATED'
    );
END;
$$;

CREATE OR REPLACE FUNCTION agent.cancel_runtime_interrupt_internal(
    p_interrupt_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_interrupt agent.agent_run_interrupts%ROWTYPE;
    v_run_status agent.run_status;
    v_now timestamptz := now();
    v_reason text;
BEGIN
    v_reason := CASE
        WHEN p_reason IS NULL OR length(trim(p_reason)) = 0 THEN 'Runtime interrupt cancelled by governed server policy'
        ELSE left(trim(p_reason), 2000)
    END;

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

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent run not found';
    END IF;

    IF v_interrupt.status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'interrupt_id', v_interrupt.id,
            'agent_run_id', v_interrupt.agent_run_id,
            'status', 'CANCELLED',
            'run_status', v_run_status,
            'applied', false,
            'reason_code', 'INTERRUPT_ALREADY_CANCELLED'
        );
    END IF;

    IF v_interrupt.status <> 'PENDING' THEN
        RETURN jsonb_build_object(
            'interrupt_id', v_interrupt.id,
            'agent_run_id', v_interrupt.agent_run_id,
            'status', v_interrupt.status,
            'run_status', v_run_status,
            'applied', false,
            'reason_code', 'INTERRUPT_ALREADY_TERMINAL_OR_DECIDED'
        );
    END IF;

    IF v_run_status <> 'WAITING'::agent.run_status THEN
        RAISE EXCEPTION 'Pending runtime interrupt requires WAITING agent run before cancellation';
    END IF;

    UPDATE agent.agent_run_interrupts
    SET status = 'CANCELLED',
        resolved_at = v_now,
        response = COALESCE(response, '{}'::jsonb) || jsonb_build_object(
            'cancelled_at', v_now,
            'cancel_reason', v_reason
        )
    WHERE id = v_interrupt.id;

    UPDATE agent.agent_runs
    SET status = 'CANCELLED'::agent.run_status,
        completed_at = COALESCE(completed_at, v_now),
        updated_at = v_now
    WHERE id = v_interrupt.agent_run_id;

    PERFORM app_private.record_agent_runtime_interrupt_event(
        v_interrupt.id,
        v_interrupt.agent_run_id,
        'INTERRUPT_CANCELLED',
        'EXPLICIT_CANCEL',
        v_reason
    );

    PERFORM app_private.record_agent_runtime_interrupt_event(
        v_interrupt.id,
        v_interrupt.agent_run_id,
        'RUN_CANCELLED',
        'EXPLICIT_CANCEL',
        v_reason
    );

    RETURN jsonb_build_object(
        'interrupt_id', v_interrupt.id,
        'agent_run_id', v_interrupt.agent_run_id,
        'status', 'CANCELLED',
        'run_status', 'CANCELLED',
        'applied', true,
        'reason_code', 'INTERRUPT_AND_RUN_CANCELLED'
    );
END;
$$;

-- Preserve the existing human decision authority while making late decisions auditable.
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
    v_now timestamptz := now();
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

    IF v_interrupt.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Agent runtime interrupt is not pending';
    END IF;

    IF v_interrupt.expires_at IS NOT NULL AND v_interrupt.expires_at <= v_now THEN
        UPDATE agent.agent_run_interrupts
        SET status = 'EXPIRED',
            resolved_at = v_now,
            resolved_by = v_user_id,
            response = COALESCE(p_response, '{}'::jsonb) || jsonb_build_object(
                'late_decision_rejected', true,
                'attempted_decision', v_decision,
                'timeout_handling', 'ESCALATE'
            )
        WHERE id = p_interrupt_id;

        PERFORM app_private.record_agent_runtime_interrupt_event(
            v_interrupt.id,
            v_interrupt.agent_run_id,
            'INTERRUPT_TIMED_OUT',
            'HUMAN_RESOLVE',
            'Approval deadline expired before the human decision acquired the interrupt lock'
        );
        PERFORM app_private.record_agent_runtime_interrupt_event(
            v_interrupt.id,
            v_interrupt.agent_run_id,
            'LATE_DECISION_REJECTED',
            'HUMAN_RESOLVE',
            'Late human decision was audited but did not resume or execute the pending action'
        );
        PERFORM app_private.record_agent_runtime_interrupt_event(
            v_interrupt.id,
            v_interrupt.agent_run_id,
            'INTERRUPT_ESCALATED',
            'HUMAN_RESOLVE',
            'Timed out interrupt requires governed human follow-up; run remains WAITING'
        );

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
        resolved_at = v_now,
        resolved_by = v_user_id
    WHERE id = p_interrupt_id;

    RETURN QUERY SELECT p_interrupt_id, 'RESOLVED'::text, v_decision;
END;
$$;

REVOKE ALL ON FUNCTION agent.process_runtime_interrupt_timeout_internal(uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION agent.cancel_runtime_interrupt_internal(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION agent.process_runtime_interrupt_timeout_internal(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION agent.cancel_runtime_interrupt_internal(uuid,text) TO service_role;

COMMENT ON TABLE agent.agent_run_interrupt_events IS 'Append-only audit lineage for timeout, escalation, cancellation, and rejected late decisions in the native runtime interrupt lifecycle.';
COMMENT ON FUNCTION agent.process_runtime_interrupt_timeout_internal(uuid,text) IS 'Idempotently expires an overdue pending interrupt and records escalation while leaving its run WAITING.';
COMMENT ON FUNCTION agent.cancel_runtime_interrupt_internal(uuid,text) IS 'Idempotently cancels a still-pending interrupt and its WAITING agent run. Human-resolved interrupts are never overridden.';

COMMIT;
