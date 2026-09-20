-- Phase 11 governed learning: bind candidate promotion to Agent Policy v2 approval.
-- This migration adds approval eligibility and candidate approval evidence only.
-- It does not activate an agent version or mark an approval request executed.

alter table governance.agent_approval_authorities
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
        'APPLY_GOVERNED_MUTATION',
        'PROMOTE_LEARNING_CANDIDATE'
      ]::text[]
    );

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
      'RETRY_EXECUTION','CANCEL_EXECUTION','APPLY_GOVERNED_MUTATION','PROMOTE_LEARNING_CANDIDATE'
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

create table if not exists agent.learning_candidate_approval_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  benchmark_id uuid not null references agent.learning_candidate_benchmarks(id) on delete restrict,
  approval_request_id uuid not null references governance.agent_approval_requests(id) on delete restrict,
  agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint learning_candidate_approval_links_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_candidate_approval_links_candidate_uq unique (candidate_id),
  constraint learning_candidate_approval_links_request_uq unique (approval_request_id)
);

create index if not exists learning_candidate_approval_links_project_idx
  on agent.learning_candidate_approval_links(project_id, created_at desc);

alter table agent.learning_candidate_approval_links enable row level security;

drop policy if exists learning_candidate_approval_links_project_read on agent.learning_candidate_approval_links;
create policy learning_candidate_approval_links_project_read
  on agent.learning_candidate_approval_links for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_candidate_approval_links from public, anon, authenticated, service_role;
grant select on agent.learning_candidate_approval_links to authenticated, service_role;

drop trigger if exists reject_learning_candidate_approval_link_mutation on agent.learning_candidate_approval_links;
create trigger reject_learning_candidate_approval_link_mutation
before update or delete on agent.learning_candidate_approval_links
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.bind_learning_candidate_approval_request(
  p_project_id uuid,
  p_candidate_id uuid,
  p_approval_request_id uuid,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_benchmark agent.learning_candidate_benchmarks%rowtype;
  v_request governance.agent_approval_requests%rowtype;
  v_definition agent.agent_definitions%rowtype;
  v_lifecycle agent.agent_version_lifecycle%rowtype;
  v_existing agent.learning_candidate_approval_links%rowtype;
  v_id uuid;
begin
  if p_project_id is null or p_candidate_id is null or p_approval_request_id is null or p_requested_by is null then
    raise exception 'project, candidate, approval request and requester are required';
  end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'REVIEW_REQUIRED' then
    raise exception 'learning candidate must be REVIEW_REQUIRED before approval binding';
  end if;

  select * into v_benchmark
  from agent.learning_candidate_benchmarks
  where candidate_id = v_candidate.id and project_id = p_project_id;
  if not found or v_benchmark.gate_status <> 'REVIEW_REQUIRED' then
    raise exception 'learning candidate does not have passing independent benchmark evidence';
  end if;

  select * into v_definition
  from agent.agent_definitions
  where agent_key = v_candidate.agent_key and version = v_candidate.candidate_version;
  if not found then raise exception 'candidate agent definition is not registered'; end if;

  select * into v_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_definition.id;
  if not found or v_lifecycle.lifecycle_state <> 'CANDIDATE' then
    raise exception 'candidate agent definition must be in CANDIDATE lifecycle state';
  end if;

  select * into v_request
  from governance.agent_approval_requests
  where id = p_approval_request_id and project_id = p_project_id;
  if not found then raise exception 'approval request not found in project'; end if;
  if v_request.requested_by <> p_requested_by then raise exception 'approval requester identity does not match binding actor'; end if;
  if v_request.action_key <> 'PROMOTE_LEARNING_CANDIDATE' then raise exception 'approval request is not for learning candidate promotion'; end if;
  if v_request.target_type <> 'PROJECT' or v_request.target_id::text <> p_project_id::text then
    raise exception 'learning candidate approval request has invalid project target';
  end if;
  if v_request.material_production_mutation is not true then
    raise exception 'learning candidate promotion must remain a material production mutation';
  end if;

  if v_request.fingerprint_payload->>'actionKey' <> 'PROMOTE_LEARNING_CANDIDATE'
    or v_request.fingerprint_payload->>'projectId' <> p_project_id::text
    or v_request.fingerprint_payload #>> '{parameters,candidateId}' <> v_candidate.id::text
    or v_request.fingerprint_payload #>> '{parameters,agentKey}' <> v_candidate.agent_key
    or v_request.fingerprint_payload #>> '{parameters,baselineVersion}' <> v_candidate.baseline_version
    or v_request.fingerprint_payload #>> '{parameters,candidateVersion}' <> v_candidate.candidate_version
    or v_request.fingerprint_payload #>> '{parameters,benchmarkId}' <> v_benchmark.id::text
    or v_request.fingerprint_payload #>> '{parameters,rollbackRef}' <> v_benchmark.rollback_ref
    or v_request.fingerprint_payload #>> '{parameters,agentDefinitionId}' <> v_definition.id::text
  then
    raise exception 'learning candidate approval fingerprint payload does not match canonical candidate evidence';
  end if;

  select * into v_existing
  from agent.learning_candidate_approval_links
  where candidate_id = v_candidate.id or approval_request_id = p_approval_request_id;
  if found then
    if v_existing.candidate_id <> v_candidate.id
      or v_existing.approval_request_id <> p_approval_request_id
      or v_existing.benchmark_id <> v_benchmark.id
      or v_existing.agent_definition_id <> v_definition.id
      or v_existing.requested_by <> p_requested_by
    then
      raise exception 'learning candidate approval binding conflicts with existing immutable evidence';
    end if;
    return v_existing.id;
  end if;

  insert into agent.learning_candidate_approval_links(
    project_id, candidate_id, benchmark_id, approval_request_id, agent_definition_id, requested_by
  ) values (
    p_project_id, v_candidate.id, v_benchmark.id, p_approval_request_id, v_definition.id, p_requested_by
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function agent.bind_learning_candidate_approval_request(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.bind_learning_candidate_approval_request(uuid,uuid,uuid,uuid)
  to service_role;

create or replace function agent.approve_learning_candidate_for_controlled_release(
  p_project_id uuid,
  p_candidate_id uuid,
  p_approval_request_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_benchmark agent.learning_candidate_benchmarks%rowtype;
  v_link agent.learning_candidate_approval_links%rowtype;
  v_request governance.agent_approval_requests%rowtype;
begin
  if p_project_id is null or p_candidate_id is null or p_approval_request_id is null or p_actor_user_id is null then
    raise exception 'project, candidate, approval request and actor are required';
  end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'REVIEW_REQUIRED' then
    raise exception 'learning candidate must still be REVIEW_REQUIRED';
  end if;

  select * into v_link
  from agent.learning_candidate_approval_links
  where project_id = p_project_id
    and candidate_id = p_candidate_id
    and approval_request_id = p_approval_request_id;
  if not found then raise exception 'learning candidate approval binding is missing'; end if;

  select * into v_benchmark
  from agent.learning_candidate_benchmarks
  where id = v_link.benchmark_id and candidate_id = p_candidate_id and project_id = p_project_id;
  if not found or v_benchmark.gate_status <> 'REVIEW_REQUIRED' then
    raise exception 'passing benchmark evidence is no longer available';
  end if;

  select * into v_request
  from governance.agent_approval_requests
  where id = p_approval_request_id and project_id = p_project_id
  for share;
  if not found then raise exception 'approval request not found in project'; end if;
  if v_request.action_key <> 'PROMOTE_LEARNING_CANDIDATE' then raise exception 'approval action identity mismatch'; end if;
  if v_request.status <> 'READY_TO_EXECUTE' then raise exception 'learning candidate approval is not READY_TO_EXECUTE'; end if;
  if (v_request.requires_business_approval or v_request.requires_governance_approval)
    and (v_request.approved_at is null or v_request.approval_expires_at is null or v_request.approval_expires_at <= statement_timestamp())
  then
    raise exception 'learning candidate human approval is missing or expired';
  end if;

  if v_request.fingerprint_payload #>> '{parameters,candidateId}' <> v_candidate.id::text
    or v_request.fingerprint_payload #>> '{parameters,candidateVersion}' <> v_candidate.candidate_version
    or v_request.fingerprint_payload #>> '{parameters,baselineVersion}' <> v_candidate.baseline_version
    or v_request.fingerprint_payload #>> '{parameters,benchmarkId}' <> v_benchmark.id::text
    or v_request.fingerprint_payload #>> '{parameters,rollbackRef}' <> v_benchmark.rollback_ref
    or v_request.fingerprint_payload #>> '{parameters,agentDefinitionId}' <> v_link.agent_definition_id::text
  then
    raise exception 'learning candidate approval fingerprint no longer matches controlled release context';
  end if;

  update agent.learning_candidates
  set status = 'APPROVED_FOR_CONTROLLED_RELEASE', updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'REVIEW_REQUIRED', 'APPROVED_FOR_CONTROLLED_RELEASE',
    'AGENT_POLICY_V2_APPROVAL_READY_FOR_CONTROLLED_RELEASE', p_actor_user_id
  );

  return v_candidate.id;
end;
$$;

revoke all on function agent.approve_learning_candidate_for_controlled_release(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.approve_learning_candidate_for_controlled_release(uuid,uuid,uuid,uuid)
  to service_role;

comment on table agent.learning_candidate_approval_links is
  'Immutable binding from a REVIEW_REQUIRED learning candidate to its canonical Agent Policy v2 approval request, benchmark, and candidate agent definition.';
comment on function agent.approve_learning_candidate_for_controlled_release(uuid,uuid,uuid,uuid) is
  'Marks a candidate approved for controlled release only after Agent Policy v2 approval is READY_TO_EXECUTE. Does not activate an agent version or finalize execution.';
