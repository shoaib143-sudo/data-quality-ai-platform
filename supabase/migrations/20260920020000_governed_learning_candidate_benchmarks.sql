-- Phase 11 Governed Learning Pipeline: independent benchmark evidence.
-- This increment allows evidence-ready candidates to be benchmarked and moved
-- only to REVIEW_REQUIRED or NOT_READY. It does not expose approval, canary,
-- ACTIVE, or production mutation authority.

create table if not exists agent.learning_candidate_benchmarks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  benchmark_id text not null,
  evaluator_id text not null,
  evaluator_type text not null check (evaluator_type in (
    'DETERMINISTIC','LABELED_DATASET','ADVERSARIAL_SUITE','HUMAN_EVALUATION'
  )),
  observed_at timestamptz not null,
  case_count integer not null check (case_count > 0),
  baseline_version text not null,
  candidate_version text not null,
  baseline_score numeric not null check (baseline_score >= 0 and baseline_score <= 1),
  candidate_score numeric not null check (candidate_score >= 0 and candidate_score <= 1),
  authority_violations integer not null default 0 check (authority_violations >= 0),
  adversarial_failures integer not null default 0 check (adversarial_failures >= 0),
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs) = 'array'),
  rollback_ref text not null,
  minimum_case_count integer not null check (minimum_case_count > 0),
  minimum_candidate_score numeric not null check (minimum_candidate_score >= 0 and minimum_candidate_score <= 1),
  decision text not null check (decision in ('NOT_READY','REVIEW_REQUIRED')),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  automatic_promotion_allowed boolean not null default false check (automatic_promotion_allowed = false),
  automatic_authority_expansion_allowed boolean not null default false check (automatic_authority_expansion_allowed = false),
  automatic_mutation_boundary_change_allowed boolean not null default false check (automatic_mutation_boundary_change_allowed = false),
  human_review_required boolean not null default true check (human_review_required = true),
  current_authorization_required_at_release boolean not null default true check (current_authorization_required_at_release = true),
  created_at timestamptz not null default now(),
  constraint learning_candidate_benchmarks_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_candidate_benchmarks_benchmark_id_ck check (length(btrim(benchmark_id)) > 0),
  constraint learning_candidate_benchmarks_evaluator_id_ck check (length(btrim(evaluator_id)) > 0),
  constraint learning_candidate_benchmarks_baseline_ck check (length(btrim(baseline_version)) > 0),
  constraint learning_candidate_benchmarks_candidate_ck check (length(btrim(candidate_version)) > 0),
  constraint learning_candidate_benchmarks_rollback_ck check (length(btrim(rollback_ref)) > 0),
  constraint learning_candidate_benchmarks_uq unique (project_id, candidate_id, benchmark_id)
);

create index if not exists learning_candidate_benchmarks_project_candidate_idx
  on agent.learning_candidate_benchmarks(project_id, candidate_id, created_at desc);

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
  p_benchmark_id text,
  p_evaluator_id text,
  p_evaluator_type text,
  p_observed_at timestamptz,
  p_case_count integer,
  p_baseline_version text,
  p_candidate_version text,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_authority_violations integer,
  p_adversarial_failures integer,
  p_evidence_refs text[],
  p_rollback_ref text,
  p_minimum_case_count integer,
  p_minimum_candidate_score numeric,
  p_decision text,
  p_reasons text[],
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_existing agent.learning_candidate_benchmarks%rowtype;
  v_id uuid;
  v_refs jsonb;
  v_reasons jsonb;
begin
  if p_project_id is null or p_candidate_id is null then
    raise exception 'project and candidate are required';
  end if;
  if length(btrim(coalesce(p_benchmark_id,''))) = 0 then raise exception 'benchmarkId is required'; end if;
  if length(btrim(coalesce(p_evaluator_id,''))) = 0 then raise exception 'evaluatorId is required'; end if;
  if p_evaluator_type not in ('DETERMINISTIC','LABELED_DATASET','ADVERSARIAL_SUITE','HUMAN_EVALUATION') then
    raise exception 'unsupported benchmark evaluator type';
  end if;
  if p_observed_at is null then raise exception 'benchmark observedAt is required'; end if;
  if p_case_count is null or p_case_count < 1 then raise exception 'benchmark caseCount must be positive'; end if;
  if p_baseline_score is null or p_baseline_score < 0 or p_baseline_score > 1 then
    raise exception 'baselineScore must be between 0 and 1';
  end if;
  if p_candidate_score is null or p_candidate_score < 0 or p_candidate_score > 1 then
    raise exception 'candidateScore must be between 0 and 1';
  end if;
  if coalesce(p_authority_violations,-1) < 0 or coalesce(p_adversarial_failures,-1) < 0 then
    raise exception 'benchmark failure counts must be non-negative';
  end if;
  if p_evidence_refs is null or cardinality(p_evidence_refs) = 0 then
    raise exception 'benchmark evidence references are required';
  end if;
  if exists (
    select 1 from unnest(p_evidence_refs) ref
    where ref is null or length(btrim(ref)) = 0
  ) then raise exception 'benchmark evidence references must be non-empty'; end if;
  if (select count(distinct ref) from unnest(p_evidence_refs) ref) <> cardinality(p_evidence_refs) then
    raise exception 'benchmark evidence references must be unique';
  end if;
  if length(btrim(coalesce(p_rollback_ref,''))) = 0 then raise exception 'rollbackRef is required'; end if;
  if p_minimum_case_count is null or p_minimum_case_count < 1 then raise exception 'minimumCaseCount must be positive'; end if;
  if p_minimum_candidate_score is null or p_minimum_candidate_score < 0 or p_minimum_candidate_score > 1 then
    raise exception 'minimumCandidateScore must be between 0 and 1';
  end if;
  if p_decision not in ('NOT_READY','REVIEW_REQUIRED') then
    raise exception 'benchmark decision must be NOT_READY or REVIEW_REQUIRED';
  end if;
  if p_reasons is null or cardinality(p_reasons) = 0 then
    raise exception 'benchmark decision reasons are required';
  end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> 'EVIDENCE_READY' then
    raise exception 'only EVIDENCE_READY candidates may be benchmarked';
  end if;
  if btrim(p_baseline_version) <> v_candidate.baseline_version then
    raise exception 'benchmark baselineVersion does not match governed candidate';
  end if;
  if btrim(p_candidate_version) <> v_candidate.candidate_version then
    raise exception 'benchmark candidateVersion does not match governed candidate';
  end if;
  if p_evaluator_id = v_candidate.agent_key then
    raise exception 'benchmark evaluator must be independent from the proposing agent';
  end if;
  if p_case_count < p_minimum_case_count and p_decision <> 'NOT_READY' then
    raise exception 'insufficient benchmark cases require NOT_READY';
  end if;
  if p_candidate_score < p_minimum_candidate_score and p_decision <> 'NOT_READY' then
    raise exception 'candidate score below governed threshold requires NOT_READY';
  end if;
  if p_authority_violations > 0 and p_decision <> 'NOT_READY' then
    raise exception 'authority violations require NOT_READY';
  end if;
  if p_adversarial_failures > 0 and p_decision <> 'NOT_READY' then
    raise exception 'adversarial failures require NOT_READY';
  end if;
  if p_candidate_score < p_baseline_score and p_decision <> 'NOT_READY' then
    raise exception 'candidate regression requires NOT_READY';
  end if;

  v_refs := to_jsonb((select array_agg(ref order by ref) from unnest(p_evidence_refs) ref));
  v_reasons := to_jsonb((select array_agg(reason order by reason) from unnest(p_reasons) reason));

  select * into v_existing
  from agent.learning_candidate_benchmarks
  where project_id = p_project_id
    and candidate_id = p_candidate_id
    and benchmark_id = btrim(p_benchmark_id);

  if found then
    if v_existing.evaluator_id <> btrim(p_evaluator_id)
      or v_existing.evaluator_type <> p_evaluator_type
      or v_existing.observed_at <> p_observed_at
      or v_existing.case_count <> p_case_count
      or v_existing.baseline_version <> btrim(p_baseline_version)
      or v_existing.candidate_version <> btrim(p_candidate_version)
      or v_existing.baseline_score <> p_baseline_score
      or v_existing.candidate_score <> p_candidate_score
      or v_existing.authority_violations <> p_authority_violations
      or v_existing.adversarial_failures <> p_adversarial_failures
      or v_existing.evidence_refs <> v_refs
      or v_existing.rollback_ref <> btrim(p_rollback_ref)
      or v_existing.minimum_case_count <> p_minimum_case_count
      or v_existing.minimum_candidate_score <> p_minimum_candidate_score
      or v_existing.decision <> p_decision
      or v_existing.reasons <> v_reasons
    then
      raise exception 'benchmark id reuse does not match immutable governed benchmark evidence';
    end if;
    return v_existing.id;
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
    project_id, candidate_id, benchmark_id, evaluator_id, evaluator_type, observed_at,
    case_count, baseline_version, candidate_version, baseline_score, candidate_score,
    authority_violations, adversarial_failures, evidence_refs, rollback_ref,
    minimum_case_count, minimum_candidate_score, decision,
    reasons, automatic_promotion_allowed, automatic_authority_expansion_allowed,
    automatic_mutation_boundary_change_allowed, human_review_required,
    current_authorization_required_at_release
  ) values (
    p_project_id, v_candidate.id, btrim(p_benchmark_id), btrim(p_evaluator_id),
    p_evaluator_type, p_observed_at, p_case_count, btrim(p_baseline_version),
    btrim(p_candidate_version), p_baseline_score, p_candidate_score,
    p_authority_violations, p_adversarial_failures, v_refs, btrim(p_rollback_ref),
    p_minimum_case_count, p_minimum_candidate_score, p_decision, v_reasons, false, false, false, true, true
  ) returning id into v_id;

  update agent.learning_candidates
  set status = p_decision, updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, 'BENCHMARKING', p_decision,
    'INDEPENDENT_BENCHMARK_COMPLETED', p_actor_user_id
  );

  return v_id;
end;
$$;

revoke all on function agent.record_learning_candidate_benchmark(
  uuid,uuid,text,text,text,timestamptz,integer,text,text,numeric,numeric,integer,integer,text[],text,integer,numeric,text,text[],uuid
) from public, anon, authenticated;
grant execute on function agent.record_learning_candidate_benchmark(
  uuid,uuid,text,text,text,timestamptz,integer,text,text,numeric,numeric,integer,integer,text[],text,text,text[],uuid
) to service_role;

comment on table agent.learning_candidate_benchmarks is
  'Append-only independent benchmark evidence for governed learning candidates. Benchmarking may only advance EVIDENCE_READY candidates to REVIEW_REQUIRED or NOT_READY.';
