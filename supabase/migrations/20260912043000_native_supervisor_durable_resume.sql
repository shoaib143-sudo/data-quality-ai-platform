BEGIN;

CREATE TABLE agent.agent_run_execution_leases
(
    agent_run_id uuid PRIMARY KEY REFERENCES agent.agent_runs(id) ON DELETE CASCADE,
    plan_hash text NOT NULL,
    runtime_manifest_hash text NOT NULL,
    tool_contracts_hash text NOT NULL,
    checkpoint_id uuid,
    execution_generation bigint NOT NULL DEFAULT 0,
    resume_attempt bigint NOT NULL DEFAULT 0,
    lease_owner text,
    lease_expires_at timestamptz,
    last_claimed_at timestamptz,
    released_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agent_run_execution_leases_checkpoint_run_fk FOREIGN KEY (checkpoint_id, agent_run_id) REFERENCES agent.agent_run_checkpoints(id, agent_run_id),
    CONSTRAINT agent_run_execution_leases_plan_hash_check CHECK (plan_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_execution_leases_runtime_hash_check CHECK (runtime_manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_execution_leases_contracts_hash_check CHECK (tool_contracts_hash ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT agent_run_execution_leases_generation_check CHECK (execution_generation >= 0),
    CONSTRAINT agent_run_execution_leases_resume_attempt_check CHECK (resume_attempt >= 0),
    CONSTRAINT agent_run_execution_leases_owner_shape_check CHECK ((lease_owner IS NULL AND lease_expires_at IS NULL) OR (lease_owner IS NOT NULL AND length(trim(lease_owner)) BETWEEN 1 AND 300 AND lease_expires_at IS NOT NULL))
);

CREATE INDEX agent_run_execution_leases_expiry_idx ON agent.agent_run_execution_leases(lease_expires_at) WHERE lease_owner IS NOT NULL;
ALTER TABLE agent.agent_run_execution_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_run_execution_leases_project_read ON agent.agent_run_execution_leases FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM agent.agent_runs r WHERE r.id = agent_run_execution_leases.agent_run_id AND app_private.is_project_member(r.project_id)));
GRANT SELECT ON agent.agent_run_execution_leases TO authenticated;
GRANT ALL ON agent.agent_run_execution_leases TO service_role;

CREATE OR REPLACE FUNCTION agent.initialize_supervisor_execution_internal(p_agent_run_id uuid,p_plan_hash text,p_runtime_manifest_hash text,p_tool_contracts_hash text,p_checkpoint_id uuid DEFAULT NULL)
RETURNS agent.agent_run_execution_leases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run_status agent.run_status; v_manifest_hash text; v_existing agent.agent_run_execution_leases%ROWTYPE; v_result agent.agent_run_execution_leases%ROWTYPE;
BEGIN
    IF p_plan_hash !~ '^sha256:[0-9a-f]{64}$' OR p_runtime_manifest_hash !~ '^sha256:[0-9a-f]{64}$' OR p_tool_contracts_hash !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Supervisor execution requires canonical sha256 pins'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_agent_run_id::text, 0));
    SELECT r.status INTO v_run_status FROM agent.agent_runs r WHERE r.id = p_agent_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agent run not found'; END IF;
    IF v_run_status NOT IN ('RUNNING'::agent.run_status,'CREATED'::agent.run_status) THEN RAISE EXCEPTION 'Supervisor execution cannot be initialized from run status %', v_run_status; END IF;
    SELECT m.manifest_hash INTO v_manifest_hash FROM agent.agent_run_runtime_manifests m WHERE m.agent_run_id = p_agent_run_id;
    IF v_manifest_hash IS NULL OR v_manifest_hash IS DISTINCT FROM p_runtime_manifest_hash THEN RAISE EXCEPTION 'Pinned runtime manifest mismatch'; END IF;
    IF p_checkpoint_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent.agent_run_checkpoints c WHERE c.id = p_checkpoint_id AND c.agent_run_id = p_agent_run_id) THEN RAISE EXCEPTION 'Checkpoint is outside the agent run'; END IF;
    SELECT l.* INTO v_existing FROM agent.agent_run_execution_leases l WHERE l.agent_run_id = p_agent_run_id;
    IF FOUND THEN
      IF v_existing.plan_hash IS DISTINCT FROM p_plan_hash OR v_existing.runtime_manifest_hash IS DISTINCT FROM p_runtime_manifest_hash OR v_existing.tool_contracts_hash IS DISTINCT FROM p_tool_contracts_hash THEN RAISE EXCEPTION 'Supervisor execution pins are immutable'; END IF;
      RETURN v_existing;
    END IF;
    INSERT INTO agent.agent_run_execution_leases(agent_run_id,plan_hash,runtime_manifest_hash,tool_contracts_hash,checkpoint_id) VALUES(p_agent_run_id,p_plan_hash,p_runtime_manifest_hash,p_tool_contracts_hash,p_checkpoint_id) RETURNING * INTO v_result;
    RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION agent.claim_supervisor_execution_internal(p_agent_run_id uuid,p_plan_hash text,p_runtime_manifest_hash text,p_tool_contracts_hash text,p_lease_owner text,p_lease_seconds integer DEFAULT 60,p_checkpoint_id uuid DEFAULT NULL)
RETURNS agent.agent_run_execution_leases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run_status agent.run_status; v_manifest_hash text; v_current agent.agent_run_execution_leases%ROWTYPE; v_result agent.agent_run_execution_leases%ROWTYPE;
BEGIN
    IF p_lease_owner IS NULL OR length(trim(p_lease_owner)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'lease owner is required'; END IF;
    IF p_lease_seconds < 10 OR p_lease_seconds > 3600 THEN RAISE EXCEPTION 'lease duration must be between 10 and 3600 seconds'; END IF;
    IF p_plan_hash !~ '^sha256:[0-9a-f]{64}$' OR p_runtime_manifest_hash !~ '^sha256:[0-9a-f]{64}$' OR p_tool_contracts_hash !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Supervisor resume requires canonical sha256 pins'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_agent_run_id::text, 0));
    SELECT r.status INTO v_run_status FROM agent.agent_runs r WHERE r.id = p_agent_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agent run not found'; END IF;
    IF v_run_status IN ('SUCCEEDED'::agent.run_status,'FAILED'::agent.run_status,'CANCELLED'::agent.run_status) THEN RAISE EXCEPTION 'Terminal agent run cannot be claimed'; END IF;
    IF v_run_status = 'WAITING'::agent.run_status THEN RAISE EXCEPTION 'Approval-waiting agent run cannot be resumed by an execution lease'; END IF;
    SELECT m.manifest_hash INTO v_manifest_hash FROM agent.agent_run_runtime_manifests m WHERE m.agent_run_id = p_agent_run_id;
    IF v_manifest_hash IS NULL OR v_manifest_hash IS DISTINCT FROM p_runtime_manifest_hash THEN RAISE EXCEPTION 'Pinned runtime manifest mismatch'; END IF;
    SELECT l.* INTO v_current FROM agent.agent_run_execution_leases l WHERE l.agent_run_id = p_agent_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supervisor execution state has not been initialized'; END IF;
    IF v_current.plan_hash IS DISTINCT FROM p_plan_hash THEN RAISE EXCEPTION 'Pinned supervisor plan mismatch'; END IF;
    IF v_current.runtime_manifest_hash IS DISTINCT FROM p_runtime_manifest_hash THEN RAISE EXCEPTION 'Pinned supervisor runtime mismatch'; END IF;
    IF v_current.tool_contracts_hash IS DISTINCT FROM p_tool_contracts_hash THEN RAISE EXCEPTION 'Pinned supervisor tool contract bundle mismatch'; END IF;
    IF p_checkpoint_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent.agent_run_checkpoints c WHERE c.id = p_checkpoint_id AND c.agent_run_id = p_agent_run_id) THEN RAISE EXCEPTION 'Checkpoint is outside the agent run'; END IF;
    IF v_current.lease_owner IS NOT NULL AND v_current.lease_owner IS DISTINCT FROM trim(p_lease_owner) AND v_current.lease_expires_at > now() THEN RAISE EXCEPTION 'Supervisor execution is leased by another worker'; END IF;
    UPDATE agent.agent_run_execution_leases SET lease_owner=trim(p_lease_owner),lease_expires_at=now()+pg_catalog.make_interval(secs=>p_lease_seconds),checkpoint_id=COALESCE(p_checkpoint_id,checkpoint_id),execution_generation=execution_generation+CASE WHEN lease_owner IS NULL OR lease_owner IS DISTINCT FROM trim(p_lease_owner) OR lease_expires_at <= now() THEN 1 ELSE 0 END,resume_attempt=resume_attempt+1,last_claimed_at=now(),released_at=NULL,updated_at=now() WHERE agent_run_id=p_agent_run_id RETURNING * INTO v_result;
    RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION agent.renew_supervisor_execution_lease_internal(p_agent_run_id uuid,p_lease_owner text,p_execution_generation bigint,p_lease_seconds integer DEFAULT 60,p_checkpoint_id uuid DEFAULT NULL)
RETURNS agent.agent_run_execution_leases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result agent.agent_run_execution_leases%ROWTYPE;
BEGIN
    IF p_lease_seconds < 10 OR p_lease_seconds > 3600 THEN RAISE EXCEPTION 'lease duration must be between 10 and 3600 seconds'; END IF;
    IF p_checkpoint_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent.agent_run_checkpoints c WHERE c.id=p_checkpoint_id AND c.agent_run_id=p_agent_run_id) THEN RAISE EXCEPTION 'Checkpoint is outside the agent run'; END IF;
    UPDATE agent.agent_run_execution_leases SET checkpoint_id=COALESCE(p_checkpoint_id,checkpoint_id),lease_expires_at=now()+pg_catalog.make_interval(secs=>p_lease_seconds),updated_at=now() WHERE agent_run_id=p_agent_run_id AND lease_owner=trim(p_lease_owner) AND execution_generation=p_execution_generation AND lease_expires_at > now() RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supervisor execution lease is not owned by this generation'; END IF;
    RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION agent.release_supervisor_execution_lease_internal(p_agent_run_id uuid,p_lease_owner text,p_execution_generation bigint,p_checkpoint_id uuid DEFAULT NULL)
RETURNS agent.agent_run_execution_leases LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result agent.agent_run_execution_leases%ROWTYPE;
BEGIN
    IF p_checkpoint_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent.agent_run_checkpoints c WHERE c.id=p_checkpoint_id AND c.agent_run_id=p_agent_run_id) THEN RAISE EXCEPTION 'Checkpoint is outside the agent run'; END IF;
    UPDATE agent.agent_run_execution_leases SET checkpoint_id=COALESCE(p_checkpoint_id,checkpoint_id),lease_owner=NULL,lease_expires_at=NULL,released_at=now(),updated_at=now() WHERE agent_run_id=p_agent_run_id AND lease_owner=trim(p_lease_owner) AND execution_generation=p_execution_generation RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supervisor execution lease is not owned by this generation'; END IF;
    RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION agent.initialize_supervisor_execution_internal(uuid,text,text,text,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION agent.claim_supervisor_execution_internal(uuid,text,text,text,text,integer,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION agent.renew_supervisor_execution_lease_internal(uuid,text,bigint,integer,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION agent.release_supervisor_execution_lease_internal(uuid,text,bigint,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION agent.initialize_supervisor_execution_internal(uuid,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.claim_supervisor_execution_internal(uuid,text,text,text,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.renew_supervisor_execution_lease_internal(uuid,text,bigint,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION agent.release_supervisor_execution_lease_internal(uuid,text,bigint,uuid) TO service_role;
COMMENT ON TABLE agent.agent_run_execution_leases IS 'Durable supervisor ownership and immutable execution pins. Deployment identity may change; plan, runtime, and pinned tool-contract identity may not.';
COMMIT;
