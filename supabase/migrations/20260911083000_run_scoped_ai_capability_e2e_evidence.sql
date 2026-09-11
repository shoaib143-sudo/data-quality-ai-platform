-- V6 run-scoped AI capability execution evidence.
--
-- The project-wide capability matrix is an inventory used only to seed the canonical
-- 75 capability identities for a run. It is never accepted as proof that a capability
-- executed in that run. Execution and verification remain independent states, while
-- evidence is append-only and project scoped.

create table governance.ai_capability_e2e_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  organization_id uuid not null,
  run_state text not null default 'OPEN'
    check (run_state in ('OPEN', 'FINALIZED')),
  assessment_state text not null default 'NOT_ASSESSED'
    check (assessment_state in ('NOT_ASSESSED', 'PASS', 'FAIL')),
  capability_count integer not null default 75
    check (capability_count = 75),
  executed_count integer not null default 0 check (executed_count between 0 and 75),
  verified_count integer not null default 0 check (verified_count between 0 and 75),
  blocked_count integer not null default 0 check (blocked_count between 0 and 75),
  failed_count integer not null default 0 check (failed_count between 0 and 75),
  verification_failed_count integer not null default 0
    check (verification_failed_count between 0 and 75),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  check ((run_state = 'OPEN' and finalized_at is null)
      or (run_state = 'FINALIZED' and finalized_at is not null)),
  check (assessment_state <> 'PASS' or run_state = 'FINALIZED')
);

create table governance.ai_capability_e2e_run_datasets (
  run_id uuid not null references governance.ai_capability_e2e_runs(id) on delete restrict,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete restrict,
  attached_at timestamptz not null default now(),
  primary key (run_id, dataset_version_id)
);

create table governance.ai_capability_e2e_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references governance.ai_capability_e2e_runs(id) on delete restrict,
  capability_sr_no integer not null check (capability_sr_no between 1 and 75),
  module text not null check (btrim(module) <> ''),
  capability text not null check (btrim(capability) <> ''),
  execution_state text not null default 'NOT_RUN'
    check (execution_state in ('NOT_RUN', 'EXECUTED', 'BLOCKED', 'FAILED')),
  verification_state text not null default 'UNKNOWN'
    check (verification_state in ('UNKNOWN', 'VERIFIED', 'FAILED', 'INCONCLUSIVE')),
  blocker_code text,
  state_detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state_detail) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, capability_sr_no),
  check ((execution_state = 'BLOCKED' and nullif(btrim(blocker_code), '') is not null)
      or (execution_state <> 'BLOCKED' and blocker_code is null)),
  check (verification_state <> 'VERIFIED' or execution_state = 'EXECUTED')
);

create table governance.ai_capability_e2e_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references governance.ai_capability_e2e_runs(id) on delete restrict,
  result_id uuid not null references governance.ai_capability_e2e_results(id) on delete restrict,
  project_id uuid not null references app.projects(id) on delete restrict,
  evidence_purpose text not null
    check (evidence_purpose in ('EXECUTION', 'VERIFICATION')),
  authority_class text not null
    check (authority_class in (
      'AUTHORITATIVE FACT',
      'OBSERVED EVIDENCE',
      'DERIVED INTELLIGENCE',
      'GOVERNED DECISION'
    )),
  entity_type text not null
    check (entity_type in (
      'DATASET_VERSION',
      'PROFILE_RUN',
      'PROFILE_METRIC',
      'PROFILE_FINDING',
      'QUALITY_SCORE',
      'GOVERNANCE_INSIGHT',
      'AGENT_RUN',
      'AUDIT_EVENT',
      'CONTROL_EVALUATION',
      'GOVERNED_ACTION_OUTCOME',
      'AI_EVALUATION_RESULT'
    )),
  entity_id uuid not null,
  evidence_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_payload) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (evidence_purpose <> 'VERIFICATION'
      or authority_class in ('AUTHORITATIVE FACT', 'GOVERNED DECISION'))
);

create index ai_capability_e2e_runs_project_idx
  on governance.ai_capability_e2e_runs(project_id, created_at desc);
create index ai_capability_e2e_results_run_state_idx
  on governance.ai_capability_e2e_results(run_id, execution_state, verification_state);
create index ai_capability_e2e_evidence_run_result_idx
  on governance.ai_capability_e2e_evidence(run_id, result_id, evidence_purpose);
create index ai_capability_e2e_evidence_entity_idx
  on governance.ai_capability_e2e_evidence(entity_type, entity_id);
create index ai_capability_e2e_run_datasets_version_idx
  on governance.ai_capability_e2e_run_datasets(dataset_version_id);

create or replace function governance.ai_capability_e2e_entity_project(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, governance, profiling, catalog, agent, app
as $$
declare
  v_project_id uuid;
begin
  case p_entity_type
    when 'DATASET_VERSION' then
      select d.project_id into v_project_id
      from catalog.dataset_versions dv
      join catalog.datasets d on d.id = dv.dataset_id
      where dv.id = p_entity_id;
    when 'PROFILE_RUN' then
      select d.project_id into v_project_id
      from profiling.profile_runs pr
      join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
      join catalog.datasets d on d.id = dv.dataset_id
      where pr.id = p_entity_id;
    when 'PROFILE_METRIC' then
      select d.project_id into v_project_id
      from profiling.profile_metrics pm
      join profiling.profile_runs pr on pr.id = pm.profile_run_id
      join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
      join catalog.datasets d on d.id = dv.dataset_id
      where pm.id = p_entity_id;
    when 'PROFILE_FINDING' then
      select d.project_id into v_project_id
      from profiling.profile_findings pf
      join profiling.profile_runs pr on pr.id = pf.profile_run_id
      join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
      join catalog.datasets d on d.id = dv.dataset_id
      where pf.id = p_entity_id;
    when 'QUALITY_SCORE' then
      select d.project_id into v_project_id
      from profiling.data_quality_scores qs
      join profiling.profile_runs pr on pr.id = qs.profile_run_id
      join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
      join catalog.datasets d on d.id = dv.dataset_id
      where qs.id = p_entity_id;
    when 'GOVERNANCE_INSIGHT' then
      select gi.project_id into v_project_id
      from profiling.profile_run_governance_insights gi
      where gi.profile_run_id = p_entity_id;
    when 'AGENT_RUN' then
      select ar.project_id into v_project_id
      from agent.agent_runs ar
      where ar.id = p_entity_id;
    when 'AUDIT_EVENT' then
      select ae.project_id into v_project_id
      from governance.audit_events ae
      where ae.id = p_entity_id;
    when 'CONTROL_EVALUATION' then
      select ce.project_id into v_project_id
      from governance.control_evaluations ce
      where ce.id = p_entity_id;
    when 'GOVERNED_ACTION_OUTCOME' then
      select gao.project_id into v_project_id
      from governance.governed_action_outcomes gao
      where gao.id = p_entity_id;
    when 'AI_EVALUATION_RESULT' then
      select aer.project_id into v_project_id
      from governance.ai_evaluation_results aer
      where aer.id = p_entity_id;
    else
      raise exception 'unsupported capability evidence entity type: %', p_entity_type;
  end case;

  return v_project_id;
end;
$$;

create or replace function governance.create_ai_capability_e2e_run(
  p_project_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, governance, app
as $$
declare
  v_run_id uuid;
  v_organization_id uuid;
  v_capability_count integer;
  v_inserted_count integer;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'run metadata must be a JSON object';
  end if;

  select p.organization_id
    into v_organization_id
  from app.projects p
  where p.id = p_project_id;

  if v_organization_id is null then
    raise exception 'project % does not exist', p_project_id;
  end if;

  select count(*)::integer
    into v_capability_count
  from governance.generate_ai_capability_matrix(p_project_id);

  if v_capability_count <> 75 then
    raise exception 'canonical capability matrix must contain exactly 75 rows, found %', v_capability_count;
  end if;

  insert into governance.ai_capability_e2e_runs (
    project_id,
    organization_id,
    metadata
  )
  values (
    p_project_id,
    v_organization_id,
    p_metadata
  )
  returning id into v_run_id;

  insert into governance.ai_capability_e2e_results (
    run_id,
    capability_sr_no,
    module,
    capability
  )
  select
    v_run_id,
    m.sr_no,
    m.module,
    m.capability
  from governance.generate_ai_capability_matrix(p_project_id) m
  order by m.sr_no;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> 75 then
    raise exception 'run % seeded % capabilities instead of 75', v_run_id, v_inserted_count;
  end if;

  return v_run_id;
end;
$$;

create or replace function governance.attach_ai_capability_e2e_dataset_version(
  p_run_id uuid,
  p_dataset_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, governance, catalog
as $$
declare
  v_run_project_id uuid;
  v_run_state text;
  v_dataset_project_id uuid;
begin
  select r.project_id, r.run_state
    into v_run_project_id, v_run_state
  from governance.ai_capability_e2e_runs r
  where r.id = p_run_id
  for update;

  if v_run_project_id is null then
    raise exception 'capability run % does not exist', p_run_id;
  end if;
  if v_run_state <> 'OPEN' then
    raise exception 'capability run % is finalized', p_run_id;
  end if;

  select d.project_id
    into v_dataset_project_id
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  where dv.id = p_dataset_version_id;

  if v_dataset_project_id is null then
    raise exception 'dataset version % does not exist', p_dataset_version_id;
  end if;
  if v_dataset_project_id <> v_run_project_id then
    raise exception 'dataset version % belongs to a different project', p_dataset_version_id;
  end if;

  insert into governance.ai_capability_e2e_run_datasets(run_id, dataset_version_id)
  values (p_run_id, p_dataset_version_id)
  on conflict do nothing;
end;
$$;

create or replace function governance.append_ai_capability_e2e_evidence(
  p_run_id uuid,
  p_capability_sr_no integer,
  p_evidence_purpose text,
  p_authority_class text,
  p_entity_type text,
  p_entity_id uuid,
  p_evidence_payload jsonb default '{}'::jsonb,
  p_observed_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_result_id uuid;
  v_run_project_id uuid;
  v_run_state text;
  v_entity_project_id uuid;
  v_evidence_id uuid;
begin
  if p_evidence_payload is null or jsonb_typeof(p_evidence_payload) <> 'object' then
    raise exception 'evidence payload must be a JSON object';
  end if;
  if p_evidence_purpose not in ('EXECUTION', 'VERIFICATION') then
    raise exception 'invalid evidence purpose %', p_evidence_purpose;
  end if;
  if p_authority_class not in (
    'AUTHORITATIVE FACT',
    'OBSERVED EVIDENCE',
    'DERIVED INTELLIGENCE',
    'GOVERNED DECISION'
  ) then
    raise exception 'invalid evidence authority class %', p_authority_class;
  end if;
  if p_evidence_purpose = 'VERIFICATION'
     and p_authority_class not in ('AUTHORITATIVE FACT', 'GOVERNED DECISION') then
    raise exception 'verification evidence must be authoritative fact or governed decision';
  end if;
  if p_observed_at is null or p_observed_at > now() + interval '5 minutes' then
    raise exception 'evidence observed_at must be present and not materially future-dated';
  end if;

  select r.project_id, r.run_state, x.id
    into v_run_project_id, v_run_state, v_result_id
  from governance.ai_capability_e2e_runs r
  join governance.ai_capability_e2e_results x on x.run_id = r.id
  where r.id = p_run_id
    and x.capability_sr_no = p_capability_sr_no
  for update of x;

  if v_result_id is null then
    raise exception 'capability % is not part of run %', p_capability_sr_no, p_run_id;
  end if;
  if v_run_state <> 'OPEN' then
    raise exception 'capability run % is finalized', p_run_id;
  end if;

  v_entity_project_id := governance.ai_capability_e2e_entity_project(p_entity_type, p_entity_id);
  if v_entity_project_id is null then
    raise exception 'evidence entity %:% does not exist', p_entity_type, p_entity_id;
  end if;
  if v_entity_project_id <> v_run_project_id then
    raise exception 'evidence entity %:% belongs to a different project', p_entity_type, p_entity_id;
  end if;

  insert into governance.ai_capability_e2e_evidence (
    run_id,
    result_id,
    project_id,
    evidence_purpose,
    authority_class,
    entity_type,
    entity_id,
    evidence_payload,
    observed_at
  )
  values (
    p_run_id,
    v_result_id,
    v_run_project_id,
    p_evidence_purpose,
    p_authority_class,
    p_entity_type,
    p_entity_id,
    p_evidence_payload,
    p_observed_at
  )
  returning id into v_evidence_id;

  return v_evidence_id;
end;
$$;

create or replace function governance.record_ai_capability_e2e_state(
  p_run_id uuid,
  p_capability_sr_no integer,
  p_execution_state text,
  p_verification_state text default 'UNKNOWN',
  p_blocker_code text default null,
  p_state_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_result_id uuid;
  v_run_state text;
begin
  if p_execution_state not in ('NOT_RUN', 'EXECUTED', 'BLOCKED', 'FAILED') then
    raise exception 'invalid execution state %', p_execution_state;
  end if;
  if p_verification_state not in ('UNKNOWN', 'VERIFIED', 'FAILED', 'INCONCLUSIVE') then
    raise exception 'invalid verification state %', p_verification_state;
  end if;
  if p_state_detail is null or jsonb_typeof(p_state_detail) <> 'object' then
    raise exception 'state detail must be a JSON object';
  end if;
  if p_execution_state = 'BLOCKED' and nullif(btrim(p_blocker_code), '') is null then
    raise exception 'BLOCKED capability requires blocker_code';
  end if;
  if p_execution_state <> 'BLOCKED' and p_blocker_code is not null then
    raise exception 'blocker_code is valid only for BLOCKED execution state';
  end if;
  if p_verification_state = 'VERIFIED' and p_execution_state <> 'EXECUTED' then
    raise exception 'VERIFIED outcome requires EXECUTED state but does not follow from it automatically';
  end if;

  select x.id, r.run_state
    into v_result_id, v_run_state
  from governance.ai_capability_e2e_results x
  join governance.ai_capability_e2e_runs r on r.id = x.run_id
  where x.run_id = p_run_id
    and x.capability_sr_no = p_capability_sr_no
  for update of x;

  if v_result_id is null then
    raise exception 'capability % is not part of run %', p_capability_sr_no, p_run_id;
  end if;
  if v_run_state <> 'OPEN' then
    raise exception 'capability run % is finalized', p_run_id;
  end if;

  if p_execution_state = 'EXECUTED'
     and not exists (
       select 1
       from governance.ai_capability_e2e_evidence e
       where e.result_id = v_result_id
         and e.run_id = p_run_id
         and e.evidence_purpose = 'EXECUTION'
     ) then
    raise exception 'EXECUTED capability requires run-scoped execution evidence';
  end if;

  if p_verification_state = 'VERIFIED'
     and not exists (
       select 1
       from governance.ai_capability_e2e_evidence e
       where e.result_id = v_result_id
         and e.run_id = p_run_id
         and e.evidence_purpose = 'VERIFICATION'
         and e.authority_class in ('AUTHORITATIVE FACT', 'GOVERNED DECISION')
     ) then
    raise exception 'VERIFIED capability requires separate authoritative verification evidence';
  end if;

  update governance.ai_capability_e2e_results
  set execution_state = p_execution_state,
      verification_state = p_verification_state,
      blocker_code = case when p_execution_state = 'BLOCKED' then p_blocker_code else null end,
      state_detail = p_state_detail,
      updated_at = now()
  where id = v_result_id;
end;
$$;

create or replace function governance.finalize_ai_capability_e2e_run(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_run_state text;
  v_result_count integer;
  v_dataset_count integer;
  v_executed_count integer;
  v_verified_count integer;
  v_blocked_count integer;
  v_failed_count integer;
  v_verification_failed_count integer;
  v_missing_execution_evidence integer;
  v_missing_verification_evidence integer;
  v_assessment_state text;
begin
  select r.run_state
    into v_run_state
  from governance.ai_capability_e2e_runs r
  where r.id = p_run_id
  for update;

  if v_run_state is null then
    raise exception 'capability run % does not exist', p_run_id;
  end if;
  if v_run_state <> 'OPEN' then
    raise exception 'capability run % is already finalized', p_run_id;
  end if;

  select count(*)::integer into v_dataset_count
  from governance.ai_capability_e2e_run_datasets d
  where d.run_id = p_run_id;
  if v_dataset_count = 0 then
    raise exception 'capability run % must include at least one dataset version', p_run_id;
  end if;

  select
    count(*)::integer,
    count(*) filter (where execution_state = 'EXECUTED')::integer,
    count(*) filter (where verification_state = 'VERIFIED')::integer,
    count(*) filter (where execution_state = 'BLOCKED')::integer,
    count(*) filter (where execution_state = 'FAILED')::integer,
    count(*) filter (where verification_state = 'FAILED')::integer
  into
    v_result_count,
    v_executed_count,
    v_verified_count,
    v_blocked_count,
    v_failed_count,
    v_verification_failed_count
  from governance.ai_capability_e2e_results
  where run_id = p_run_id;

  if v_result_count <> 75 then
    raise exception 'capability run % has % result rows instead of 75', p_run_id, v_result_count;
  end if;

  select count(*)::integer into v_missing_execution_evidence
  from governance.ai_capability_e2e_results x
  where x.run_id = p_run_id
    and x.execution_state = 'EXECUTED'
    and not exists (
      select 1
      from governance.ai_capability_e2e_evidence e
      where e.run_id = p_run_id
        and e.result_id = x.id
        and e.evidence_purpose = 'EXECUTION'
    );
  if v_missing_execution_evidence <> 0 then
    raise exception 'capability run % has % EXECUTED rows without run-scoped execution evidence',
      p_run_id, v_missing_execution_evidence;
  end if;

  select count(*)::integer into v_missing_verification_evidence
  from governance.ai_capability_e2e_results x
  where x.run_id = p_run_id
    and x.verification_state = 'VERIFIED'
    and not exists (
      select 1
      from governance.ai_capability_e2e_evidence e
      where e.run_id = p_run_id
        and e.result_id = x.id
        and e.evidence_purpose = 'VERIFICATION'
        and e.authority_class in ('AUTHORITATIVE FACT', 'GOVERNED DECISION')
    );
  if v_missing_verification_evidence <> 0 then
    raise exception 'capability run % has % VERIFIED rows without authoritative verification evidence',
      p_run_id, v_missing_verification_evidence;
  end if;

  if v_executed_count = 75 and v_verified_count = 75 then
    v_assessment_state := 'PASS';
  elsif v_failed_count > 0 or v_verification_failed_count > 0 then
    v_assessment_state := 'FAIL';
  else
    v_assessment_state := 'NOT_ASSESSED';
  end if;

  update governance.ai_capability_e2e_runs
  set run_state = 'FINALIZED',
      assessment_state = v_assessment_state,
      capability_count = 75,
      executed_count = v_executed_count,
      verified_count = v_verified_count,
      blocked_count = v_blocked_count,
      failed_count = v_failed_count,
      verification_failed_count = v_verification_failed_count,
      finalized_at = now()
  where id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'run_state', 'FINALIZED',
    'assessment_state', v_assessment_state,
    'capability_count', 75,
    'executed_count', v_executed_count,
    'verified_count', v_verified_count,
    'blocked_count', v_blocked_count,
    'failed_count', v_failed_count,
    'verification_failed_count', v_verification_failed_count,
    'dataset_version_count', v_dataset_count
  );
end;
$$;

create or replace function governance.reject_ai_capability_e2e_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'run-scoped capability evidence is append-only';
end;
$$;

create trigger ai_capability_e2e_evidence_immutable
before update or delete on governance.ai_capability_e2e_evidence
for each row execute function governance.reject_ai_capability_e2e_evidence_mutation();

alter table governance.ai_capability_e2e_runs enable row level security;
alter table governance.ai_capability_e2e_run_datasets enable row level security;
alter table governance.ai_capability_e2e_results enable row level security;
alter table governance.ai_capability_e2e_evidence enable row level security;

create policy ai_capability_e2e_runs_internal_only
on governance.ai_capability_e2e_runs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy ai_capability_e2e_run_datasets_internal_only
on governance.ai_capability_e2e_run_datasets
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy ai_capability_e2e_results_internal_only
on governance.ai_capability_e2e_results
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy ai_capability_e2e_evidence_internal_only
on governance.ai_capability_e2e_evidence
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table governance.ai_capability_e2e_runs from public, anon, authenticated, service_role;
revoke all on table governance.ai_capability_e2e_run_datasets from public, anon, authenticated, service_role;
revoke all on table governance.ai_capability_e2e_results from public, anon, authenticated, service_role;
revoke all on table governance.ai_capability_e2e_evidence from public, anon, authenticated, service_role;

grant select on table governance.ai_capability_e2e_runs to service_role;
grant select on table governance.ai_capability_e2e_run_datasets to service_role;
grant select on table governance.ai_capability_e2e_results to service_role;
grant select on table governance.ai_capability_e2e_evidence to service_role;

revoke all on function governance.ai_capability_e2e_entity_project(text, uuid) from public, anon, authenticated;
revoke all on function governance.create_ai_capability_e2e_run(uuid, jsonb) from public, anon, authenticated;
revoke all on function governance.attach_ai_capability_e2e_dataset_version(uuid, uuid) from public, anon, authenticated;
revoke all on function governance.append_ai_capability_e2e_evidence(uuid, integer, text, text, text, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function governance.record_ai_capability_e2e_state(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function governance.finalize_ai_capability_e2e_run(uuid) from public, anon, authenticated;
revoke all on function governance.reject_ai_capability_e2e_evidence_mutation() from public, anon, authenticated, service_role;

grant execute on function governance.ai_capability_e2e_entity_project(text, uuid) to service_role;
grant execute on function governance.create_ai_capability_e2e_run(uuid, jsonb) to service_role;
grant execute on function governance.attach_ai_capability_e2e_dataset_version(uuid, uuid) to service_role;
grant execute on function governance.append_ai_capability_e2e_evidence(uuid, integer, text, text, text, uuid, jsonb, timestamptz) to service_role;
grant execute on function governance.record_ai_capability_e2e_state(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function governance.finalize_ai_capability_e2e_run(uuid) to service_role;

comment on table governance.ai_capability_e2e_runs is
  'Run-scoped 75-capability execution ledger. Final PASS requires both EXECUTED and separately VERIFIED state for all 75 capabilities.';
comment on table governance.ai_capability_e2e_evidence is
  'Append-only structured evidence bound to canonical same-project entities. Project-wide matrix evidence alone is never run execution proof.';
