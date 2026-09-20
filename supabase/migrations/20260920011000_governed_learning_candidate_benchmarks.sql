-- Phase 11 Governed Learning Pipeline: independent benchmark evidence.
-- Benchmarking may move an evidence-ready candidate only to NOT_READY or REVIEW_REQUIRED.
-- Approval, controlled release, canary, ACTIVE, and production mutation remain unavailable here.

create table if not exists agent.learning_candidate_benchmarks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  benchmark_key text not null,
  evaluator_id text not null,
  evaluator_type text not null check (evaluator_type in ('DETERMINISTIC','LABELED_DATASET','ADVERSARIAL_SUITE','HUMAN_EVALUATION')),
  observed_at timestamptz not null,
  baseline_version text not null,
  candidate_version text not null,
  case_count integer not null check (case_count > 0),
  baseline_score numeric not null check (baseline_score >= 0 and baseline_score <= 1),
  candidate_score numeric not null check (candidate_score >= 0 and candidate_score <= 1),
  authority_violations integer not null check (authority_violations >= 0),
  adversarial_failures integer not null check (adversarial_failures >= 0),
  evidence_refs text[] not null,
  rollback_ref text not null,
  minimum_case_count integer not null check (minimum_case_count > 0),
  minimum_candidate_score numeric not null check (minimum_candidate_score >= 0 and minimum_candidate_score <= 1),
  gate_status text not null check (gate_status in ('NOT_READY','REVIEW_REQUIRED')),
  reasons text[] not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint learning_candidate_benchmarks_key_ck check (length(btrim(benchmark_key)) > 0),
  constraint learning_candidate_benchmarks_evaluator_ck check (length(btrim(evaluator_id)) > 0),
  constraint learning_candidate_benchmarks_baseline_ck check (length(btrim(baseline_version)) > 0),
  constraint learning_candidate_benchmarks_candidate_ck check (length(btrim(candidate_version)) > 0),
  constraint learning_candidate_benchmarks_rollback_ck check (length(btrim(rollback_ref)) > 0),
  constraint learning_candidate_benchmarks_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint learning_candidate_benchmarks_reasons_ck check (cardinality(reasons) > 0),
  constraint learning_candidate_benchmarks_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_candidate_benchmarks_candidate_uq unique (candidate_id),
  constraint learning_candidate_benchmarks_project_key_uq unique (project_id, benchmark_key)
);

create index if not exists learning_candidate_benchmarks_project_status_idx
  on agent.learning_candidate_benchmarks(project_id, gate_status, created_at desc);

alter table agent.learning_candidate_benchmarks enable row level security;

drop policy if exists learning_candidate_benchmarks_project_read on agent.learning_candidate_benchmarks;
create policy learning_candidate_benchmarks_project_read
  on agent.learning_candidate_benchmarks for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_candidate_benchmarks from public, anon, authenticated, service_role;
grant select on agent.learning_candidate_benchmarks to authenticated, service_role;

drop trigger if exists reject_learning_candidate_benchmark_mutation on agent.learning_candidate_benchmarks;
create trigger reject_learning_candidate_benchmark_mutation
before update or delete on agent.learning_candidate_benchmarks
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.record_learning_candidate_benchmark(
  p_project_id uuid,
  p_candidate_id uuid,
  p_benchmark_key text,
  p_evaluator_id text,
  p_evaluator_type text,
  p_observed_at timestamptz,
  p_case_count integer,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_authority_violations integer,
  p_adversarial_failures integer,
  p_evidence_refs text[],
  p_rollback_ref text,
  p_minimum_case_count integer default 20,
  p_minimum_candidate_score numeric default 0.8,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_eval governance.ai_evaluation_results%rowtype;
  v_ref text;
  v_normalized_refs text[];
  v_reasons text[] := array[]::text[];
  v_target_status text;
  v_benchmark_id uuid;
begin
  if p_project_id is null or p_candidate_id is null then raise exception 'project and candidate are required'; end if;
  if length(btrim(coalesce(p_benchmark_key,''))) = 0 then raise exception 'benchmarkKey is required'; end if;
  if length(btrim(coalesce(p_evaluator_id,''))) = 0 then raise exception 'evaluatorId is required'; end if;
  if p_evaluator_type not in ('DETERMINISTIC','LABELED_DATASET','ADVERSARIAL_SUITE','HUMAN_EVALUATION') then
    raise exception 'unsupported benchmark evaluator type';
  end if;
  if p_observed_at is null then raise exception 'benchmark observedAt is required'; end if;
  if p_case_count is null or p_case_count < 1 then raise exception 'caseCount must be positive'; end if;
  if p_baseline_score is null or p_baseline_score < 0 or p_baseline_score > 1 then raise exception 'baselineScore must be between 0 and 1'; end if;
  if p_candidate_score is null or p_candidate_score < 0 or p_candidate_score > 1 then raise exception 'candidateScore must be between 0 and 1'; end if;
  if p_authority_violations is null or p_authority_violations < 0 then raise exception 'authorityViolations must be non-negative'; end if;
  if p_adversarial_failures is null or p_adversarial_failures < 0 then raise exception 'adversarialFailures must be non-negative'; end if;
  if p_minimum_case_count is null or p_minimum_case_count < 1 then raise exception 'minimumCaseCount must be positive'; end if;
  if p_minimum_candidate_score is null or p_minimum_candidate_score < 0 or p_minimum_candidate_score > 1 then
    raise exception 'minimumCandidateScore must be between 0 and 1';
  end if;
  if length(btrim(coalesce(p_rollback_ref,''))) = 0 then raise exception 'rollbackRef is required'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'EVIDENCE_READY' then
    raise exception 'learning candidate must be EVIDENCE_READY before benchmarking';
  end if;
  if p_evaluator_id = v_candidate.agent_key then
    raise exception 'learning candidate benchmark evaluator must be independent from proposing agent';
  end if;
  if v_candidate.may_auto_apply is not false
    or v_candidate.may_self_promote is not false
    or v_candidate.may_expand_tool_authority is not false
    or v_candidate.may_change_mutation_boundary is not false
    or v_candidate.requires_human_review is not true
  then
    raise exception 'learning candidate authority boundary is invalid';
  end if;

  if p_evidence_refs is null or cardinality(p_evidence_refs) = 0 then
    raise exception 'benchmark evidence references are required';
  end if;
  if exists (
    select 1 from unnest(p_evidence_refs) as ref
    where ref is null or length(btrim(ref)) = 0 or ref <> btrim(ref)
  ) then
    raise exception 'benchmark evidence references must be normalized';
  end if;
  select array_agg(distinct ref order by ref)
  into v_normalized_refs
  from unnest(p_evidence_refs) as ref;
  if cardinality(v_normalized_refs) <> cardinality(p_evidence_refs) then
    raise exception 'benchmark evidence references must be unique';
  end if;

  foreach v_ref in array v_normalized_refs loop
    select * into v_eval
    from governance.ai_evaluation_results
    where id::text = v_ref and project_id = p_project_id;
    if not found then
      raise exception 'benchmark evidence is missing or cross-project: %', v_ref;
    end if;
    if v_eval.observed_at > p_observed_at or v_eval.created_at > p_observed_at then
      raise exception 'benchmark evidence was not available at benchmark observedAt: %', v_ref;
    end if;
    if lower(coalesce(v_eval.metadata->>'synthetic', v_eval.metadata->>'synthetic_bootstrap', '')) <> 'false' then
      raise exception 'benchmark evidence must be explicitly non-synthetic: %', v_ref;
    end if;
  end loop;

  if p_case_count < p_minimum_case_count then
    v_reasons := array_append(v_reasons, 'INSUFFICIENT_BENCHMARK_CASES');
  end if;
  if p_candidate_score < p_minimum_candidate_score then
    v_reasons := array_append(v_reasons, 'CANDIDATE_SCORE_BELOW_THRESHOLD');
  end if;
  if p_candidate_score < p_baseline_score then
    v_reasons := array_append(v_reasons, 'CANDIDATE_REGRESSES_BASELINE');
  end if;
  if p_authority_violations > 0 then
    v_reasons := array_append(v_reasons, 'AUTHORITY_VIOLATION_DETECTED');
  end if;
  if p_adversarial_failures > 0 then
    v_reasons := array_append(v_reasons, 'ADVERSARIAL_FAILURE_DETECTED');
  end if;

  if cardinality(v_reasons) = 0 then
    v_target_status := 'REVIEW_REQUIRED';
    v_reasons := array['BENCHMARK_PASSED_HUMAN_REVIEW_REQUIRED'];
  else
    v_target_status := 'NOT_READY';
  end if;

  update agent.learning_candidates
  set status = 'BENCHMARKING', updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'EVIDENCE_READY', 'BENCHMARKING',
    'INDEPENDENT_BENCHMARK_STARTED', p_actor_user_id
  );

  insert into agent.learning_candidate_benchmarks(
    project_id, candidate_id, benchmark_key, evaluator_id, evaluator_type, observed_at,
    baseline_version, candidate_version, case_count, baseline_score, candidate_score,
    authority_violations, adversarial_failures, evidence_refs, rollback_ref,
    minimum_case_count, minimum_candidate_score, gate_status, reasons, actor_user_id
  ) values (
    p_project_id, v_candidate.id, btrim(p_benchmark_key), btrim(p_evaluator_id), p_evaluator_type, p_observed_at,
    v_candidate.baseline_version, v_candidate.candidate_version, p_case_count, p_baseline_score, p_candidate_score,
    p_authority_violations, p_adversarial_failures, v_normalized_refs, btrim(p_rollback_ref),
    p_minimum_case_count, p_minimum_candidate_score, v_target_status, v_reasons, p_actor_user_id
  )
  returning id into v_benchmark_id;

  update agent.learning_candidates
  set status = v_target_status, updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'BENCHMARKING', v_target_status,
    array_to_string(v_reasons, ','), p_actor_user_id
  );

  return v_benchmark_id;
end;
$$;

revoke all on function agent.record_learning_candidate_benchmark(
  uuid,uuid,text,text,text,timestamptz,integer,numeric,numeric,integer,integer,text[],text,integer,numeric,uuid
) from public, anon, authenticated;
grant execute on function agent.record_learning_candidate_benchmark(
  uuid,uuid,text,text,text,timestamptz,integer,numeric,numeric,integer,integer,text[],text,integer,numeric,uuid
) to service_role;

comment on table agent.learning_candidate_benchmarks is
  'Append-only independent benchmark evidence for governed learning candidates. Passing a benchmark stops at REVIEW_REQUIRED and grants no release authority.';
