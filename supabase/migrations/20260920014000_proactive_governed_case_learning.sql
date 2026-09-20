-- Proactive Governed Case Learning (PGCL): durable positive-case persistence.
-- Extends the canonical governed learning candidate lifecycle without allowing
-- successful runs to self-promote into reusable organizational knowledge.

alter table agent.learning_candidates
  drop constraint if exists learning_candidates_candidate_type_check;

alter table agent.learning_candidates
  add constraint learning_candidates_candidate_type_check
  check (candidate_type in ('SKILL_IMPROVEMENT','POSITIVE_CASE'));

alter table agent.learning_candidates
  drop constraint if exists learning_candidates_category_check;

alter table agent.learning_candidates
  add constraint learning_candidates_category_check
  check (category in (
    'OUTPUT_CONTRACT','EVIDENCE_GROUNDING','TOOL_CONTRACT','AUTHORITY_GUARDRAIL',
    'CONFIDENCE_CALIBRATION','HANDOFF_CONTRACT','QUALITY_EVALUATION','RESOURCE_EFFICIENCY',
    'POSITIVE_CASE_EXPERIENCE'
  ));

create table if not exists agent.positive_learning_cases (
  candidate_id uuid primary key,
  project_id uuid not null references app.projects(id) on delete cascade,
  constraint positive_learning_cases_candidate_project_uq unique (candidate_id, project_id),
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  run_mode text not null check (run_mode in ('SUPERVISED','HANDSFREE')),
  use_case_key text not null,
  problem_signature text not null,
  result_summary text not null,
  reusable_lesson text not null,
  applicability_conditions text[] not null default '{}'::text[],
  exclusion_conditions text[] not null default '{}'::text[],
  evidence_refs text[] not null,
  verification_evidence_refs text[] not null,
  significance_signals text[] not null,
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW','APPROVED','REJECTED','DEFERRED','ONE_OFF','RETIRED')),
  admin_edits jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_learning_cases_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint positive_learning_cases_use_case_ck check (length(btrim(use_case_key)) > 0),
  constraint positive_learning_cases_problem_ck check (length(btrim(problem_signature)) > 0),
  constraint positive_learning_cases_result_ck check (length(btrim(result_summary)) > 0),
  constraint positive_learning_cases_lesson_ck check (length(btrim(reusable_lesson)) > 0),
  constraint positive_learning_cases_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint positive_learning_cases_verification_ck check (cardinality(verification_evidence_refs) > 0),
  constraint positive_learning_cases_significance_ck check (cardinality(significance_signals) > 0),
  constraint positive_learning_cases_review_consistency_ck check (
    (review_status = 'PENDING_REVIEW' and reviewed_by is null and reviewed_at is null)
    or
    (review_status <> 'PENDING_REVIEW' and reviewed_by is not null and reviewed_at is not null and length(btrim(coalesce(review_reason,''))) > 0)
  )
);

create index if not exists positive_learning_cases_project_status_idx
  on agent.positive_learning_cases(project_id, review_status, created_at desc);
create index if not exists positive_learning_cases_use_case_idx
  on agent.positive_learning_cases(project_id, use_case_key, review_status);
create index if not exists positive_learning_cases_source_run_idx
  on agent.positive_learning_cases(source_agent_run_id);


create table if not exists agent.positive_learning_case_occurrences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  evidence_refs text[] not null,
  verification_evidence_refs text[] not null,
  significance_signals text[] not null,
  observed_at timestamptz not null default now(),
  constraint positive_learning_case_occurrences_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.positive_learning_cases(candidate_id, project_id)
    on delete cascade,
  constraint positive_learning_case_occurrences_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint positive_learning_case_occurrences_verification_ck check (cardinality(verification_evidence_refs) > 0),
  constraint positive_learning_case_occurrences_significance_ck check (cardinality(significance_signals) > 0),
  constraint positive_learning_case_occurrences_run_uq
    unique (candidate_id, source_agent_run_id)
);

create index if not exists positive_learning_case_occurrences_project_idx
  on agent.positive_learning_case_occurrences(project_id, candidate_id, observed_at desc);

create table if not exists agent.positive_learning_case_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  project_id uuid not null references app.projects(id) on delete cascade,
  decision text not null check (decision in (
    'APPROVE_POSITIVE_CASE','APPROVE_WITH_EDITS','REJECT','DEFER','MARK_ONE_OFF'
  )),
  reason text not null check (length(btrim(reason)) > 0),
  edits jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint positive_learning_case_reviews_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.positive_learning_cases(candidate_id, project_id)
    on delete cascade
);

create index if not exists positive_learning_case_reviews_candidate_idx
  on agent.positive_learning_case_reviews(project_id, candidate_id, created_at desc);


create unique index if not exists agent_learning_cases_id_project_uq
  on agent.agent_learning_cases(id, project_id);
create unique index if not exists agent_runs_id_project_uq
  on agent.agent_runs(id, project_id);

create table if not exists agent.positive_learning_case_usages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  learning_case_id uuid not null,
  consumer_agent_run_id uuid not null,
  relevance numeric null check (relevance is null or (relevance >= 0 and relevance <= 1)),
  usage_status text not null default 'RETRIEVED'
    check (usage_status in ('RETRIEVED','APPLIED','SUCCEEDED','FAILED','DISMISSED')),
  outcome jsonb not null default '{}'::jsonb,
  first_retrieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_learning_case_usages_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.positive_learning_cases(candidate_id, project_id)
    on delete cascade,
  constraint positive_learning_case_usages_learning_case_project_fk
    foreign key (learning_case_id, project_id)
    references agent.agent_learning_cases(id, project_id)
    on delete cascade,
  constraint positive_learning_case_usages_consumer_run_project_fk
    foreign key (consumer_agent_run_id, project_id)
    references agent.agent_runs(id, project_id)
    on delete cascade,
  constraint positive_learning_case_usages_uq
    unique (project_id, candidate_id, consumer_agent_run_id)
);

create or replace function agent.validate_positive_learning_case_usage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_learning_case agent.agent_learning_cases%rowtype;
begin
  select * into v_learning_case
  from agent.agent_learning_cases
  where id = new.learning_case_id
    and project_id = new.project_id;

  if not found
    or v_learning_case.source_kind <> 'PGCL_POSITIVE_CASE'
    or v_learning_case.evidence->>'pgcl_candidate_id' <> new.candidate_id::text
  then
    raise exception 'positive learning usage must reference the matching approved PGCL learning case';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_positive_learning_case_usage on agent.positive_learning_case_usages;
create trigger validate_positive_learning_case_usage
before insert or update on agent.positive_learning_case_usages
for each row execute function agent.validate_positive_learning_case_usage();

create index if not exists positive_learning_case_usages_candidate_idx
  on agent.positive_learning_case_usages(project_id, candidate_id, updated_at desc);
create index if not exists positive_learning_case_usages_consumer_run_idx
  on agent.positive_learning_case_usages(consumer_agent_run_id, updated_at desc);

alter table agent.positive_learning_cases enable row level security;
alter table agent.positive_learning_case_occurrences enable row level security;
alter table agent.positive_learning_case_reviews enable row level security;
alter table agent.positive_learning_case_usages enable row level security;

revoke all on agent.positive_learning_cases from public, anon, authenticated, service_role;
revoke all on agent.positive_learning_case_occurrences from public, anon, authenticated, service_role;
revoke all on agent.positive_learning_case_reviews from public, anon, authenticated, service_role;
revoke all on agent.positive_learning_case_usages from public, anon, authenticated, service_role;
grant select, insert, update on agent.positive_learning_cases to service_role;
grant select, insert on agent.positive_learning_case_occurrences to service_role;
grant select, insert on agent.positive_learning_case_reviews to service_role;
grant select, insert, update on agent.positive_learning_case_usages to service_role;

create or replace function agent.create_positive_learning_case(
  p_project_id uuid,
  p_candidate_key text,
  p_agent_key text,
  p_skill_key text,
  p_source_agent_run_id uuid,
  p_run_mode text,
  p_use_case_key text,
  p_problem_signature text,
  p_result_summary text,
  p_reusable_lesson text,
  p_applicability_conditions text[],
  p_exclusion_conditions text[],
  p_evidence_refs text[],
  p_verification_evidence_refs text[],
  p_significance_signals text[],
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_candidate_id uuid;
  v_existing agent.learning_candidates%rowtype;
  v_evidence_refs text[];
  v_verification_refs text[];
  v_significance text[];
  v_cluster_candidate_id uuid;
  v_source_run agent.agent_runs%rowtype;
  v_source_definition agent.agent_definitions%rowtype;
  v_verification_ref text;
  v_evaluation_id uuid;
  v_evaluation agent.agent_evaluations%rowtype;
  v_profile_run_id uuid;
  v_profile_project_id uuid;
  v_artifact_id uuid;
  v_artifact_run_id uuid;
  v_run_ref_id uuid;
begin
  if p_project_id is null or p_source_agent_run_id is null then
    raise exception 'project and source agent run are required';
  end if;
  if p_run_mode not in ('SUPERVISED','HANDSFREE') then
    raise exception 'positive learning cases require SUPERVISED or HANDSFREE mode';
  end if;
  if length(btrim(coalesce(p_candidate_key,''))) = 0
    or length(btrim(coalesce(p_use_case_key,''))) = 0
    or length(btrim(coalesce(p_problem_signature,''))) = 0
    or length(btrim(coalesce(p_result_summary,''))) = 0
    or length(btrim(coalesce(p_reusable_lesson,''))) = 0
  then
    raise exception 'positive learning case text fields are required';
  end if;

  select array_agg(distinct btrim(v) order by btrim(v))
    into v_evidence_refs
  from unnest(coalesce(p_evidence_refs, '{}'::text[])) v
  where length(btrim(v)) > 0;

  select array_agg(distinct btrim(v) order by btrim(v))
    into v_verification_refs
  from unnest(coalesce(p_verification_evidence_refs, '{}'::text[])) v
  where length(btrim(v)) > 0;

  select array_agg(distinct btrim(v) order by btrim(v))
    into v_significance
  from unnest(coalesce(p_significance_signals, '{}'::text[])) v
  where length(btrim(v)) > 0;

  if coalesce(cardinality(v_evidence_refs),0) = 0
    or coalesce(cardinality(v_verification_refs),0) = 0
    or coalesce(cardinality(v_significance),0) = 0
  then
    raise exception 'evidence, verification evidence and significance signals are required';
  end if;

  if exists (
    select 1
    from unnest(v_significance) s
    where s not in (
      'NEW_USE_CASE','NOVEL_VERIFIED_STRATEGY','FIRST_SUCCESS_AFTER_FAILURES',
      'MATERIAL_EFFICIENCY_GAIN','REPEATED_SUCCESS_THRESHOLD',
      'HIGH_VALUE_GOVERNANCE_PRECEDENT','BROADENED_APPLICABILITY'
    )
  ) then
    raise exception 'unsupported PGCL significance signal';
  end if;

  select * into v_source_run
  from agent.agent_runs r
  where r.id = p_source_agent_run_id
    and r.project_id = p_project_id;
  if not found then
    raise exception 'source agent run is missing or cross-project';
  end if;
  if v_source_run.status <> 'SUCCEEDED' then
    raise exception 'only SUCCEEDED agent runs may create positive learning cases';
  end if;

  select * into v_source_definition
  from agent.agent_definitions d
  where d.id = v_source_run.agent_definition_id;
  if not found or v_source_definition.agent_key <> p_agent_key then
    raise exception 'positive learning case agent identity does not match source run';
  end if;

  if not ('agent_run:' || p_source_agent_run_id::text = any(v_evidence_refs)) then
    raise exception 'positive learning case evidence must bind the exact source agent run';
  end if;

  foreach v_verification_ref in array v_verification_refs loop
    if v_verification_ref ~ '^native_trajectory_evaluation:[0-9a-fA-F-]{36}$' then
      v_evaluation_id := split_part(v_verification_ref, ':', 2)::uuid;
      select * into v_evaluation
      from agent.agent_evaluations e
      where e.id = v_evaluation_id
        and e.project_id = p_project_id
        and e.evaluator_type = 'NATIVE_TRAJECTORY';

      if not found then
        raise exception 'PGCL native trajectory evidence is missing or cross-project: %', v_verification_ref;
      end if;
      if v_evaluation.score is null
        or coalesce(v_evaluation.dimensions->>'terminal_status','') <> 'SUCCEEDED'
      then
        raise exception 'PGCL native trajectory evidence does not prove successful execution: %', v_verification_ref;
      end if;
      if v_evaluation.agent_run_id <> v_source_run.id
        and v_evaluation.agent_run_id is distinct from v_source_run.parent_run_id
      then
        raise exception 'PGCL native trajectory evidence is not bound to the source run trajectory: %', v_verification_ref;
      end if;

    elsif v_verification_ref ~ '^profile_run:[0-9a-fA-F-]{36}(:validated)?$' then
      v_profile_run_id := split_part(v_verification_ref, ':', 2)::uuid;
      select d.project_id into v_profile_project_id
      from profiling.profile_runs pr
      join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
      join catalog.datasets d on d.id = dv.dataset_id
      where pr.id = v_profile_run_id
        and pr.status = 'COMPLETED';

      if v_profile_project_id is null or v_profile_project_id <> p_project_id then
        raise exception 'PGCL profile-run evidence is missing, incomplete, or cross-project: %', v_verification_ref;
      end if;

    elsif v_verification_ref ~ '^agent_result_artifact:[0-9a-fA-F-]{36}$' then
      v_artifact_id := split_part(v_verification_ref, ':', 2)::uuid;
      select a.agent_run_id into v_artifact_run_id
      from agent.agent_artifacts a
      where a.id = v_artifact_id
        and a.artifact_type = 'AGENT_RUN_RESULT'
        and a.content_hash is not null;

      if v_artifact_run_id is null or v_artifact_run_id <> p_source_agent_run_id then
        raise exception 'PGCL result-artifact evidence is missing or not bound to the source run: %', v_verification_ref;
      end if;

    elsif v_verification_ref ~ '^agent_run:[0-9a-fA-F-]{36}:succeeded$' then
      v_run_ref_id := split_part(v_verification_ref, ':', 2)::uuid;
      if v_run_ref_id <> p_source_agent_run_id
        or not exists (
          select 1 from agent.agent_runs r
          where r.id = v_run_ref_id
            and r.project_id = p_project_id
            and r.status = 'SUCCEEDED'
        )
      then
        raise exception 'PGCL successful-run evidence is missing or not bound to the source run: %', v_verification_ref;
      end if;

    else
      raise exception 'unsupported PGCL verification evidence reference: %', v_verification_ref;
    end if;
  end loop;

  if not ('BROADENED_APPLICABILITY' = any(v_significance)) then
    select plc.candidate_id into v_cluster_candidate_id
    from agent.positive_learning_cases plc
    join agent.learning_candidates lc
      on lc.id = plc.candidate_id
     and lc.project_id = plc.project_id
    where plc.project_id = p_project_id
      and lc.agent_key = p_agent_key
      and lc.skill_key = p_skill_key
      and plc.use_case_key = btrim(p_use_case_key)
      and plc.review_status in ('PENDING_REVIEW','DEFERRED','APPROVED')
    order by
      case plc.review_status
        when 'PENDING_REVIEW' then 0
        when 'DEFERRED' then 1
        else 2
      end,
      plc.updated_at desc
    limit 1
    for update of plc;

    if v_cluster_candidate_id is not null then
      insert into agent.positive_learning_case_occurrences(
        candidate_id,
        project_id,
        source_agent_run_id,
        evidence_refs,
        verification_evidence_refs,
        significance_signals
      ) values (
        v_cluster_candidate_id,
        p_project_id,
        p_source_agent_run_id,
        v_evidence_refs,
        v_verification_refs,
        v_significance
      )
      on conflict (candidate_id, source_agent_run_id) do nothing;

      update agent.positive_learning_cases
      set updated_at = now()
      where candidate_id = v_cluster_candidate_id
        and project_id = p_project_id;

      return v_cluster_candidate_id;
    end if;
  end if;

  select * into v_existing
  from agent.learning_candidates
  where project_id = p_project_id and candidate_key = btrim(p_candidate_key);

  if found then
    if v_existing.candidate_type <> 'POSITIVE_CASE'
      or v_existing.source_agent_run_id is distinct from p_source_agent_run_id
    then
      raise exception 'candidate key already belongs to a different governed learning candidate';
    end if;
    return v_existing.id;
  end if;

  insert into agent.learning_candidates(
    project_id,
    candidate_key,
    candidate_type,
    agent_key,
    skill_key,
    category,
    title,
    proposed_change,
    baseline_version,
    candidate_version,
    evidence_cutoff_at,
    source_agent_run_id,
    may_auto_apply,
    may_self_promote,
    may_expand_tool_authority,
    may_change_mutation_boundary,
    requires_human_review,
    current_authorization_required_at_release,
    status
  ) values (
    p_project_id,
    btrim(p_candidate_key),
    'POSITIVE_CASE',
    p_agent_key,
    p_skill_key,
    'POSITIVE_CASE_EXPERIENCE',
    'Positive case: ' || btrim(p_use_case_key),
    btrim(p_reusable_lesson),
    'positive-case-memory-v1',
    'positive-case:' || p_source_agent_run_id::text,
    now(),
    p_source_agent_run_id,
    false,
    false,
    false,
    false,
    true,
    true,
    'REVIEW_REQUIRED'
  )
  returning id into v_candidate_id;

  insert into agent.positive_learning_cases(
    candidate_id,
    project_id,
    source_agent_run_id,
    run_mode,
    use_case_key,
    problem_signature,
    result_summary,
    reusable_lesson,
    applicability_conditions,
    exclusion_conditions,
    evidence_refs,
    verification_evidence_refs,
    significance_signals
  ) values (
    v_candidate_id,
    p_project_id,
    p_source_agent_run_id,
    p_run_mode,
    btrim(p_use_case_key),
    btrim(p_problem_signature),
    btrim(p_result_summary),
    btrim(p_reusable_lesson),
    coalesce(p_applicability_conditions, '{}'::text[]),
    coalesce(p_exclusion_conditions, '{}'::text[]),
    v_evidence_refs,
    v_verification_refs,
    v_significance
  );

  insert into agent.positive_learning_case_occurrences(
    candidate_id,
    project_id,
    source_agent_run_id,
    evidence_refs,
    verification_evidence_refs,
    significance_signals
  ) values (
    v_candidate_id,
    p_project_id,
    p_source_agent_run_id,
    v_evidence_refs,
    v_verification_refs,
    v_significance
  );

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate_id, null, 'REVIEW_REQUIRED',
    'PGCL_VERIFIED_POSITIVE_CASE_AWAITS_ADMIN_REVIEW', p_actor_user_id
  );

  return v_candidate_id;
end;
$$;

create or replace function agent.review_positive_learning_case(
  p_project_id uuid,
  p_candidate_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_reason text,
  p_edits jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_case agent.positive_learning_cases%rowtype;
  v_target_status text;
  v_learning_target_status text;
  v_agent_definition_id uuid;
  v_effective_lesson text;
begin
  if p_project_id is null or p_candidate_id is null or p_actor_user_id is null then
    raise exception 'project, candidate and actor are required';
  end if;
  if p_decision not in (
    'APPROVE_POSITIVE_CASE','APPROVE_WITH_EDITS','REJECT','DEFER','MARK_ONE_OFF'
  ) then
    raise exception 'unsupported PGCL admin decision';
  end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then
    raise exception 'PGCL review reason is required';
  end if;
  if p_decision = 'APPROVE_WITH_EDITS'
    and length(btrim(coalesce(p_edits->>'reusableLesson',''))) = 0
  then
    raise exception 'APPROVE_WITH_EDITS requires a revised reusable lesson';
  end if;

  if not exists (
    select 1
    from governance.project_role_bindings b
    where b.project_id = p_project_id
      and b.user_id = p_actor_user_id
      and b.role_key = 'DATA_GOVERNANCE_ADMIN'
      and b.active = true
      and (b.expires_at is null or b.expires_at > now())
  ) then
    raise exception 'Data Governance Admin authority is required to review a positive learning case';
  end if;

  select * into v_case
  from agent.positive_learning_cases
  where candidate_id = p_candidate_id and project_id = p_project_id
  for update;

  if not found then
    raise exception 'positive learning case not found in project';
  end if;
  if v_case.review_status not in ('PENDING_REVIEW','DEFERRED') then
    raise exception 'positive learning case is no longer reviewable';
  end if;

  v_target_status := case p_decision
    when 'APPROVE_POSITIVE_CASE' then 'APPROVED'
    when 'APPROVE_WITH_EDITS' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    when 'DEFER' then 'DEFERRED'
    when 'MARK_ONE_OFF' then 'ONE_OFF'
  end;

  v_learning_target_status := case p_decision
    when 'APPROVE_POSITIVE_CASE' then 'ACTIVE'
    when 'APPROVE_WITH_EDITS' then 'ACTIVE'
    when 'REJECT' then 'REJECTED'
    when 'DEFER' then 'REVIEW_REQUIRED'
    when 'MARK_ONE_OFF' then 'RETIRED'
  end;

  v_effective_lesson := case
    when p_decision = 'APPROVE_WITH_EDITS'
      and length(btrim(coalesce(p_edits->>'reusableLesson',''))) > 0
      then btrim(p_edits->>'reusableLesson')
    else v_case.reusable_lesson
  end;

  select r.agent_definition_id into v_agent_definition_id
  from agent.agent_runs r
  where r.id = v_case.source_agent_run_id
    and r.project_id = p_project_id;

  if v_agent_definition_id is null then
    raise exception 'source agent definition is unavailable for positive learning case';
  end if;

  update agent.positive_learning_cases
  set
    review_status = v_target_status,
    reusable_lesson = v_effective_lesson,
    admin_edits = coalesce(p_edits, '{}'::jsonb),
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    review_reason = btrim(p_reason),
    updated_at = now()
  where candidate_id = p_candidate_id and project_id = p_project_id;

  insert into agent.positive_learning_case_reviews(
    candidate_id, project_id, decision, reason, edits, actor_user_id
  ) values (
    p_candidate_id, p_project_id, p_decision, btrim(p_reason),
    coalesce(p_edits, '{}'::jsonb), p_actor_user_id
  );

  update agent.learning_candidates
  set status = v_learning_target_status,
      updated_at = now()
  where id = p_candidate_id
    and project_id = p_project_id
    and candidate_type = 'POSITIVE_CASE'
    and status = 'REVIEW_REQUIRED';

  if not found then
    raise exception 'canonical positive learning candidate is not REVIEW_REQUIRED';
  end if;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, p_candidate_id, 'REVIEW_REQUIRED', v_learning_target_status,
    'PGCL_ADMIN_DECISION:' || p_decision, p_actor_user_id
  );

  if p_decision in ('APPROVE_POSITIVE_CASE','APPROVE_WITH_EDITS') then
    insert into agent.agent_learning_cases(
      project_id,
      agent_definition_id,
      source_agent_run_id,
      case_key,
      source_kind,
      problem_type,
      context,
      recommendation,
      decision_status,
      outcome_status,
      effectiveness,
      confidence,
      evidence,
      status,
      occurred_at,
      updated_at
    ) values (
      p_project_id,
      v_agent_definition_id,
      v_case.source_agent_run_id,
      'pgcl:' || p_candidate_id::text,
      'PGCL_POSITIVE_CASE',
      v_case.use_case_key,
      jsonb_build_object(
        'pgcl_candidate_id', p_candidate_id,
        'run_mode', v_case.run_mode,
        'problem_signature', v_case.problem_signature,
        'result_summary', v_case.result_summary,
        'applicability_conditions', v_case.applicability_conditions,
        'exclusion_conditions', v_case.exclusion_conditions,
        'significance_signals', v_case.significance_signals,
        'admin_review_reason', btrim(p_reason)
      ),
      jsonb_build_object('reusable_lesson', v_effective_lesson),
      'VERIFIED',
      'VERIFIED',
      null,
      null,
      jsonb_build_object(
        'pgcl_candidate_id', p_candidate_id,
        'evidence_refs', v_case.evidence_refs,
        'verification_evidence_refs', v_case.verification_evidence_refs,
        'reviewed_by', p_actor_user_id,
        'reviewed_at', now()
      ),
      'ACTIVE',
      now(),
      now()
    )
    on conflict (project_id, case_key) do update
    set
      recommendation = excluded.recommendation,
      context = excluded.context,
      evidence = excluded.evidence,
      decision_status = 'VERIFIED',
      outcome_status = 'VERIFIED',
      status = 'ACTIVE',
      updated_at = now();
  end if;

  return p_candidate_id;
end;
$$;

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
  where lc.project_id = p_project_id
    and lc.agent_definition_id = p_agent_definition_id
    and lc.source_kind = 'PGCL_POSITIVE_CASE'
    and lc.status = 'ACTIVE'
    and lc.decision_status = 'VERIFIED'
    and lc.outcome_status = 'VERIFIED'
    and nullif(btrim(lc.evidence->>'pgcl_candidate_id'),'') is not null
    and nullif(btrim(lc.recommendation->>'reusable_lesson'),'') is not null
  order by lc.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function agent.list_approved_positive_learning_cases(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function agent.list_approved_positive_learning_cases(uuid,uuid,integer)
  to service_role;

comment on function agent.list_approved_positive_learning_cases(uuid,uuid,integer) is
  'Returns only active, verified, Data Governance Admin-approved PGCL cases for the same project and originating agent definition. Cases remain context only and confer no authority.';

revoke all on function agent.create_positive_learning_case(
  uuid,text,text,text,uuid,text,text,text,text,text,text[],text[],text[],text[],text[],uuid
) from public, anon, authenticated;
grant execute on function agent.create_positive_learning_case(
  uuid,text,text,text,uuid,text,text,text,text,text,text[],text[],text[],text[],text[],uuid
) to service_role;

revoke all on function agent.review_positive_learning_case(
  uuid,uuid,uuid,text,text,jsonb
) from public, anon, authenticated;
grant execute on function agent.review_positive_learning_case(
  uuid,uuid,uuid,text,text,jsonb
) to service_role;

comment on table agent.positive_learning_cases is
  'PGCL positive cases proposed from verified successful Supervised/Handsfree runs. Reuse requires Data Governance Admin approval.';
comment on table agent.positive_learning_case_occurrences is
  'Occurrence provenance for clustered PGCL cases. Repeated verified runs do not create duplicate Admin prompts unless applicability materially broadens.';
comment on table agent.positive_learning_case_reviews is
  'Append-only Data Governance Admin review history for PGCL positive cases.';
comment on table agent.positive_learning_case_usages is
  'Tracks retrieval and downstream outcome of Admin-approved PGCL cases by consuming agent runs.';
