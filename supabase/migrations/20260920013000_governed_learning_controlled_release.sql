-- Phase 11 Governed Learning Pipeline: controlled shadow canary, activation, and rollback.
-- Candidate versions remain CANDIDATE during canary. Shadow evidence has no action authority.
-- Activation is atomic with Agent Policy approval finalization and Runtime v2 version promotion.

create table if not exists agent.learning_candidate_releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  approval_request_id uuid not null references governance.agent_approval_requests(id) on delete restrict,
  candidate_agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  baseline_agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  status text not null check (status in ('RUNNING','VERIFIED','FAILED','ACTIVE','ROLLED_BACK')),
  minimum_case_count integer not null check (minimum_case_count > 0),
  minimum_average_score numeric not null check (minimum_average_score >= 0 and minimum_average_score <= 1),
  canary_started_at timestamptz not null default now(),
  verified_at timestamptz,
  activated_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text,
  started_by uuid not null references auth.users(id) on delete restrict,
  verified_by uuid references auth.users(id) on delete restrict,
  activated_by uuid references auth.users(id) on delete restrict,
  rolled_back_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_candidate_releases_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_candidate_releases_candidate_uq unique (candidate_id),
  constraint learning_candidate_releases_definition_ck
    check (candidate_agent_definition_id <> baseline_agent_definition_id),
  constraint learning_candidate_releases_rollback_ck
    check ((status = 'ROLLED_BACK' and rolled_back_at is not null and length(btrim(rollback_reason)) > 0)
      or status <> 'ROLLED_BACK')
);

create index if not exists learning_candidate_releases_project_status_idx
  on agent.learning_candidate_releases(project_id, status, created_at desc);

create table if not exists agent.learning_candidate_canary_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  release_id uuid not null,
  candidate_id uuid not null,
  evaluation_result_id uuid not null references governance.ai_evaluation_results(id) on delete restrict,
  score numeric not null check (score >= 0 and score <= 1),
  pass boolean not null,
  observed_at timestamptz not null,
  evidence_available_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint learning_candidate_canary_evidence_release_fk
    foreign key (release_id)
    references agent.learning_candidate_releases(id)
    on delete cascade,
  constraint learning_candidate_canary_evidence_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_candidate_canary_evidence_time_ck
    check (evidence_available_at >= observed_at),
  constraint learning_candidate_canary_evidence_uq
    unique (release_id, evaluation_result_id)
);

create index if not exists learning_candidate_canary_evidence_project_release_idx
  on agent.learning_candidate_canary_evidence(project_id, release_id, observed_at desc);

alter table agent.learning_candidate_releases enable row level security;
alter table agent.learning_candidate_canary_evidence enable row level security;

drop policy if exists learning_candidate_releases_project_read on agent.learning_candidate_releases;
create policy learning_candidate_releases_project_read
  on agent.learning_candidate_releases for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists learning_candidate_canary_evidence_project_read on agent.learning_candidate_canary_evidence;
create policy learning_candidate_canary_evidence_project_read
  on agent.learning_candidate_canary_evidence for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_candidate_releases from public, anon, authenticated, service_role;
revoke all on agent.learning_candidate_canary_evidence from public, anon, authenticated, service_role;
grant select on agent.learning_candidate_releases to authenticated, service_role;
grant select on agent.learning_candidate_canary_evidence to authenticated, service_role;

drop trigger if exists reject_learning_candidate_canary_evidence_mutation on agent.learning_candidate_canary_evidence;
create trigger reject_learning_candidate_canary_evidence_mutation
before update or delete on agent.learning_candidate_canary_evidence
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.start_learning_candidate_canary(
  p_project_id uuid,
  p_candidate_id uuid,
  p_approval_request_id uuid,
  p_actor_user_id uuid,
  p_minimum_case_count integer default 20,
  p_minimum_average_score numeric default 0.8
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_link agent.learning_candidate_approval_links%rowtype;
  v_benchmark agent.learning_candidate_benchmarks%rowtype;
  v_request governance.agent_approval_requests%rowtype;
  v_candidate_lifecycle agent.agent_version_lifecycle%rowtype;
  v_baseline_definition agent.agent_definitions%rowtype;
  v_baseline_lifecycle agent.agent_version_lifecycle%rowtype;
  v_release agent.learning_candidate_releases%rowtype;
begin
  if p_project_id is null or p_candidate_id is null or p_approval_request_id is null or p_actor_user_id is null then
    raise exception 'project, candidate, approval request and actor are required';
  end if;
  if p_minimum_case_count is null or p_minimum_case_count < 1 then raise exception 'minimumCaseCount must be positive'; end if;
  if p_minimum_average_score is null or p_minimum_average_score < 0 or p_minimum_average_score > 1 then
    raise exception 'minimumAverageScore must be between 0 and 1';
  end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'APPROVED_FOR_CONTROLLED_RELEASE' then
    raise exception 'learning candidate must be APPROVED_FOR_CONTROLLED_RELEASE before canary';
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
    raise exception 'passing benchmark evidence is unavailable';
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
    raise exception 'learning candidate approval fingerprint no longer matches canary context';
  end if;

  select * into v_candidate_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_link.agent_definition_id;
  if not found or v_candidate_lifecycle.lifecycle_state <> 'CANDIDATE' then
    raise exception 'candidate agent definition must remain CANDIDATE during canary';
  end if;

  select * into v_baseline_definition
  from agent.agent_definitions
  where agent_key = v_candidate.agent_key and version = v_candidate.baseline_version;
  if not found then raise exception 'baseline agent definition is unavailable for rollback'; end if;

  select * into v_baseline_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_baseline_definition.id;
  if not found or v_baseline_lifecycle.lifecycle_state <> 'ACTIVE' then
    raise exception 'baseline agent definition must remain ACTIVE during shadow canary';
  end if;

  select * into v_release
  from agent.learning_candidate_releases
  where candidate_id = v_candidate.id;
  if found then
    if v_release.project_id <> p_project_id
      or v_release.approval_request_id <> p_approval_request_id
      or v_release.candidate_agent_definition_id <> v_link.agent_definition_id
      or v_release.baseline_agent_definition_id <> v_baseline_definition.id
      or v_release.minimum_case_count <> p_minimum_case_count
      or v_release.minimum_average_score <> p_minimum_average_score
      or v_release.status <> 'RUNNING'
    then
      raise exception 'learning canary already exists with different immutable release context';
    end if;
    return v_release.id;
  end if;

  insert into agent.learning_candidate_releases(
    project_id, candidate_id, approval_request_id,
    candidate_agent_definition_id, baseline_agent_definition_id,
    status, minimum_case_count, minimum_average_score, started_by
  ) values (
    p_project_id, v_candidate.id, p_approval_request_id,
    v_link.agent_definition_id, v_baseline_definition.id,
    'RUNNING', p_minimum_case_count, p_minimum_average_score, p_actor_user_id
  ) returning * into v_release;

  update agent.learning_candidates
  set status = 'CANARY', updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'APPROVED_FOR_CONTROLLED_RELEASE', 'CANARY',
    'NON_AUTHORITATIVE_SHADOW_CANARY_STARTED', p_actor_user_id
  );

  return v_release.id;
end;
$$;

revoke all on function agent.start_learning_candidate_canary(uuid,uuid,uuid,uuid,integer,numeric)
  from public, anon, authenticated;
grant execute on function agent.start_learning_candidate_canary(uuid,uuid,uuid,uuid,integer,numeric)
  to service_role;

create or replace function agent.record_learning_candidate_canary_evidence(
  p_project_id uuid,
  p_release_id uuid,
  p_evaluation_result_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_release agent.learning_candidate_releases%rowtype;
  v_candidate agent.learning_candidates%rowtype;
  v_eval governance.ai_evaluation_results%rowtype;
  v_evaluation_id uuid;
  v_distinct_count integer;
  v_inserted integer := 0;
begin
  if p_project_id is null or p_release_id is null then raise exception 'project and release are required'; end if;
  if p_evaluation_result_ids is null or cardinality(p_evaluation_result_ids) = 0 then
    raise exception 'canary evaluation result ids are required';
  end if;
  select count(distinct value) into v_distinct_count from unnest(p_evaluation_result_ids) value;
  if v_distinct_count <> cardinality(p_evaluation_result_ids) then raise exception 'canary evaluation ids must be unique'; end if;

  select * into v_release
  from agent.learning_candidate_releases
  where id = p_release_id and project_id = p_project_id;
  if not found then raise exception 'learning canary release not found in project'; end if;
  if v_release.status <> 'RUNNING' then raise exception 'learning canary release is not RUNNING'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = v_release.candidate_id and project_id = p_project_id;
  if not found or v_candidate.status <> 'CANARY' then raise exception 'learning candidate is not in CANARY state'; end if;

  foreach v_evaluation_id in array p_evaluation_result_ids loop
    select * into v_eval
    from governance.ai_evaluation_results
    where id = v_evaluation_id and project_id = p_project_id;
    if not found then raise exception 'canary evaluation evidence is missing or cross-project: %', v_evaluation_id; end if;
    if v_eval.evaluation_type <> 'AGENT_SKILL'
      or v_eval.capability <> 'agent_skill:' || v_candidate.agent_key || ':' || v_candidate.skill_key
    then
      raise exception 'canary evaluation evidence is outside candidate agent skill capability: %', v_evaluation_id;
    end if;
    if v_eval.score is null or v_eval.pass is null then
      raise exception 'canary evaluation evidence must contain measured score and pass result: %', v_evaluation_id;
    end if;
    if v_eval.observed_at < v_release.canary_started_at or v_eval.created_at < v_release.canary_started_at then
      raise exception 'canary evaluation evidence predates the controlled canary: %', v_evaluation_id;
    end if;
    if lower(coalesce(v_eval.metadata->>'synthetic', v_eval.metadata->>'synthetic_bootstrap', '')) <> 'false'
      or lower(coalesce(v_eval.metadata->>'shadow_execution','')) <> 'true'
      or lower(coalesce(v_eval.metadata->>'production_action_authority','')) <> 'false'
      or v_eval.metadata->>'learning_candidate_id' <> v_candidate.id::text
      or v_eval.metadata->>'learning_release_id' <> v_release.id::text
      or v_eval.metadata->>'agent_definition_id' <> v_release.candidate_agent_definition_id::text
      or v_eval.metadata->>'candidate_version' <> v_candidate.candidate_version
    then
      raise exception 'canary evaluation evidence lacks canonical non-authoritative shadow provenance: %', v_evaluation_id;
    end if;

    insert into agent.learning_candidate_canary_evidence(
      project_id, release_id, candidate_id, evaluation_result_id,
      score, pass, observed_at, evidence_available_at
    ) values (
      p_project_id, v_release.id, v_candidate.id, v_eval.id,
      v_eval.score, v_eval.pass, v_eval.observed_at, v_eval.created_at
    )
    on conflict (release_id, evaluation_result_id) do nothing;

    if found then v_inserted := v_inserted + 1; end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function agent.record_learning_candidate_canary_evidence(uuid,uuid,uuid[])
  from public, anon, authenticated;
grant execute on function agent.record_learning_candidate_canary_evidence(uuid,uuid,uuid[])
  to service_role;

create or replace function agent.evaluate_learning_candidate_canary(
  p_project_id uuid,
  p_release_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_release agent.learning_candidate_releases%rowtype;
  v_candidate agent.learning_candidates%rowtype;
  v_case_count integer;
  v_failure_count integer;
  v_average_score numeric;
  v_target_status text;
  v_reason text;
begin
  if p_project_id is null or p_release_id is null or p_actor_user_id is null then
    raise exception 'project, release and actor are required';
  end if;

  select * into v_release
  from agent.learning_candidate_releases
  where id = p_release_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning canary release not found in project'; end if;
  if v_release.status <> 'RUNNING' then raise exception 'learning canary release is not RUNNING'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = v_release.candidate_id and project_id = p_project_id
  for update;
  if not found or v_candidate.status <> 'CANARY' then raise exception 'learning candidate is not in CANARY state'; end if;

  select count(*),
         count(*) filter (where pass is distinct from true),
         avg(score)
  into v_case_count, v_failure_count, v_average_score
  from agent.learning_candidate_canary_evidence
  where release_id = v_release.id and project_id = p_project_id;

  if v_case_count < v_release.minimum_case_count then
    raise exception 'learning canary has insufficient measured cases: % of %', v_case_count, v_release.minimum_case_count;
  end if;

  if v_failure_count > 0 then
    v_target_status := 'NOT_READY';
    v_reason := 'CANARY_EVALUATION_FAILURE';
    update agent.learning_candidate_releases
    set status = 'FAILED', verified_by = p_actor_user_id, updated_at = now()
    where id = v_release.id;
  elsif v_average_score is null or v_average_score < v_release.minimum_average_score then
    v_target_status := 'NOT_READY';
    v_reason := 'CANARY_AVERAGE_SCORE_BELOW_THRESHOLD';
    update agent.learning_candidate_releases
    set status = 'FAILED', verified_by = p_actor_user_id, updated_at = now()
    where id = v_release.id;
  else
    v_target_status := 'VERIFIED';
    v_reason := 'NON_AUTHORITATIVE_SHADOW_CANARY_VERIFIED';
    update agent.learning_candidate_releases
    set status = 'VERIFIED', verified_at = now(), verified_by = p_actor_user_id, updated_at = now()
    where id = v_release.id;
  end if;

  update agent.learning_candidates
  set status = v_target_status, updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'CANARY', v_target_status, v_reason, p_actor_user_id
  );

  return jsonb_build_object(
    'releaseId', v_release.id,
    'candidateId', v_candidate.id,
    'status', v_target_status,
    'caseCount', v_case_count,
    'failureCount', v_failure_count,
    'averageScore', v_average_score,
    'reason', v_reason
  );
end;
$$;

revoke all on function agent.evaluate_learning_candidate_canary(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.evaluate_learning_candidate_canary(uuid,uuid,uuid)
  to service_role;

create or replace function agent.activate_learning_candidate(
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
  v_release agent.learning_candidate_releases%rowtype;
  v_request governance.agent_approval_requests%rowtype;
  v_candidate_lifecycle agent.agent_version_lifecycle%rowtype;
  v_baseline_lifecycle agent.agent_version_lifecycle%rowtype;
begin
  if p_project_id is null or p_candidate_id is null or p_approval_request_id is null or p_actor_user_id is null then
    raise exception 'project, candidate, approval request and actor are required';
  end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'VERIFIED' then raise exception 'learning candidate must be VERIFIED before activation'; end if;

  select * into v_release
  from agent.learning_candidate_releases
  where candidate_id = p_candidate_id and project_id = p_project_id
  for update;
  if not found or v_release.status <> 'VERIFIED' then raise exception 'verified canary release evidence is required'; end if;
  if v_release.approval_request_id <> p_approval_request_id then raise exception 'activation approval request does not match release'; end if;

  select * into v_request
  from governance.agent_approval_requests
  where id = p_approval_request_id and project_id = p_project_id
  for update;
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
    or v_request.fingerprint_payload #>> '{parameters,agentDefinitionId}' <> v_release.candidate_agent_definition_id::text
  then
    raise exception 'learning candidate approval fingerprint no longer matches activation context';
  end if;

  select * into v_candidate_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_release.candidate_agent_definition_id
  for update;
  if not found or v_candidate_lifecycle.lifecycle_state <> 'CANDIDATE' then
    raise exception 'candidate agent definition must remain CANDIDATE before activation';
  end if;

  select * into v_baseline_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_release.baseline_agent_definition_id
  for update;
  if not found or v_baseline_lifecycle.lifecycle_state <> 'ACTIVE' then
    raise exception 'approved baseline agent definition must remain ACTIVE before activation';
  end if;

  perform agent.transition_agent_version_lifecycle(
    v_release.candidate_agent_definition_id,
    'ACTIVE',
    p_actor_user_id,
    'Governed learning candidate activation ' || v_candidate.id::text
  );

  update agent.learning_candidate_releases
  set status = 'ACTIVE', activated_at = now(), activated_by = p_actor_user_id, updated_at = now()
  where id = v_release.id;

  update agent.learning_candidates
  set status = 'ACTIVE', updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'VERIFIED', 'ACTIVE',
    'CONTROLLED_RELEASE_ACTIVATED_AFTER_VERIFIED_CANARY', p_actor_user_id
  );

  perform governance.finalize_agent_approval_execution(
    p_approval_request_id,
    p_actor_user_id,
    'LEARNING_CANDIDATE_RELEASE',
    v_candidate.id
  );

  return v_candidate.id;
end;
$$;

revoke all on function agent.activate_learning_candidate(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.activate_learning_candidate(uuid,uuid,uuid,uuid)
  to service_role;

create or replace function agent.rollback_learning_candidate(
  p_project_id uuid,
  p_candidate_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_release agent.learning_candidate_releases%rowtype;
  v_candidate_lifecycle agent.agent_version_lifecycle%rowtype;
  v_baseline_lifecycle agent.agent_version_lifecycle%rowtype;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if p_project_id is null or p_candidate_id is null or p_actor_user_id is null then
    raise exception 'project, candidate and actor are required';
  end if;
  if v_reason = '' then raise exception 'rollback reason is required'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'ACTIVE' then raise exception 'only ACTIVE learning candidates may be rolled back'; end if;

  select * into v_release
  from agent.learning_candidate_releases
  where candidate_id = p_candidate_id and project_id = p_project_id
  for update;
  if not found or v_release.status <> 'ACTIVE' then raise exception 'active controlled release evidence is required for rollback'; end if;

  select * into v_candidate_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_release.candidate_agent_definition_id
  for update;
  if not found or v_candidate_lifecycle.lifecycle_state <> 'ACTIVE' then
    raise exception 'candidate agent definition is not ACTIVE';
  end if;

  select * into v_baseline_lifecycle
  from agent.agent_version_lifecycle
  where agent_definition_id = v_release.baseline_agent_definition_id
  for update;
  if not found or v_baseline_lifecycle.lifecycle_state <> 'DEPRECATED' then
    raise exception 'approved baseline is not available in DEPRECATED state for rollback';
  end if;

  perform agent.transition_agent_version_lifecycle(
    v_release.baseline_agent_definition_id,
    'ACTIVE',
    p_actor_user_id,
    'Rollback governed learning candidate ' || v_candidate.id::text || ': ' || v_reason
  );

  update agent.learning_candidate_releases
  set status = 'ROLLED_BACK',
      rolled_back_at = now(),
      rolled_back_by = p_actor_user_id,
      rollback_reason = v_reason,
      updated_at = now()
  where id = v_release.id;

  update agent.learning_candidates
  set status = 'ROLLED_BACK', updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'ACTIVE', 'ROLLED_BACK',
    'CONTROLLED_RELEASE_ROLLBACK: ' || v_reason, p_actor_user_id
  );

  return v_candidate.id;
end;
$$;

revoke all on function agent.rollback_learning_candidate(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function agent.rollback_learning_candidate(uuid,uuid,uuid,text)
  to service_role;

comment on table agent.learning_candidate_releases is
  'Governed controlled release state. Canary remains non-authoritative while the candidate agent definition stays CANDIDATE; only verified evidence permits atomic activation.';
comment on table agent.learning_candidate_canary_evidence is
  'Append-only, explicitly non-authoritative shadow evidence for a controlled learning canary.';
