-- Phase 11 PGCL production-learning provenance hardening.
-- Positive-case learning must never treat synthetic, test, or unclassified
-- execution evidence as production learning authority.

create table if not exists agent.agent_run_learning_provenance (
  agent_run_id uuid primary key references agent.agent_runs(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  classification text not null check (classification in ('PRODUCTION_ELIGIBLE','SYNTHETIC_OR_TEST')),
  classification_source text not null check (classification_source = 'PGCL_GOVERNED_RUNTIME'),
  production_eligible boolean not null,
  synthetic_or_test_detected boolean not null,
  reason text not null check (length(btrim(reason)) > 0),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz not null default now(),
  constraint agent_run_learning_provenance_project_run_uq unique (project_id, agent_run_id),
  constraint agent_run_learning_provenance_consistency_ck check (
    (classification = 'PRODUCTION_ELIGIBLE' and production_eligible = true and synthetic_or_test_detected = false)
    or
    (classification = 'SYNTHETIC_OR_TEST' and production_eligible = false and synthetic_or_test_detected = true)
  )
);

create index if not exists agent_run_learning_provenance_project_eligibility_idx
  on agent.agent_run_learning_provenance(project_id, production_eligible, recorded_at desc);

alter table agent.agent_run_learning_provenance enable row level security;

drop policy if exists agent_run_learning_provenance_project_read
  on agent.agent_run_learning_provenance;
create policy agent_run_learning_provenance_project_read
  on agent.agent_run_learning_provenance
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.agent_run_learning_provenance
  from public, anon, authenticated, service_role;
grant select on agent.agent_run_learning_provenance
  to authenticated, service_role;

drop trigger if exists reject_agent_run_learning_provenance_mutation
  on agent.agent_run_learning_provenance;
create trigger reject_agent_run_learning_provenance_mutation
before update or delete on agent.agent_run_learning_provenance
for each row execute function agent.reject_learning_candidate_evidence_mutation();

alter table agent.positive_learning_cases
  add column if not exists production_eligible boolean not null default false,
  add column if not exists learning_provenance_recorded_at timestamptz;

alter table agent.positive_learning_case_occurrences
  add column if not exists production_eligible boolean not null default false,
  add column if not exists learning_provenance_recorded_at timestamptz;

alter table agent.positive_learning_cases
  drop constraint if exists positive_learning_cases_production_provenance_ck;
alter table agent.positive_learning_cases
  add constraint positive_learning_cases_production_provenance_ck
  check (
    production_eligible = false
    or learning_provenance_recorded_at is not null
  );

alter table agent.positive_learning_case_occurrences
  drop constraint if exists positive_learning_case_occurrences_production_provenance_ck;
alter table agent.positive_learning_case_occurrences
  add constraint positive_learning_case_occurrences_production_provenance_ck
  check (
    production_eligible = false
    or learning_provenance_recorded_at is not null
  );

create or replace function agent.record_pgcl_run_learning_provenance(
  p_project_id uuid,
  p_agent_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent, catalog, app
as $$
declare
  v_run agent.agent_runs%rowtype;
  v_parent agent.agent_runs%rowtype;
  v_dataset_metadata jsonb := '{}'::jsonb;
  v_version_metadata jsonb := '{}'::jsonb;
  v_source_metadata jsonb := '{}'::jsonb;
  v_project_metadata jsonb := '{}'::jsonb;
  v_nonproduction boolean := false;
  v_reason text := 'TRUSTED_GOVERNED_RUNTIME_NON_SYNTHETIC';
  v_classification text := 'PRODUCTION_ELIGIBLE';
  v_existing agent.agent_run_learning_provenance%rowtype;
begin
  if p_project_id is null or p_agent_run_id is null then
    raise exception 'project and agent run are required for PGCL learning provenance';
  end if;

  select * into v_run
  from agent.agent_runs r
  where r.id = p_agent_run_id
    and r.project_id = p_project_id;

  if not found then
    raise exception 'PGCL learning provenance source run is missing or cross-project';
  end if;
  if v_run.status <> 'SUCCEEDED' then
    raise exception 'PGCL learning provenance requires a SUCCEEDED agent run';
  end if;

  if v_run.parent_run_id is not null then
    select * into v_parent
    from agent.agent_runs r
    where r.id = v_run.parent_run_id
      and r.project_id = p_project_id;
  end if;

  select coalesce(p.metadata, '{}'::jsonb)
  into v_project_metadata
  from app.projects p
  where p.id = p_project_id;

  if v_run.dataset_version_id is not null then
    select
      coalesce(d.metadata, '{}'::jsonb),
      coalesce(dv.metadata, '{}'::jsonb),
      coalesce(ds.connection_metadata, '{}'::jsonb)
    into v_dataset_metadata, v_version_metadata, v_source_metadata
    from catalog.dataset_versions dv
    join catalog.datasets d on d.id = dv.dataset_id
    left join catalog.data_sources ds on ds.id = d.data_source_id
    where dv.id = v_run.dataset_version_id
      and d.project_id = p_project_id;
  elsif v_run.dataset_id is not null then
    select
      coalesce(d.metadata, '{}'::jsonb),
      '{}'::jsonb,
      coalesce(ds.connection_metadata, '{}'::jsonb)
    into v_dataset_metadata, v_version_metadata, v_source_metadata
    from catalog.datasets d
    left join catalog.data_sources ds on ds.id = d.data_source_id
    where d.id = v_run.dataset_id
      and d.project_id = p_project_id;
  end if;

  v_nonproduction :=
    lower(coalesce(v_run.input->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'acceptance_test', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'smokeTest', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'smoke_test', 'false')) = 'true'
    or lower(coalesce(v_run.input->'metadata'->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_run.output->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_run.output->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_run.output->'metadata'->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_dataset_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_dataset_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_version_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_version_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_source_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_source_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'test_fixture', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'created_via', '')) in (
      'backend_regression_test',
      'synthetic_fixture',
      'test_fixture'
    )
    or (
      v_run.parent_run_id is not null
      and (
        lower(coalesce(v_parent.input->>'synthetic', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'synthetic_bootstrap', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'acceptance_test', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'smokeTest', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'smoke_test', 'false')) = 'true'
        or lower(coalesce(v_parent.output->>'synthetic', 'false')) = 'true'
        or lower(coalesce(v_parent.output->>'synthetic_bootstrap', 'false')) = 'true'
      )
    );

  if v_nonproduction then
    v_classification := 'SYNTHETIC_OR_TEST';
    v_reason := 'SOURCE_RUN_OR_DATA_PROVENANCE_MARKED_SYNTHETIC_OR_TEST';
  end if;

  select * into v_existing
  from agent.agent_run_learning_provenance p
  where p.agent_run_id = p_agent_run_id;

  if found then
    if v_existing.project_id <> p_project_id
      or v_existing.classification <> v_classification
      or v_existing.production_eligible <> (not v_nonproduction)
      or v_existing.synthetic_or_test_detected <> v_nonproduction
    then
      raise exception 'immutable PGCL learning provenance no longer matches source evidence';
    end if;

    return jsonb_build_object(
      'agentRunId', v_existing.agent_run_id,
      'projectId', v_existing.project_id,
      'classification', v_existing.classification,
      'productionEligible', v_existing.production_eligible,
      'syntheticOrTestDetected', v_existing.synthetic_or_test_detected,
      'reason', v_existing.reason,
      'recordedAt', v_existing.recorded_at
    );
  end if;

  insert into agent.agent_run_learning_provenance(
    agent_run_id,
    project_id,
    classification,
    classification_source,
    production_eligible,
    synthetic_or_test_detected,
    reason,
    evidence
  ) values (
    p_agent_run_id,
    p_project_id,
    v_classification,
    'PGCL_GOVERNED_RUNTIME',
    not v_nonproduction,
    v_nonproduction,
    v_reason,
    jsonb_build_object(
      'datasetId', v_run.dataset_id,
      'datasetVersionId', v_run.dataset_version_id,
      'parentRunId', v_run.parent_run_id,
      'datasetSynthetic', lower(coalesce(v_dataset_metadata->>'synthetic', 'false')) = 'true',
      'versionSynthetic', lower(coalesce(v_version_metadata->>'synthetic', 'false')) = 'true',
      'sourceSynthetic', lower(coalesce(v_source_metadata->>'synthetic', 'false')) = 'true',
      'projectSyntheticOrTest',
        lower(coalesce(v_project_metadata->>'synthetic', 'false')) = 'true'
        or lower(coalesce(v_project_metadata->>'synthetic_bootstrap', 'false')) = 'true'
        or lower(coalesce(v_project_metadata->>'test_fixture', 'false')) = 'true'
        or lower(coalesce(v_project_metadata->>'created_via', '')) in (
          'backend_regression_test',
          'synthetic_fixture',
          'test_fixture'
        )
    )
  );

  return jsonb_build_object(
    'agentRunId', p_agent_run_id,
    'projectId', p_project_id,
    'classification', v_classification,
    'productionEligible', not v_nonproduction,
    'syntheticOrTestDetected', v_nonproduction,
    'reason', v_reason
  );
end;
$$;

revoke all on function agent.record_pgcl_run_learning_provenance(uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.record_pgcl_run_learning_provenance(uuid,uuid)
  to service_role;

create or replace function agent.enforce_pgcl_production_learning_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_provenance agent.agent_run_learning_provenance%rowtype;
begin
  select * into v_provenance
  from agent.agent_run_learning_provenance p
  where p.agent_run_id = new.source_agent_run_id
    and p.project_id = new.project_id;

  if not found then
    raise exception 'PGCL source run has no trusted production learning provenance';
  end if;
  if v_provenance.production_eligible is not true
    or v_provenance.classification <> 'PRODUCTION_ELIGIBLE'
    or v_provenance.synthetic_or_test_detected is not false
  then
    raise exception 'synthetic or test evidence is not eligible for PGCL production learning';
  end if;

  new.production_eligible := true;
  new.learning_provenance_recorded_at := v_provenance.recorded_at;
  return new;
end;
$$;

revoke all on function agent.enforce_pgcl_production_learning_provenance()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_pgcl_positive_case_production_provenance
  on agent.positive_learning_cases;
create trigger enforce_pgcl_positive_case_production_provenance
before insert on agent.positive_learning_cases
for each row execute function agent.enforce_pgcl_production_learning_provenance();

drop trigger if exists enforce_pgcl_occurrence_production_provenance
  on agent.positive_learning_case_occurrences;
create trigger enforce_pgcl_occurrence_production_provenance
before insert on agent.positive_learning_case_occurrences
for each row execute function agent.enforce_pgcl_production_learning_provenance();

create or replace function agent.enforce_pgcl_production_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
begin
  if new.review_status = 'APPROVED'
    and old.review_status is distinct from new.review_status
    and new.production_eligible is not true
  then
    raise exception 'unclassified or non-production PGCL evidence cannot be approved for reusable learning';
  end if;

  if new.production_eligible is distinct from old.production_eligible
    or new.learning_provenance_recorded_at is distinct from old.learning_provenance_recorded_at
  then
    raise exception 'PGCL production-learning provenance is immutable';
  end if;

  return new;
end;
$$;

revoke all on function agent.enforce_pgcl_production_approval()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_pgcl_production_approval
  on agent.positive_learning_cases;
create trigger enforce_pgcl_production_approval
before update on agent.positive_learning_cases
for each row execute function agent.enforce_pgcl_production_approval();

create or replace function agent.list_approved_positive_learning_cases(
  p_project_id uuid,
  p_agent_definition_id uuid,
  p_limit integer default 50
)
returns table(
  id uuid,
  candidate_id text,
  case_key text,
  problem_type text,
  context jsonb,
  recommendation jsonb,
  evidence jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, agent
as $$
  select
    lc.id,
    lc.evidence->>'pgcl_candidate_id' as candidate_id,
    lc.case_key,
    lc.problem_type,
    lc.context,
    lc.recommendation,
    lc.evidence,
    lc.updated_at
  from agent.agent_learning_cases lc
  join agent.positive_learning_cases plc
    on plc.project_id = lc.project_id
   and plc.candidate_id::text = lc.evidence->>'pgcl_candidate_id'
  where lc.project_id = p_project_id
    and lc.agent_definition_id = p_agent_definition_id
    and lc.source_kind = 'PGCL_POSITIVE_CASE'
    and lc.status = 'ACTIVE'
    and lc.decision_status = 'VERIFIED'
    and lc.outcome_status = 'VERIFIED'
    and plc.review_status = 'APPROVED'
    and plc.production_eligible = true
    and plc.learning_provenance_recorded_at is not null
    and nullif(btrim(lc.evidence->>'pgcl_candidate_id'),'') is not null
    and nullif(btrim(lc.recommendation->>'reusable_lesson'),'') is not null
  order by lc.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function agent.list_approved_positive_learning_cases(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function agent.list_approved_positive_learning_cases(uuid,uuid,integer)
  to service_role;

comment on table agent.agent_run_learning_provenance is
  'Append-only trusted classification of whether a governed agent run is eligible to seed production PGCL learning. Missing provenance is fail-closed.';
comment on column agent.positive_learning_cases.production_eligible is
  'True only when insert-time trusted run provenance proves the source execution is production-eligible and non-synthetic.';
comment on column agent.positive_learning_case_occurrences.production_eligible is
  'True only when the occurrence source run has trusted production-eligible learning provenance.';
