-- Recovery V2 compensation execution introduced a governed RUNNING invocation state in
-- 20260912104500_native_compensation_reclaim_fencing.sql. The pre-existing terminal
-- evidence shape constraint predates RUNNING and therefore rejects the first compensation
-- claim even though RUNNING intentionally has no terminal evidence yet.
--
-- Preserve every existing terminal invariant and extend only the non-terminal branch so
-- ADMITTED and RUNNING both require no completed_at/output_hash/error_code evidence.

ALTER TABLE agent.agent_tool_invocations
    DROP CONSTRAINT IF EXISTS agent_tool_invocations_terminal_shape_check;

ALTER TABLE agent.agent_tool_invocations
    ADD CONSTRAINT agent_tool_invocations_terminal_shape_check
    CHECK (
        (
            status IN ('ADMITTED', 'RUNNING')
            AND completed_at IS NULL
            AND output_hash IS NULL
            AND error_code IS NULL
        )
        OR
        (
            status = 'SUCCEEDED'
            AND completed_at IS NOT NULL
            AND output_hash IS NOT NULL
            AND error_code IS NULL
        )
        OR
        (
            status IN ('FAILED', 'REJECTED')
            AND completed_at IS NOT NULL
        )
    );

DO $block$
DECLARE
    v_constraint text;
BEGIN
    SELECT pg_get_constraintdef(oid)
      INTO v_constraint
    FROM pg_constraint
    WHERE conrelid = 'agent.agent_tool_invocations'::regclass
      AND conname = 'agent_tool_invocations_terminal_shape_check';

    IF v_constraint IS NULL OR v_constraint NOT LIKE '%RUNNING%' THEN
        RAISE EXCEPTION 'Invocation terminal shape constraint does not permit governed RUNNING evidence';
    END IF;
END;
$block$;
