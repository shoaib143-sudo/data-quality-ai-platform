-- Individual, domain-scoped approval authorities and atomic decision recording.

alter table governance.agent_approval_requests
  add column if not exists requires_business_approval boolean not null default false,
  add column if not exists requires_governance_approval boolean not null default false;

alter table governance.agent_approval_delegations
  add column if not exists approval_axis text not null default 'BUSINESS'
    check (approval_axis in ('BUSINESS','GOVERNANCE'));

create table if not exists governance.agent_approval_authorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references app.projects(id) on delete cascade,
  domain text not null,
  approval_axis text not null check (approval_axis in ('BUSINESS','GOVERNANCE')),
  source_role_key text,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  constraint agent_approval_authorities_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_agent_approval_authorities_lookup
  on governance.agent_approval_authorities(user_id, approval_axis, domain, project_id, active);

alter table governance.agent_approval_authorities enable row level security;
revoke all on governance.agent_approval_authorities from anon, authenticated;
grant all on governance.agent_approval_authorities to service_role;

create or replace function governance.agent_risk_rank(p_risk text)
returns integer
language sql
immutable
as $$
  select case upper(p_risk)
    when 'LOW' then 0
    when 'MEDIUM' then 1
    when 'HIGH' then 2
    when 'CRITICAL' then 3
    else 99
  end
$$;

create or replace function governance.is_agent_approval_authority(
  p_user_id uuid,
  p_project_id uuid,
  p_domain text,
  p_axis text,
  p_action_key text,
  p_risk text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, governance
as $$
  select
    exists (
      select 1
      from governance.agent_approval_authorities a
      where a.user_id = p_user_id
        and a.approval_axis = p_axis
        and lower(a.domain) = lower(p_domain)
        and (a.project_id is null or a.project_id = p_project_id)
        and a.active
        and a.starts_at <= now()
        and (a.ends_at is null or a.ends_at > now())
    )
    or exists (
      select 1
      from governance.agent_approval_delegations d
      where d.delegate_user_id = p_user_id
        and d.approval_axis = p_axis
        and lower(d.domain) = lower(p_domain)
        and (d.project_id is null or d.project_id = p_project_id)
        and d.active
        and d.starts_at <= now()
        and (d.ends_at is null or d.ends_at > now())
        and (cardinality(d.action_keys) = 0 or p_action_key = any(d.action_keys))
        and governance.agent_risk_rank(p_risk) <= governance.agent_risk_rank(d.max_risk)
    );
$$;

revoke all on function governance.agent_risk_rank(text) from public, anon, authenticated;
revoke all on function governance.is_agent_approval_authority(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function governance.agent_risk_rank(text) to service_role;
grant execute on function governance.is_agent_approval_authority(uuid, uuid, text, text, text, text) to service_role;

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
  v_eligible boolean;
begin
  if p_axis not in ('BUSINESS','GOVERNANCE') then
    raise exception 'Unsupported approval axis';
  end if;
  if p_decision not in ('APPROVED','REJECTED') then
    raise exception 'Unsupported approval decision';
  end if;
  if p_channel not in ('DATANEXUS','EMAIL','TEAMS') then
    raise exception 'Unsupported approval channel';
  end if;
  if p_comment is null or length(btrim(p_comment)) = 0 then
    raise exception 'Approval comment is required';
  end if;

  select * into v_request
  from governance.agent_approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found';
  end if;
  if v_request.status in ('EXECUTED','REJECTED','CANCELLED','INVALIDATED') then
    raise exception 'Approval request is no longer actionable';
  end if;

  select governance.is_agent_approval_authority(
    p_approver_user_id,
    v_request.project_id,
    v_request.domain,
    p_axis,
    v_request.action_key,
    v_request.risk_level
  ) into v_eligible;

  if not v_eligible then
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
    approval_request_id, approval_axis, approver_user_id, decision, comment, channel
  ) values (
    p_request_id, p_axis, p_approver_user_id, p_decision, btrim(p_comment), p_channel
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

comment on table governance.agent_approval_authorities is 'Individual, domain-scoped approval authority. Business and Governance axes are independent.';
