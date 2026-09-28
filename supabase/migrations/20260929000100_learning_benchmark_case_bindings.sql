-- Bind every benchmark aggregate to immutable, independently persisted, paired evaluations.
create table agent.learning_benchmark_case_bindings (
  project_id uuid not null references app.projects(id) on delete cascade,
  benchmark_id uuid not null references agent.learning_candidate_benchmarks(id) on delete restrict,
  evaluation_id uuid not null references governance.ai_evaluation_results(id) on delete restrict,
  dataset_key text not null,
  case_key text not null,
  variant text not null check (variant in ('BASELINE','CANDIDATE')),
  score numeric not null check (score between 0 and 1),
  authority_violation boolean not null,
  adversarial_failure boolean not null,
  created_at timestamptz not null default now(),
  primary key (benchmark_id, case_key, variant),
  unique (project_id, evaluation_id),
  check (case_key ~ '^[a-f0-9]{64}$'),
  check (length(btrim(dataset_key)) > 0)
);

create index learning_benchmark_case_bindings_project_idx
  on agent.learning_benchmark_case_bindings(project_id, benchmark_id);
alter table agent.learning_benchmark_case_bindings enable row level security;
create policy learning_benchmark_case_bindings_project_read
  on agent.learning_benchmark_case_bindings for select to authenticated
  using (app_private.is_project_member(project_id));
revoke all on agent.learning_benchmark_case_bindings from public, anon, authenticated, service_role;
grant select on agent.learning_benchmark_case_bindings to authenticated, service_role;
create trigger reject_learning_benchmark_case_binding_mutation
before update or delete on agent.learning_benchmark_case_bindings
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create function agent.bind_learning_benchmark_cases()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_eval governance.ai_evaluation_results%rowtype;
  v_ref text;
  v_case_key text;
  v_dataset_key text;
  v_variant text;
  v_authority boolean;
  v_adversarial boolean;
  v_count integer;
  v_baseline_count integer;
  v_candidate_count integer;
  v_baseline_score numeric;
  v_candidate_score numeric;
  v_authority_count integer;
  v_adversarial_count integer;
begin
  select * into v_candidate from agent.learning_candidates
  where id = new.candidate_id and project_id = new.project_id;
  if not found then raise exception 'benchmark candidate is missing from project'; end if;
  if cardinality(new.evidence_refs) <> new.case_count * 2 then
    raise exception 'benchmark must cite one baseline and one candidate evaluation per case';
  end if;

  foreach v_ref in array new.evidence_refs loop
    select * into v_eval from governance.ai_evaluation_results
    where id::text = v_ref and project_id = new.project_id;
    if not found then raise exception 'paired evaluation missing from project: %', v_ref; end if;
    v_case_key := v_eval.metadata->>'benchmark_case_key';
    v_variant := v_eval.metadata->>'benchmark_variant';
    if v_case_key is null or v_case_key !~ '^[a-f0-9]{64}$'
      or coalesce(v_variant, '') not in ('BASELINE','CANDIDATE')
      or v_eval.metadata->>'benchmark_split' is distinct from 'HELD_OUT'
      or v_eval.metadata->>'learning_candidate_id' is distinct from new.candidate_id::text
      or v_eval.metadata->>'agent_key' is distinct from v_candidate.agent_key
      or v_eval.metadata->>'skill_key' is distinct from v_candidate.skill_key
      or v_eval.evaluation_type <> 'AGENT_SKILL'
      or v_eval.capability is distinct from 'agent_skill:' || v_candidate.agent_key || ':' || v_candidate.skill_key
      or v_eval.metadata->>'synthetic' is distinct from 'false'
      or v_eval.metadata->>'synthetic_bootstrap' = 'true'
      or v_eval.metadata->>'benchmark_evaluator_id' is distinct from new.evaluator_id
      or v_eval.evaluator_type is distinct from new.evaluator_type
      or v_eval.metadata->>'benchmark_key' is distinct from new.benchmark_key
      or v_eval.score is null
      or jsonb_array_length(v_eval.evidence_refs) = 0
      or v_eval.created_at < v_candidate.evidence_cutoff_at
      or v_eval.observed_at < v_candidate.evidence_cutoff_at
      or v_eval.created_at > new.observed_at
      or v_eval.observed_at > new.observed_at
    then raise exception 'benchmark evaluation has invalid held-out identity or provenance: %', v_ref; end if;
    if (v_variant = 'BASELINE' and v_eval.metadata->>'version' is distinct from new.baseline_version)
      or (v_variant = 'CANDIDATE' and v_eval.metadata->>'version' is distinct from new.candidate_version)
    then raise exception 'benchmark evaluation version mismatch: %', v_ref; end if;
    if coalesce(v_eval.metadata->>'authority_violation', '') not in ('true','false')
      or coalesce(v_eval.metadata->>'adversarial_failure', '') not in ('true','false')
    then raise exception 'benchmark safety labels are required: %', v_ref; end if;
    v_authority := (v_eval.metadata->>'authority_violation')::boolean;
    v_adversarial := (v_eval.metadata->>'adversarial_failure')::boolean;
    if v_dataset_key is null then
      v_dataset_key := nullif(btrim(v_eval.metadata->>'benchmark_dataset_key'), '');
    end if;
    if v_dataset_key is null or v_eval.metadata->>'benchmark_dataset_key' is distinct from v_dataset_key then
      raise exception 'paired evaluations must use one held-out dataset snapshot';
    end if;
    if exists (
      select 1 from agent.learning_candidate_evidence ce
      join governance.ai_evaluation_results source_eval
        on source_eval.id::text = ce.source_record_id and source_eval.project_id = ce.project_id
      where ce.project_id = new.project_id and ce.candidate_id = new.candidate_id
        and source_eval.metadata->>'benchmark_case_key' = v_case_key
    ) then raise exception 'held-out case overlaps candidate source evidence'; end if;
    if exists (
      select 1 from agent.learning_candidate_evidence ce
      where ce.project_id = new.project_id and ce.candidate_id = new.candidate_id
        and ce.source_record_id = v_ref
    ) then raise exception 'benchmark evaluation is candidate source evidence'; end if;

    insert into agent.learning_benchmark_case_bindings(
      project_id, benchmark_id, evaluation_id, dataset_key, case_key,
      variant, score, authority_violation, adversarial_failure
    ) values (
      new.project_id, new.id, v_eval.id, v_dataset_key, v_case_key,
      v_variant, v_eval.score, v_authority, v_adversarial
    );
  end loop;

  select count(distinct case_key),
    count(*) filter (where variant = 'BASELINE'),
    count(*) filter (where variant = 'CANDIDATE'),
    avg(score) filter (where variant = 'BASELINE'),
    avg(score) filter (where variant = 'CANDIDATE'),
    count(*) filter (where variant = 'CANDIDATE' and authority_violation),
    count(*) filter (where variant = 'CANDIDATE' and adversarial_failure)
  into v_count, v_baseline_count, v_candidate_count, v_baseline_score,
       v_candidate_score, v_authority_count, v_adversarial_count
  from agent.learning_benchmark_case_bindings
  where benchmark_id = new.id;

  if v_count <> new.case_count or v_baseline_count <> new.case_count
    or v_candidate_count <> new.case_count
    or abs(v_baseline_score - new.baseline_score) > 0.000001
    or abs(v_candidate_score - new.candidate_score) > 0.000001
    or v_authority_count <> new.authority_violations
    or v_adversarial_count <> new.adversarial_failures
  then raise exception 'paired benchmark aggregate does not match bound evaluations'; end if;
  return new;
end;
$$;

revoke all on function agent.bind_learning_benchmark_cases() from public, anon, authenticated, service_role;
create trigger bind_learning_benchmark_cases
after insert on agent.learning_candidate_benchmarks
for each row execute function agent.bind_learning_benchmark_cases();

-- Existing aggregates cannot be grandfathered into an independently bound gate.
do $$
begin
  if exists (select 1 from agent.learning_candidate_benchmarks) then
    raise exception 'existing benchmarks require a verified paired-evidence backfill before installing case bindings';
  end if;
end;
$$;

comment on table agent.learning_benchmark_case_bindings is
  'Immutable paired held-out evaluation bindings. Case keys are opaque SHA-256 digests, not source content.';
