-- Bind human interrupt authorization to row selection before acquiring the lock.
-- This prevents unauthorized existence disclosure and avoidable row-lock contention
-- while preserving the governed authenticated project-admin decision boundary.

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
    JOIN agent.agent_runs r ON r.id = i.agent_run_id
    WHERE i.id = p_interrupt_id
      AND app_private.is_project_admin(r.project_id)
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agent runtime interrupt is unavailable';
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

REVOKE ALL ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) FROM public, anon, service_role;
GRANT EXECUTE ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) TO authenticated;

COMMENT ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) IS 'Governed human interrupt decision RPC. Authorization is evaluated before row locking; unknown and unauthorized interrupt identifiers share a fail-closed response.';
