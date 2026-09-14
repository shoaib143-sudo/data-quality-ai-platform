-- Finalize an approved Agent Policy v2 execution and append its complete provenance
-- to the existing hash-chained governance audit trail in one database transaction.

create or replace function governance.finalize_agent_approval_execution(
  p_request_id uuid,
  p_executor_user_id uuid,
  p_execution_entity_type text,
  p_execution_entity_id uuid
)
returns governance.agent_approval_requests
language plpgsql
security definer
set search_path = pg_catalog, public, governance
as $$
declare
  v_request governance.agent_approval_requests%rowtype;
  v_decisions jsonb;
  v_executed_at timestamptz := now();
begin
  if p_executor_user_id is null then
    raise exception 'Executor user is required';
  end if;
  if p_execution_entity_id is null then
    raise exception 'Execution entity id is required';
  end if;
  if p_execution_entity_type is null or length(btrim(p_execution_entity_type)) = 0 then
    raise exception 'Execution entity type is required';
  end if;

  select * into v_request
  from governance.agent_approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found';
  end if;
  if v_request.status <> 'READY_TO_EXECUTE' then
    raise exception 'Approval request is not READY_TO_EXECUTE';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'decision_id', d.id,
        'axis', d.approval_axis,
        'approver_user_id', d.approver_user_id,
        'on_behalf_of_user_id', d.on_behalf_of_user_id,
        'decision', d.decision,
        'comment', d.comment,
        'channel', d.channel,
        'decided_at', d.decided_at
      ) order by d.decided_at, d.id
    ),
    '[]'::jsonb
  ) into v_decisions
  from governance.agent_approval_decisions d
  where d.approval_request_id = p_request_id;

  update governance.agent_approval_requests
  set
    status = 'EXECUTED',
    executed_at = v_executed_at,
    updated_at = v_executed_at
  where id = p_request_id
    and status = 'READY_TO_EXECUTE'
  returning * into v_request;

  if not found then
    raise exception 'Approval request changed before execution finalization';
  end if;

  insert into governance.audit_events (
    project_id,
    actor_user_id,
    actor_type,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_request.project_id,
    p_executor_user_id,
    'USER',
    'AGENT_POLICY_EXECUTION_AUTHORIZED',
    btrim(p_execution_entity_type),
    p_execution_entity_id,
    jsonb_build_object(
      'approval_request_id', v_request.id,
      'action_key', v_request.action_key,
      'policy_version', v_request.policy_version,
      'execution_fingerprint', v_request.execution_fingerprint,
      'environment', v_request.environment,
      'risk_level', v_request.risk_level,
      'business_criticality', v_request.business_criticality,
      'material_production_mutation', v_request.material_production_mutation,
      'target_type', v_request.target_type,
      'target_id', v_request.target_id,
      'requested_by', v_request.requested_by,
      'approved_at', v_request.approved_at,
      'executed_at', v_executed_at,
      'executor_user_id', p_executor_user_id,
      'requires_business_approval', v_request.requires_business_approval,
      'requires_governance_approval', v_request.requires_governance_approval,
      'approval_decisions', v_decisions,
      'fingerprint_evidence', v_request.fingerprint_payload
    )
  );

  return v_request;
end;
$$;

revoke all on function governance.finalize_agent_approval_execution(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function governance.finalize_agent_approval_execution(uuid, uuid, text, uuid) to service_role;

comment on function governance.finalize_agent_approval_execution(uuid, uuid, text, uuid)
  is 'Atomically marks an Agent Policy v2 approval request executed and appends complete approval/executor/fingerprint provenance to the hash-chained governance audit trail.';
