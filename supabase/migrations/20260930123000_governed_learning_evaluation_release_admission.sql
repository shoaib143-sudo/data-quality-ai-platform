-- Governed learning prospective evaluation persistence and release admission.
-- Policies and decisions are append-only evidence. Browser roles may read project-scoped
-- evidence but cannot create or mutate it. Release approval must bind an IMPROVED decision.

create table if not exists agent.learning_evaluation_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  dataset_manifest_id uuid not null,
  policy_key text not null,
  agent_key text not null,
  skill_key text not null,
  mode text not null check (mode in ('GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
  dataset_version_ids text[] not null,
  baseline_version text not null,
  candidate_version text not null,
  rollback_ref text not null,
  evaluator_actor_id text not null,
  proposer_actor_id text not null,
  rubric_ref text not null,
  calibration_ref text not null,
  manifest_hash text not null,
  locked_at timestamptz not null,
  primary_metric text not null,
  analysis_plan_ref text not null,
  sample_size integer not null check (sample_size > 0),
  minimum_gain numeric not null check (minimum_gain > 0 and minimum_gain <= 1),
  minimum_score numeric not null check (minimum_score >= 0 and minimum_score <= 1),
  total_cost_budget numeric not null check (total_cost_budget >= 0),
  per_run_cost_budget numeric not null check (per_run_cost_budget >= 0),
  total_token_budget bigint not null check (total_token_budget >= 0),
  per_run_token_budget bigint not null check (per_run_token_budget >= 0),
  latency_ms_budget integer not null check (latency_ms_budget > 0),
  created_at timestamptz not null default now(),
  constraint learning_evaluation_policy_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_evaluation_policy_manifest_fk
    foreign key (dataset_manifest_id, project_id)
    references agent.learning_benchmark_dataset_manifests(id, project_id)
    on delete restrict,
  constraint learning_evaluation_policy_key_ck check (length(btrim(policy_key)) > 0),
  constraint learning_evaluation_policy_manifest_ck check (manifest_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint learning_evaluation_policy_versions_ck check (baseline_version <> candidate_version),
  constraint learning_evaluation_policy_evaluator_ck check (evaluator_actor_id <> proposer_actor_id),
  constraint learning_evaluation_policy_datasets_ck check (cardinality(dataset_version_ids) > 0),
  constraint learning_evaluation_policy_budget_ck check (
    per_run_cost_budget <= total_cost_budget
    and per_run_token_budget <= total_token_budget
  ),
  constraint learning_evaluation_policy_project_key_uq unique (project_id, policy_key),
  constraint learning_evaluation_policy_id_project_uq unique (id, project_id)
);

create index if not exists learning_evaluation_policies_candidate_idx
  on agent.learning_evaluation_policies(project_id, candidate_id, created_at desc);

create table if not exists agent.learning_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_id uuid not null,
  candidate_id uuid not null,
  observed_at timestamptz not null,
  sample_count integer not null check (sample_count >= 0),
  baseline_score numeric,
  candidate_score numeric,
  gain_lower_confidence_bound numeric,
  independently_verified boolean not null,
  evidence_complete boolean not null,
  confirmation_window_passed boolean not null,
  authority_violations integer not null check (authority_violations >= 0),
  safety_failures integer not null check (safety_failures >= 0),
  accounting_complete boolean not null,
  total_cost numeric not null check (total_cost >= 0),
  max_run_cost numeric not null check (max_run_cost >= 0),
  total_tokens bigint not null check (total_tokens >= 0),
  max_run_tokens bigint not null check (max_run_tokens >= 0),
  max_latency_ms integer not null check (max_latency_ms >= 0),
  disposition text not null check (disposition in ('STOPPED','REJECTED','REVIEW_REQUIRED')),
  quality text not null check (quality in ('IMPROVED','REGRESSED','INCONCLUSIVE')),
  reasons text[] not null,
  automatic_promotion_allowed boolean not null default false check (automatic_promotion_allowed = false),
  recorded_by text not null,
  created_at timestamptz not null default now(),
  constraint learning_evaluation_result_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id)
    on delete cascade,
  constraint learning_evaluation_result_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_evaluation_result_scores_ck check (
    (baseline_score is null or (baseline_score >= 0 and baseline_score <= 1))
    and (candidate_score is null or (candidate_score >= 0 and candidate_score <= 1))
  ),
  constraint learning_evaluation_result_accounting_ck check (
    max_run_cost <= total_cost and max_run_tokens <= total_tokens
  ),
  constraint learning_evaluation_result_reasons_ck check (cardinality(reasons) > 0),
  constraint learning_evaluation_result_policy_observed_uq unique (policy_id, observed_at)
);

create index if not exists learning_evaluation_results_candidate_idx
  on agent.learning_evaluation_results(project_id, candidate_id, created_at desc);
create index if not exists learning_evaluation_results_release_idx
  on agent.learning_evaluation_results(project_id, candidate_id, quality, disposition, created_at desc);

alter table agent.learning_evaluation_policies enable row level security;
alter table agent.learning_evaluation_results enable row level security;

drop policy if exists learning_evaluation_policies_project_read on agent.learning_evaluation_policies;
create policy learning_evaluation_policies_project_read
  on agent.learning_evaluation_policies for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists learning_evaluation_results_project_read on agent.learning_evaluation_results;
create policy learning_evaluation_results_project_read
  on agent.learning_evaluation_results for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_evaluation_policies from public, anon, authenticated, service_role;
revoke all on agent.learning_evaluation_results from public, anon, authenticated, service_role;
grant select on agent.learning_evaluation_policies to authenticated, service_role;
grant select on agent.learning_evaluation_results to authenticated, service_role;

drop trigger if exists reject_learning_evaluation_policy_mutation on agent.learning_evaluation_policies;
create trigger reject_learning_evaluation_policy_mutation
before update or delete on agent.learning_evaluation_policies
for each row execute function agent.reject_learning_candidate_evidence_mutation();

drop trigger if exists reject_learning_evaluation_result_mutation on agent.learning_evaluation_results;
create trigger reject_learning_evaluation_result_mutation
before update or delete on agent.learning_evaluation_results
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.record_learning_evaluation_policy(
  p_project_id uuid,
  p_candidate_id uuid,
  p_policy_key text,
  p_agent_key text,
  p_skill_key text,
  p_mode text,
  p_dataset_version_ids text[],
  p_dataset_manifest_id uuid,
  p_baseline_version text,
  p_candidate_version text,
  p_rollback_ref text,
  p_evaluator_actor_id text,
  p_proposer_actor_id text,
  p_rubric_ref text,
  p_calibration_ref text,
  p_manifest_hash text,
  p_locked_at timestamptz,
  p_primary_metric text,
  p_analysis_plan_ref text,
  p_sample_size integer,
  p_minimum_gain numeric,
  p_minimum_score numeric,
  p_total_cost_budget numeric,
  p_per_run_cost_budget numeric,
  p_total_token_budget bigint,
  p_per_run_token_budget bigint,
  p_latency_ms_budget integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_manifest agent.learning_benchmark_dataset_manifests%rowtype;
  v_existing agent.learning_evaluation_policies%rowtype;
  v_id uuid;
begin
  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.agent_key <> p_agent_key or v_candidate.skill_key <> p_skill_key then
    raise exception 'evaluation policy agent or skill does not match candidate';
  end if;
  if v_candidate.baseline_version <> btrim(p_baseline_version)
    or v_candidate.candidate_version <> btrim(p_candidate_version)
  then
    raise exception 'evaluation policy versions do not match candidate';
  end if;
  if p_dataset_manifest_id is null then raise exception 'dataset manifest is required'; end if;
  select * into v_manifest
  from agent.learning_benchmark_dataset_manifests
  where id = p_dataset_manifest_id and project_id = p_project_id;
  if not found then raise exception 'sealed benchmark dataset manifest not found in project'; end if;
  if v_manifest.manifest_hash <> p_manifest_hash then raise exception 'evaluation policy manifest hash does not match registered dataset manifest'; end if;
  if p_locked_at is null or p_locked_at < v_candidate.evidence_cutoff_at or p_locked_at < v_manifest.evidence_cutoff_at then
    raise exception 'evaluation policy lock must follow candidate and dataset evidence cutoffs';
  end if;
  if length(btrim(coalesce(p_policy_key,''))) = 0 then raise exception 'policy key is required'; end if;
  if p_mode not in ('GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS') then raise exception 'unsupported evaluation mode'; end if;
  if p_dataset_version_ids is null or cardinality(p_dataset_version_ids) = 0 then raise exception 'dataset versions are required'; end if;
  if exists (select 1 from unnest(p_dataset_version_ids) v where v is null or length(btrim(v)) = 0 or v <> btrim(v)) then
    raise exception 'dataset versions must be normalized non-empty identifiers';
  end if;
  if (select count(distinct v) from unnest(p_dataset_version_ids) v) <> cardinality(p_dataset_version_ids) then
    raise exception 'duplicate dataset versions are not allowed';
  end if;
  if not (v_manifest.dataset_version = any(p_dataset_version_ids)) then
    raise exception 'registered dataset manifest version is outside evaluation dataset allowlist';
  end if;
  if p_evaluator_actor_id = p_proposer_actor_id then raise exception 'evaluator must differ from proposer'; end if;
  if p_manifest_hash !~ '^sha256:[a-f0-9]{64}$' then raise exception 'manifest hash must be SHA-256'; end if;
  if p_sample_size < 1 or p_minimum_gain <= 0 or p_minimum_gain > 1 or p_minimum_score < 0 or p_minimum_score > 1 then
    raise exception 'evaluation thresholds are invalid';
  end if;
  if p_total_cost_budget < 0 or p_per_run_cost_budget < 0
    or p_total_token_budget < 0 or p_per_run_token_budget < 0 or p_latency_ms_budget < 1
    or p_per_run_cost_budget > p_total_cost_budget or p_per_run_token_budget > p_total_token_budget
  then
    raise exception 'evaluation budget is invalid';
  end if;

  select * into v_existing
  from agent.learning_evaluation_policies
  where project_id = p_project_id and policy_key = btrim(p_policy_key);
  if found then
    if v_existing.candidate_id <> p_candidate_id
      or v_existing.dataset_manifest_id <> p_dataset_manifest_id
      or v_existing.agent_key <> p_agent_key
      or v_existing.skill_key <> p_skill_key
      or v_existing.mode <> p_mode
      or v_existing.dataset_version_ids is distinct from p_dataset_version_ids
      or v_existing.baseline_version <> btrim(p_baseline_version)
      or v_existing.candidate_version <> btrim(p_candidate_version)
      or v_existing.rollback_ref <> btrim(p_rollback_ref)
      or v_existing.evaluator_actor_id <> btrim(p_evaluator_actor_id)
      or v_existing.proposer_actor_id <> btrim(p_proposer_actor_id)
      or v_existing.rubric_ref <> btrim(p_rubric_ref)
      or v_existing.calibration_ref <> btrim(p_calibration_ref)
      or v_existing.manifest_hash <> p_manifest_hash
      or v_existing.locked_at <> p_locked_at
      or v_existing.primary_metric <> btrim(p_primary_metric)
      or v_existing.analysis_plan_ref <> btrim(p_analysis_plan_ref)
      or v_existing.sample_size <> p_sample_size
      or v_existing.minimum_gain <> p_minimum_gain
      or v_existing.minimum_score <> p_minimum_score
      or v_existing.total_cost_budget <> p_total_cost_budget
      or v_existing.per_run_cost_budget <> p_per_run_cost_budget
      or v_existing.total_token_budget <> p_total_token_budget
      or v_existing.per_run_token_budget <> p_per_run_token_budget
      or v_existing.latency_ms_budget <> p_latency_ms_budget
    then
      raise exception 'policy key reuse does not match immutable evaluation policy';
    end if;
    return v_existing.id;
  end if;

  insert into agent.learning_evaluation_policies(
    project_id,candidate_id,dataset_manifest_id,policy_key,agent_key,skill_key,mode,dataset_version_ids,
    baseline_version,candidate_version,rollback_ref,evaluator_actor_id,proposer_actor_id,
    rubric_ref,calibration_ref,manifest_hash,locked_at,primary_metric,analysis_plan_ref,
    sample_size,minimum_gain,minimum_score,total_cost_budget,per_run_cost_budget,
    total_token_budget,per_run_token_budget,latency_ms_budget
  ) values (
    p_project_id,p_candidate_id,p_dataset_manifest_id,btrim(p_policy_key),p_agent_key,p_skill_key,p_mode,p_dataset_version_ids,
    btrim(p_baseline_version),btrim(p_candidate_version),btrim(p_rollback_ref),btrim(p_evaluator_actor_id),btrim(p_proposer_actor_id),
    btrim(p_rubric_ref),btrim(p_calibration_ref),p_manifest_hash,p_locked_at,btrim(p_primary_metric),btrim(p_analysis_plan_ref),
    p_sample_size,p_minimum_gain,p_minimum_score,p_total_cost_budget,p_per_run_cost_budget,
    p_total_token_budget,p_per_run_token_budget,p_latency_ms_budget
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function agent.record_learning_evaluation_policy(
  uuid,uuid,text,text,text,text,text[],uuid,text,text,text,text,text,text,text,text,timestamptz,text,text,
  integer,numeric,numeric,numeric,numeric,bigint,bigint,integer
) from public, anon, authenticated;
grant execute on function agent.record_learning_evaluation_policy(
  uuid,uuid,text,text,text,text,text[],uuid,text,text,text,text,text,text,text,text,timestamptz,text,text,
  integer,numeric,numeric,numeric,numeric,bigint,bigint,integer
) to service_role;

create or replace function agent.record_learning_evaluation_result(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_observed_at timestamptz,
  p_sample_count integer,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_gain_lower_confidence_bound numeric,
  p_independently_verified boolean,
  p_evidence_complete boolean,
  p_confirmation_window_passed boolean,
  p_authority_violations integer,
  p_safety_failures integer,
  p_accounting_complete boolean,
  p_total_cost numeric,
  p_max_run_cost numeric,
  p_total_tokens bigint,
  p_max_run_tokens bigint,
  p_max_latency_ms integer,
  p_disposition text,
  p_quality text,
  p_reasons text[],
  p_recorded_by text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_id uuid;
begin
  select * into v_policy
  from agent.learning_evaluation_policies
  where id = p_policy_id and project_id = p_project_id and candidate_id = p_candidate_id;
  if not found then raise exception 'learning evaluation policy not found for candidate'; end if;
  if p_observed_at < v_policy.locked_at then raise exception 'evaluation result predates locked policy'; end if;
  if p_disposition not in ('STOPPED','REJECTED','REVIEW_REQUIRED')
    or p_quality not in ('IMPROVED','REGRESSED','INCONCLUSIVE')
  then raise exception 'evaluation decision is invalid'; end if;
  if p_quality = 'IMPROVED' and p_disposition <> 'REVIEW_REQUIRED' then
    raise exception 'improved evaluation still requires release review';
  end if;
  if p_authority_violations > 0 or p_safety_failures > 0 then
    if p_disposition <> 'REJECTED' or p_quality <> 'INCONCLUSIVE' then
      raise exception 'safety or authority violations must be rejected';
    end if;
  end if;
  if p_quality = 'IMPROVED' then
    if p_independently_verified is not true or p_evidence_complete is not true
      or p_confirmation_window_passed is not true or p_accounting_complete is not true
      or p_sample_count < v_policy.sample_size
      or p_baseline_score is null or p_candidate_score is null
      or p_candidate_score - p_baseline_score < v_policy.minimum_gain
      or p_candidate_score < v_policy.minimum_score
      or p_gain_lower_confidence_bound is null or p_gain_lower_confidence_bound <= 0
      or p_gain_lower_confidence_bound > p_candidate_score - p_baseline_score
      or p_total_cost > v_policy.total_cost_budget
      or p_max_run_cost > v_policy.per_run_cost_budget
      or p_total_tokens > v_policy.total_token_budget
      or p_max_run_tokens > v_policy.per_run_token_budget
      or p_max_latency_ms > v_policy.latency_ms_budget
    then
      raise exception 'improved evaluation does not satisfy locked release admission policy';
    end if;
  end if;
  if p_reasons is null or cardinality(p_reasons) = 0 then raise exception 'evaluation decision reasons are required'; end if;
  if length(btrim(coalesce(p_recorded_by,''))) = 0 then raise exception 'recordedBy is required'; end if;

  insert into agent.learning_evaluation_results(
    project_id,policy_id,candidate_id,observed_at,sample_count,baseline_score,candidate_score,
    gain_lower_confidence_bound,independently_verified,evidence_complete,confirmation_window_passed,
    authority_violations,safety_failures,accounting_complete,total_cost,max_run_cost,total_tokens,
    max_run_tokens,max_latency_ms,disposition,quality,reasons,automatic_promotion_allowed,recorded_by
  ) values (
    p_project_id,p_policy_id,p_candidate_id,p_observed_at,p_sample_count,p_baseline_score,p_candidate_score,
    p_gain_lower_confidence_bound,p_independently_verified,p_evidence_complete,p_confirmation_window_passed,
    p_authority_violations,p_safety_failures,p_accounting_complete,p_total_cost,p_max_run_cost,p_total_tokens,
    p_max_run_tokens,p_max_latency_ms,p_disposition,p_quality,p_reasons,false,btrim(p_recorded_by)
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function agent.record_learning_evaluation_result(
  uuid,uuid,uuid,timestamptz,integer,numeric,numeric,numeric,boolean,boolean,boolean,
  integer,integer,boolean,numeric,numeric,bigint,bigint,integer,text,text,text[],text
) from public, anon, authenticated;
grant execute on function agent.record_learning_evaluation_result(
  uuid,uuid,uuid,timestamptz,integer,numeric,numeric,numeric,boolean,boolean,boolean,
  integer,integer,boolean,numeric,numeric,bigint,bigint,integer,text,text,text[],text
) to service_role;

comment on table agent.learning_evaluation_policies is
  'Immutable prospective self-improvement evaluation policy bound to one governed learning candidate.';
comment on table agent.learning_evaluation_results is
  'Append-only independently verified evaluation decisions. IMPROVED remains review-gated and never auto-promotes.';
