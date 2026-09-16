-- Governed direct approval-authority assignment.
-- Direct authorities become explicitly action/risk scoped and initial authority assignment
-- is service-role-only, transaction-safe, auditable, and separation-of-duties protected.

alter table governance.agent_approval_authorities
  add column if not exists action_keys text[] not null default array[
    'CONVERSE_GOVERNANCE_AGENT',
    'RUN_PROFILING',
    'RUN_DATA_QUALITY',
    'RUN_SUPERVISOR',
    'RETRY_EXECUTION',
    'CANCEL_EXECUTION',
    'APPLY_GOVERNED_MUTATION'
  ]::text[],
  add column if not exists max_risk text not null default 'CRITICAL';

alter table governance.agent_approval_authorities
  drop constraint if exists agent_approval_authorities_max_risk_check,
  add constraint agent_approval_authorities_max_risk_check
    check (max_risk in ('LOW','MEDIUM','HIGH','CRITICAL')),
  drop constraint if exists agent_approval_authorities_action_keys_check,
  add constraint agent_approval_authorities_action_keys_check
    check (
      cardinality(action_keys) > 0
      and action_keys <@ array[
        'CONVERSE_GOVERNANCE_AGENT',
        'RUN_PROFILING',
        'RUN_DATA_QUALITY',
        'RUN_SUPERVISOR',
        'RETRY_EXECUTION',
        'CANCEL_EXECUTION',
        'APPLY_GOVERNED_MUTATION'
      ]::text[]
    );

create table if not exists governance.agent_approval_authority_audit (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references governance.agent_approval_authorities(id) on delete restrict,
  event_type text not null check (event_type in ('ASSIGNED')),
  actor_user_id uuid not null references auth.users(id),
  subject_user_id uuid not null references auth.users(id),
  project_id uuid not null references app.projects(id) on delete restrict,
  domain text not null,
  approval_axis text not null check (approval_axis in ('BUSINESS','GOVERNANCE')),
  action_keys text[] not null,
  max_risk text not null check (max_risk in ('LOW','MEDIUM','HIGH','CRITICAL')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table governance.agent_approval_authority_audit enable row level security;
revoke all on governance.agent_approval_authority_audit from public, anon, authenticated;
grant all on governance.agent_approval_authority_audit to service_role;

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
        and p_action_key = any(a.action_keys)
        and governance.agent_risk_rank(p_risk) <= governance.agent_risk_rank(a.max_risk)
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

revoke all on function governance.is_agent_approval_authority(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function governance.is_agent_approval_authority(uuid, uuid, text, text, text, text) to service_role;

create or replace function governance.assign_agent_approval_authority(
  p_actor_user_id uuid,
  p_subject_user_id uuid,
  p_project_id uuid,
  p_domain text,
  p_approval_axis text,
  p_action_keys text[],
  p_max_risk text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns governance.agent_approval_authorities
language plpgsql
security definer
set search_path = pg_catalog, public, app, catalog, governance
as $$
declare
  v_authority governance.agent_approval_authorities%rowtype;
  v_organization_id uuid;
  v_actions text[];
  v_starts_at timestamptz := coalesce(p_starts_at, now());
  v_lock_key bigint;
begin
  if p_actor_user_id is null or p_subject_user_id is null then
    raise exception 'Administrator and approver identities are required';
  end if;
  if p_actor_user_id = p_subject_user_id then
    raise exception 'Administrators cannot assign direct approval authority to themselves';
  end if;
  if p_project_id is null then
    raise exception 'Direct approval authority assignment must be project scoped';
  end if;
  if nullif(btrim(p_domain), '') is null then
    raise exception 'Approval domain is required';
  end if;
  if p_approval_axis not in ('BUSINESS','GOVERNANCE') then
    raise exception 'Unsupported approval axis';
  end if;
  if p_max_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then
    raise exception 'Unsupported approval risk ceiling';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Authority assignment reason is required';
  end if;
  if p_ends_at is not null and p_ends_at <= v_starts_at then
    raise exception 'Authority end time must be after its start time';
  end if;

  select array_agg(distinct btrim(action_key) order by btrim(action_key))
  into v_actions
  from unnest(coalesce(p_action_keys, array[]::text[])) action_key
  where nullif(btrim(action_key), '') is not null;

  if coalesce(cardinality(v_actions), 0) = 0 then
    raise exception 'Authority assignment requires at least one explicitly scoped action';
  end if;
  if exists (
    select 1 from unnest(v_actions) action_key
    where action_key not in (
      'CONVERSE_GOVERNANCE_AGENT','RUN_PROFILING','RUN_DATA_QUALITY','RUN_SUPERVISOR',
      'RETRY_EXECUTION','CANCEL_EXECUTION','APPLY_GOVERNED_MUTATION'
    )
  ) then
    raise exception 'Unsupported governed agent action';
  end if;

  select p.organization_id into v_organization_id
  from app.projects p
  where p.id = p_project_id;
  if v_organization_id is null then
    raise exception 'Approval project does not exist';
  end if;

  if not exists (
    select 1 from app.organization_members m
    where m.organization_id = v_organization_id
      and m.user_id = p_subject_user_id
  ) then
    raise exception 'Approver must be an individual member of the project organization';
  end if;

  if not exists (
    select 1 from catalog.datasets d
    where d.project_id = p_project_id
      and nullif(btrim(d.business_domain), '') is not null
      and lower(btrim(d.business_domain)) = lower(btrim(p_domain))
    union all
    select 1 from governance.critical_data_elements c
    where c.project_id = p_project_id
      and nullif(btrim(c.domain), '') is not null
      and lower(btrim(c.domain)) = lower(btrim(p_domain))
  ) then
    raise exception 'Approval domain is not governed by this project';
  end if;

  v_lock_key := hashtextextended(p_project_id::text || ':' || lower(btrim(p_domain)) || ':' || p_subject_user_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from governance.agent_approval_authorities a
    where a.active
      and a.user_id = p_subject_user_id
      and a.project_id = p_project_id
      and lower(a.domain) = lower(btrim(p_domain))
      and (a.ends_at is null or a.ends_at > v_starts_at)
      and (p_ends_at is null or a.starts_at < p_ends_at)
      and a.approval_axis <> p_approval_axis
  ) then
    raise exception 'The same individual cannot hold overlapping Business and Governance authority for one project/domain';
  end if;

  if exists (
    select 1
    from governance.agent_approval_authorities a
    where a.active
      and a.user_id = p_subject_user_id
      and a.project_id = p_project_id
      and lower(a.domain) = lower(btrim(p_domain))
      and a.approval_axis = p_approval_axis
      and (a.ends_at is null or a.ends_at > v_starts_at)
      and (p_ends_at is null or a.starts_at < p_ends_at)
  ) then
    raise exception 'An overlapping direct approval authority already exists for this person, project, domain and axis';
  end if;

  insert into governance.agent_approval_authorities (
    user_id, project_id, domain, approval_axis, source_role_key,
    action_keys, max_risk, active, starts_at, ends_at, reason, created_by
  ) values (
    p_subject_user_id, p_project_id, btrim(p_domain), p_approval_axis, 'ADMIN_ASSIGNMENT',
    v_actions, p_max_risk, true, v_starts_at, p_ends_at, btrim(p_reason), p_actor_user_id
  ) returning * into v_authority;

  insert into governance.agent_approval_authority_audit (
    authority_id, event_type, actor_user_id, subject_user_id, project_id,
    domain, approval_axis, action_keys, max_risk, starts_at, ends_at, reason
  ) values (
    v_authority.id, 'ASSIGNED', p_actor_user_id, p_subject_user_id, p_project_id,
    v_authority.domain, v_authority.approval_axis, v_authority.action_keys,
    v_authority.max_risk, v_authority.starts_at, v_authority.ends_at, v_authority.reason
  );

  return v_authority;
end;
$$;

revoke all on function governance.assign_agent_approval_authority(uuid, uuid, uuid, text, text, text[], text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function governance.assign_agent_approval_authority(uuid, uuid, uuid, text, text, text[], text, timestamptz, timestamptz, text) to service_role;

comment on function governance.assign_agent_approval_authority(uuid, uuid, uuid, text, text, text[], text, timestamptz, timestamptz, text)
is 'Service-role-only direct approval authority assignment. Caller must separately prove project admin.manage before invoking. Enforces organization membership, governed-domain scope, action/risk limits, overlap SoD, concurrency safety, and assignment audit evidence.';
