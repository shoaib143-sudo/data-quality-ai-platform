-- Proactive Governed Case Learning (PGCL): durable positive-case candidates.
-- Successful execution is evidence only. Reusable learning requires explicit
-- Data Governance Admin review before promotion into agent.agent_learning_cases.

create table if not exists agent.positive_learning_case_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  candidate_key text not null,
  agent_key text not null,
  skill_key text not null,
  run_mode text not null check (run_mode in ('SUPERVISED','HANDSFREE')),
  use_case_key text not null,
  problem_signature text not null,
  result_summary text not null,
  reusable_lesson text not null,
  applicability_conditions text[] not null default '{}',
  exclusion_conditions text[] not null default '{}',
  evidence_refs text[] not null,
  verification_evidence_refs text[] not null,
  significance_signals text[] not null,
  status text not null default 'PROPOSED'
    check (status in ('PROPOSED','APPROVED','REJECTED','DEFERRED','ONE_OFF','PROMOTED')),
  admin_decision text null
    check (admin_decision is null or admin_decision in (
      'APPROVE_POSITIVE_CASE','APPROVE_WITH_EDITS','REJECT','DEFER','MARK_ONE_OFF'
    )),
  admin_decision_reason text null,
  admin_edits jsonb not null default '{}'::jsonb,
  reviewed_by uuid null references auth.users(id) on delete restrict,
  reviewed_at timestamptz null,
  promoted_learning_case_id uuid null references agent.agent_learning_cases(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_learning_case_candidate_key_ck check (length(btrim(candidate_key)) > 0),
  constraint positive_learning_case_agent_key_ck check (length(btrim(agent_key)) > 0),
  constraint positive_learning_case_skill_key_ck check (length(btrim(skill_key)) > 0),
  constraint positive_learning_case_use_case_key_ck check (length(btrim(use_case_key)) > 0),
  constraint positive_learning_case_problem_ck check (length(btrim(problem_signature)) > 0),
  constraint positive_learning_case_result_ck check (length(btrim(result_summary)) > 0),
  constraint positive_learning_case_lesson_ck check (length(btrim(reusable_lesson)) > 0),
  constraint positive_learning_case_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint positive_learning_case_verification_evidence_ck check (cardinality(verification_evidence_refs) > 0),
  constraint positive_learning_case_significance_ck check (cardinality(significance_signals) > 0),
  constraint positive_learning_case_project_key_uq unique (project_id,candidate_key)
);

create index if not exists positive_learning_case_candidates_project_status_idx
  on agent.positive_learning_case_candidates(project_id,status,created_at desc);
create index if not exists positive_learning_case_candidates_source_run_idx
  on agent.positive_learning_case_candidates(source_agent_run_id);
create index if not exists positive_learning_case_candidates_agent_skill_idx
  on agent.positive_learning_case_candidates(project_id,agent_key,skill_key,created_at desc);

alter table agent.positive_learning_case_candidates enable row level security;
drop policy if exists positive_learning_case_candidates_project_read on agent.positive_learning_case_candidates;
create policy positive_learning_case_candidates_project_read
  on agent.positive_learning_case_candidates
  for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.positive_learning_case_candidates from public,anon,authenticated,service_role;
grant select on agent.positive_learning_case_candidates to authenticated,service_role;
grant all on agent.positive_learning_case_candidates to service_role;

create or replace function agent.create_positive_learning_case_candidate(
  p_project_id uuid,
  p_source_agent_run_id uuid,
  p_candidate_key text,
  p_agent_key text,
  p_skill_key text,
  p_run_mode text,
  p_use_case_key text,
  p_problem_signature text,
  p_result_summary text,
  p_reusable_lesson text,
  p_applicability_conditions text[],
  p_exclusion_conditions text[],
  p_evidence_refs text[],
  p_verification_evidence_refs text[],
  p_significance_signals text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog,agent,app
as $$
declare
  v_run agent.agent_runs%rowtype;
  v_definition agent.agent_definitions%rowtype;
  v_id uuid;
begin
  if p_project_id is null or p_source_agent_run_id is null then
    raise exception 'project and source agent run are required';
  end if;
  if p_run_mode not in ('SUPERVISED','HANDSFREE') then
    raise exception 'PGCL accepts only SUPERVISED or HANDSFREE runs';
  end if;
  if length(btrim(coalesce(p_candidate_key,''))) = 0
    or length(btrim(coalesce(p_agent_key,''))) = 0
    or length(btrim(coalesce(p_skill_key,''))) = 0
    or length(btrim(coalesce(p_use_case_key,''))) = 0
    or length(btrim(coalesce(p_problem_signature,''))) = 0
    or length(btrim(coalesce(p_result_summary,''))) = 0
    or length(btrim(coalesce(p_reusable_lesson,''))) = 0
  then
    raise exception 'PGCL candidate text fields are required';
  end if;
  if p_evidence_refs is null or cardinality(p_evidence_refs)=0 then
    raise exception 'PGCL evidence references are required';
  end if;
  if p_verification_evidence_refs is null or cardinality(p_verification_evidence_refs)=0 then
    raise exception 'PGCL verification evidence references are required';
  end if;
  if p_significance_signals is null or cardinality(p_significance_signals)=0 then
    raise exception 'PGCL significance signals are required';
  end if;

  select * into v_run
  from agent.agent_runs
  where id=p_source_agent_run_id and project_id=p_project_id;
  if not found then
    raise exception 'source agent run was not found in project';
  end if;
  if v_run.status <> 'SUCCEEDED' then
    raise exception 'only successful agent runs may create PGCL positive-case candidates';
  end if;

  select * into v_definition
  from agent.agent_definitions
  where id=v_run.agent_definition_id;
  if not found then
    raise exception 'source agent definition was not found';
  end if;
  if v_definition.agent_key <> p_agent_key then
    raise exception 'PGCL agent key does not match source run agent definition';
  end if;

  insert into agent.positive_learning_case_candidates(
    project_id,source_agent_run_id,agent_definition_id,candidate_key,agent_key,skill_key,run_mode,
    use_case_key,problem_signature,result_summary,reusable_lesson,applicability_conditions,
    exclusion_conditions,evidence_refs,verification_evidence_refs,significance_signals
  ) values (
    p_project_id,p_source_agent_run_id,v_definition.id,btrim(p_candidate_key),btrim(p_agent_key),
    btrim(p_skill_key),p_run_mode,btrim(p_use_case_key),btrim(p_problem_signature),
    btrim(p_result_summary),btrim(p_reusable_lesson),coalesce(p_applicability_conditions,'{}'),
    coalesce(p_exclusion_conditions,'{}'),p_evidence_refs,p_verification_evidence_refs,p_significance_signals
  )
  on conflict (project_id,candidate_key) do update set
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function agent.create_positive_learning_case_candidate(
  uuid,uuid,text,text,text,text,text,text,text,text,text[],text[],text[],text[],text[]
) from public,anon,authenticated;
grant execute on function agent.create_positive_learning_case_candidate(
  uuid,uuid,text,text,text,text,text,text,text,text,text[],text[],text[],text[],text[]
) to service_role;

create or replace function agent.review_positive_learning_case_candidate(
  p_project_id uuid,
  p_candidate_id uuid,
  p_admin_decision text,
  p_reason text,
  p_admin_edits jsonb,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog,agent
as $$
declare
  v_candidate agent.positive_learning_case_candidates%rowtype;
  v_target_status text;
begin
  if p_actor_user_id is null then raise exception 'review actor is required'; end if;
  if p_admin_decision not in (
    'APPROVE_POSITIVE_CASE','APPROVE_WITH_EDITS','REJECT','DEFER','MARK_ONE_OFF'
  ) then raise exception 'unsupported PGCL admin decision'; end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'review reason is required'; end if;

  select * into v_candidate
  from agent.positive_learning_case_candidates
  where id=p_candidate_id and project_id=p_project_id
  for update;
  if not found then raise exception 'PGCL candidate not found in project'; end if;
  if v_candidate.status not in ('PROPOSED','DEFERRED') then
    raise exception 'PGCL candidate is not reviewable from status %',v_candidate.status;
  end if;

  v_target_status := case p_admin_decision
    when 'APPROVE_POSITIVE_CASE' then 'APPROVED'
    when 'APPROVE_WITH_EDITS' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    when 'DEFER' then 'DEFERRED'
    when 'MARK_ONE_OFF' then 'ONE_OFF'
  end;

  if p_admin_decision='APPROVE_WITH_EDITS'
    and coalesce(p_admin_edits,'{}'::jsonb)='{}'::jsonb
  then
    raise exception 'APPROVE_WITH_EDITS requires admin edits';
  end if;

  update agent.positive_learning_case_candidates
  set status=v_target_status,
      admin_decision=p_admin_decision,
      admin_decision_reason=btrim(p_reason),
      admin_edits=coalesce(p_admin_edits,'{}'::jsonb),
      reviewed_by=p_actor_user_id,
      reviewed_at=now(),
      updated_at=now()
  where id=p_candidate_id and project_id=p_project_id;

  return p_candidate_id;
end;
$$;

revoke all on function agent.review_positive_learning_case_candidate(
  uuid,uuid,text,text,jsonb,uuid
) from public,anon,authenticated;
grant execute on function agent.review_positive_learning_case_candidate(
  uuid,uuid,text,text,jsonb,uuid
) to service_role;

create or replace function agent.promote_positive_learning_case_candidate(
  p_project_id uuid,
  p_candidate_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog,agent
as $$
declare
  v_candidate agent.positive_learning_case_candidates%rowtype;
  v_case_id uuid;
begin
  if p_actor_user_id is null then raise exception 'promotion actor is required'; end if;

  select * into v_candidate
  from agent.positive_learning_case_candidates
  where id=p_candidate_id and project_id=p_project_id
  for update;
  if not found then raise exception 'PGCL candidate not found in project'; end if;
  if v_candidate.status='PROMOTED' and v_candidate.promoted_learning_case_id is not null then
    return v_candidate.promoted_learning_case_id;
  end if;
  if v_candidate.status <> 'APPROVED' then
    raise exception 'only APPROVED PGCL candidates may be promoted';
  end if;
  if v_candidate.reviewed_by is null or v_candidate.reviewed_at is null then
    raise exception 'PGCL promotion requires completed Data Governance Admin review';
  end if;

  insert into agent.agent_learning_cases(
    project_id,agent_definition_id,source_agent_run_id,case_key,source_kind,problem_type,
    context,recommendation,decision_status,outcome_status,effectiveness,confidence,evidence,status,occurred_at
  ) values (
    v_candidate.project_id,v_candidate.agent_definition_id,v_candidate.source_agent_run_id,
    'pgcl:'||v_candidate.candidate_key,'PGCL_POSITIVE_CASE',v_candidate.use_case_key,
    jsonb_build_object(
      'problem_signature',v_candidate.problem_signature,
      'run_mode',v_candidate.run_mode,
      'applicability_conditions',v_candidate.applicability_conditions,
      'exclusion_conditions',v_candidate.exclusion_conditions,
      'significance_signals',v_candidate.significance_signals
    ),
    jsonb_build_object(
      'reusable_lesson',v_candidate.reusable_lesson,
      'result_summary',v_candidate.result_summary,
      'admin_edits',v_candidate.admin_edits
    ),
    v_candidate.admin_decision,'VERIFIED_SUCCESS',1,null,
    jsonb_build_object(
      'positive_learning_case_candidate_id',v_candidate.id,
      'evidence_refs',v_candidate.evidence_refs,
      'verification_evidence_refs',v_candidate.verification_evidence_refs,
      'reviewed_by',v_candidate.reviewed_by,
      'reviewed_at',v_candidate.reviewed_at,
      'decision_reason',v_candidate.admin_decision_reason
    ),
    'ACTIVE',v_candidate.reviewed_at
  )
  on conflict (project_id,case_key) do update set
    recommendation=excluded.recommendation,
    decision_status=excluded.decision_status,
    outcome_status=excluded.outcome_status,
    evidence=excluded.evidence,
    status='ACTIVE',
    updated_at=now()
  returning id into v_case_id;

  update agent.positive_learning_case_candidates
  set status='PROMOTED',promoted_learning_case_id=v_case_id,updated_at=now()
  where id=v_candidate.id;

  return v_case_id;
end;
$$;

revoke all on function agent.promote_positive_learning_case_candidate(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function agent.promote_positive_learning_case_candidate(uuid,uuid,uuid)
  to service_role;

comment on table agent.positive_learning_case_candidates is
  'Human-reviewable PGCL proposals derived from verified successful Supervised or Handsfree agent runs. Technical success alone never creates reusable learning.';
