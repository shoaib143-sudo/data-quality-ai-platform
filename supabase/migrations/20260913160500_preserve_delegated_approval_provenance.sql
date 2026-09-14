-- Preserve delegation provenance on approval decisions.

create or replace function governance.record_agent_approval_decision(
  p_request_id uuid,
  p_approver_user_id uuid,
  p_axis text,
  p_decision text,
  p_comment text,
  p_channel text
)
returns governance.agent_approval_requests
language plpgsql
security definer
set search_path = pg_catalog, public, governance
as $$
declare
  v_request governance.agent_approval_requests%rowtype;
  v_business_approved boolean;
  v_governance_approved boolean;
  v_direct_authority boolean;
  v_delegator uuid;
begin
  if p_axis not in ('BUSINESS','GOVERNANCE') then raise exception 'Unsupported approval axis'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'Unsupported approval decision'; end if;
  if p_channel not in ('DATANEXUS','EMAIL','TEAMS') then raise exception 'Unsupported approval channel'; end if;
  if p_comment is null or length(btrim(p_comment)) = 0 then raise exception 'Approval comment is required'; end if;

  select * into v_request
  from governance.agent_approval_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Approval request not found'; end if;
  if v_request.status in ('EXECUTED','REJECTED','CANCELLED','INVALIDATED') then
    raise exception 'Approval request is no longer actionable';
  end if;

  select exists (
    select 1
    from governance.agent_approval_authorities a
    where a.user_id = p_approver_user_id
      and a.approval_axis = p_axis
      and lower(a.domain) = lower(v_request.domain)
      and (a.project_id is null or a.project_id = v_request.project_id)
      and a.active
      and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now())
  ) into v_direct_authority;

  if not v_direct_authority then
    select d.delegator_user_id
      into v_delegator
    from governance.agent_approval_delegations d
    where d.delegate_user_id = p_approver_user_id
      and d.approval_axis = p_axis
      and lower(d.domain) = lower(v_request.domain)
      and (d.project_id is null or d.project_id = v_request.project_id)
      and d.active
      and d.starts_at <= now()
      and (d.ends_at is null or d.ends_at > now())
      and (cardinality(d.action_keys) = 0 or v_request.action_key = any(d.action_keys))
      and governance.agent_risk_rank(v_request.risk_level) <= governance.agent_risk_rank(d.max_risk)
    order by d.created_at desc
    limit 1;
  end if;

  if not v_direct_authority and v_delegator is null then
    raise exception 'Approver is not authorized for this domain, axis, project and risk';
  end if;

  if p_decision = 'APPROVED' and exists (
    select 1 from governance.agent_approval_decisions d
    where d.approval_request_id = p_request_id
      and d.approver_user_id = p_approver_user_id
      and d.decision = 'APPROVED'
      and d.approval_axis <> p_axis
  ) then
    raise exception 'The same individual cannot satisfy both approval axes';
  end if;

  insert into governance.agent_approval_decisions (
    approval_request_id, approval_axis, approver_user_id, on_behalf_of_user_id,
    decision, comment, channel
  ) values (
    p_request_id, p_axis, p_approver_user_id, v_delegator,
    p_decision, btrim(p_comment), p_channel
  );

  if p_decision = 'REJECTED' then
    update governance.agent_approval_requests
      set status = 'REJECTED', updated_at = now()
    where id = p_request_id
    returning * into v_request;
    return v_request;
  end if;

  select exists (
    select 1 from governance.agent_approval_decisions d
    where d.approval_request_id = p_request_id
      and d.approval_axis = 'BUSINESS'
      and d.decision = 'APPROVED'
  ) into v_business_approved;

  select exists (
    select 1 from governance.agent_approval_decisions d
    where d.approval_request_id = p_request_id
      and d.approval_axis = 'GOVERNANCE'
      and d.decision = 'APPROVED'
  ) into v_governance_approved;

  update governance.agent_approval_requests
  set
    status = case
      when (not requires_business_approval or v_business_approved)
       and (not requires_governance_approval or v_governance_approved)
        then 'READY_TO_EXECUTE'
      when requires_business_approval and not v_business_approved
        then 'BUSINESS_PENDING'
      when requires_governance_approval and not v_governance_approved
        then 'GOVERNANCE_PENDING'
      else 'APPROVED'
    end,
    approved_at = case
      when (not requires_business_approval or v_business_approved)
       and (not requires_governance_approval or v_governance_approved)
        then now()
      else approved_at
    end,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function governance.record_agent_approval_decision(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function governance.record_agent_approval_decision(uuid, uuid, text, text, text, text) to service_role;
