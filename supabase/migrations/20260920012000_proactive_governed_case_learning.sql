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

alter table agent.positive_learning_cases enable row level security;
alter table agent.positive_learning_case_reviews enable row level security;

revoke all on agent.positive_learning_cases from public, anon, authenticated, service_role;
revoke all on agent.positive_learning_case_reviews from public, anon, authenticated, service_role;
grant select, insert, update on agent.positive_learning_cases to service_role;
grant select, insert on agent.positive_learning_case_reviews to service_role;

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

  if not exists (
    select 1 from agent.agent_runs r
    where r.id = p_source_agent_run_id
      and r.project_id = p_project_id
  ) then
    raise exception 'source agent run is missing or cross-project';
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
    'PROPOSED'
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

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate_id, null, 'PROPOSED',
    'PGCL_POSITIVE_CASE_PROPOSED_FOR_ADMIN_REVIEW', p_actor_user_id
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
  if v_case.review_status <> 'PENDING_REVIEW' and p_decision <> 'DEFER' then
    raise exception 'positive learning case is no longer pending review';
  end if;

  v_target_status := case p_decision
    when 'APPROVE_POSITIVE_CASE' then 'APPROVED'
    when 'APPROVE_WITH_EDITS' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    when 'DEFER' then 'DEFERRED'
    when 'MARK_ONE_OFF' then 'ONE_OFF'
  end;

  update agent.positive_learning_cases
  set
    review_status = v_target_status,
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

  return p_candidate_id;
end;
$$;

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
comment on table agent.positive_learning_case_reviews is
  'Append-only Data Governance Admin review history for PGCL positive cases.';
