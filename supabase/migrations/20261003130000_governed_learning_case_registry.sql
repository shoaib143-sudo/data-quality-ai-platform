-- Governed learning case registry foundation.
-- Extends the existing candidate lifecycle with negative cases while preserving
-- the same fail-closed authority boundaries used by positive-case learning.

alter table agent.learning_candidates
  drop constraint if exists learning_candidates_candidate_type_check;

alter table agent.learning_candidates
  add constraint learning_candidates_candidate_type_check
  check (candidate_type in ('SKILL_IMPROVEMENT','POSITIVE_CASE','NEGATIVE_CASE'));

alter table agent.learning_candidates
  drop constraint if exists learning_candidates_category_check;

alter table agent.learning_candidates
  add constraint learning_candidates_category_check
  check (category in (
    'OUTPUT_CONTRACT','EVIDENCE_GROUNDING','TOOL_CONTRACT','AUTHORITY_GUARDRAIL',
    'CONFIDENCE_CALIBRATION','HANDOFF_CONTRACT','QUALITY_EVALUATION','RESOURCE_EFFICIENCY',
    'POSITIVE_CASE_EXPERIENCE','NEGATIVE_CASE_EXPERIENCE'
  ));

create table if not exists agent.negative_learning_cases (
  candidate_id uuid primary key,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  run_mode text not null check (run_mode in ('SUPERVISED','HANDSFREE')),
  use_case_key text not null,
  problem_signature text not null,
  failure_summary text not null,
  avoid_lesson text not null,
  evidence_refs text[] not null,
  verification_evidence_refs text[] not null default '{}'::text[],
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW','APPROVED','REJECTED','DEFERRED','ONE_OFF','RETIRED')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint negative_learning_cases_candidate_project_uq unique (candidate_id, project_id),
  constraint negative_learning_cases_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint negative_learning_cases_use_case_ck check (length(btrim(use_case_key)) > 0),
  constraint negative_learning_cases_problem_ck check (length(btrim(problem_signature)) > 0),
  constraint negative_learning_cases_summary_ck check (length(btrim(failure_summary)) > 0),
  constraint negative_learning_cases_lesson_ck check (length(btrim(avoid_lesson)) > 0),
  constraint negative_learning_cases_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint negative_learning_cases_review_consistency_ck check (
    (review_status = 'PENDING_REVIEW' and reviewed_by is null and reviewed_at is null)
    or
    (review_status <> 'PENDING_REVIEW' and reviewed_by is not null and reviewed_at is not null
      and length(btrim(coalesce(review_reason,''))) > 0)
  )
);

create index if not exists negative_learning_cases_project_status_idx
  on agent.negative_learning_cases(project_id, review_status, created_at desc);
create index if not exists negative_learning_cases_use_case_idx
  on agent.negative_learning_cases(project_id, use_case_key, review_status);
create index if not exists negative_learning_cases_source_run_idx
  on agent.negative_learning_cases(source_agent_run_id);

alter table agent.negative_learning_cases enable row level security;

drop policy if exists negative_learning_cases_project_read on agent.negative_learning_cases;
create policy negative_learning_cases_project_read
  on agent.negative_learning_cases for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.negative_learning_cases from public, anon, authenticated, service_role;
grant select, insert, update on agent.negative_learning_cases to service_role;

comment on table agent.negative_learning_cases is
  'Human-reviewed negative learning evidence. Rows never grant action authority or mutate agent permissions.';


create table if not exists agent.negative_learning_case_occurrences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  evidence_refs text[] not null,
  verification_evidence_refs text[] not null default '{}'::text[],
  observed_at timestamptz not null default now(),
  constraint negative_learning_case_occurrences_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.negative_learning_cases(candidate_id, project_id)
    on delete cascade,
  constraint negative_learning_case_occurrences_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint negative_learning_case_occurrences_run_uq unique (candidate_id, source_agent_run_id)
);

create index if not exists negative_learning_case_occurrences_project_idx
  on agent.negative_learning_case_occurrences(project_id, candidate_id, observed_at desc);

alter table agent.negative_learning_case_occurrences enable row level security;
revoke all on agent.negative_learning_case_occurrences from public, anon, authenticated, service_role;
grant select, insert on agent.negative_learning_case_occurrences to service_role;

create table if not exists agent.negative_learning_case_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  project_id uuid not null references app.projects(id) on delete cascade,
  decision text not null check (decision in ('APPROVE_NEGATIVE_CASE','REJECT','DEFER','MARK_ONE_OFF')),
  reason text not null check (length(btrim(reason)) > 0),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint negative_learning_case_reviews_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.negative_learning_cases(candidate_id, project_id)
    on delete cascade
);

alter table agent.negative_learning_case_reviews enable row level security;
drop policy if exists negative_learning_case_reviews_project_read on agent.negative_learning_case_reviews;
create policy negative_learning_case_reviews_project_read
  on agent.negative_learning_case_reviews for select to authenticated
  using (app_private.is_project_member(project_id));
revoke all on agent.negative_learning_case_reviews from public, anon, authenticated, service_role;
grant select, insert on agent.negative_learning_case_reviews to service_role;

create or replace function agent.create_negative_learning_case(
  p_project_id uuid,
  p_candidate_key text,
  p_agent_key text,
  p_skill_key text,
  p_source_agent_run_id uuid,
  p_run_mode text,
  p_use_case_key text,
  p_problem_signature text,
  p_failure_summary text,
  p_avoid_lesson text,
  p_evidence_refs text[],
  p_verification_evidence_refs text[] default '{}'::text[],
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_candidate_id uuid;
  v_source_run agent.agent_runs%rowtype;
  v_source_definition agent.agent_definitions%rowtype;
  v_existing agent.learning_candidates%rowtype;
  v_evidence_refs text[];
  v_verification_refs text[];
begin
  if p_project_id is null or p_source_agent_run_id is null then
    raise exception 'project and source agent run are required';
  end if;
  if p_run_mode not in ('SUPERVISED','HANDSFREE') then
    raise exception 'negative learning cases require SUPERVISED or HANDSFREE mode';
  end if;
  if length(btrim(coalesce(p_candidate_key,''))) = 0
    or length(btrim(coalesce(p_use_case_key,''))) = 0
    or length(btrim(coalesce(p_problem_signature,''))) = 0
    or length(btrim(coalesce(p_failure_summary,''))) = 0
    or length(btrim(coalesce(p_avoid_lesson,''))) = 0
  then
    raise exception 'negative learning case text fields are required';
  end if;

  select array_agg(distinct btrim(v) order by btrim(v))
    into v_evidence_refs
  from unnest(coalesce(p_evidence_refs, '{}'::text[])) v
  where length(btrim(v)) > 0;

  select array_agg(distinct btrim(v) order by btrim(v))
    into v_verification_refs
  from unnest(coalesce(p_verification_evidence_refs, '{}'::text[])) v
  where length(btrim(v)) > 0;

  if coalesce(cardinality(v_evidence_refs),0) = 0 then
    raise exception 'negative learning cases require evidence';
  end if;

  select * into v_source_run
  from agent.agent_runs
  where id = p_source_agent_run_id
    and project_id = p_project_id;
  if not found then
    raise exception 'source agent run is missing or cross-project';
  end if;
  if v_source_run.status not in ('FAILED','CANCELLED') then
    raise exception 'negative learning cases require a terminal failed or cancelled agent run';
  end if;

  select * into v_source_definition
  from agent.agent_definitions d
  where d.id = v_source_run.agent_definition_id;
  if not found or v_source_definition.agent_key <> p_agent_key then
    raise exception 'negative learning case agent identity does not match source run';
  end if;

  if not ('agent_run:' || p_source_agent_run_id::text = any(v_evidence_refs)) then
    raise exception 'negative learning evidence must bind the exact source agent run';
  end if;

  select lc.* into v_existing
  from agent.learning_candidates lc
  join agent.negative_learning_cases nc
    on nc.candidate_id = lc.id
   and nc.project_id = lc.project_id
  where lc.project_id = p_project_id
    and lc.candidate_type = 'NEGATIVE_CASE'
    and lc.agent_key = p_agent_key
    and lc.skill_key = p_skill_key
    and nc.use_case_key = btrim(p_use_case_key)
    and nc.problem_signature = btrim(p_problem_signature)
    and nc.review_status in ('PENDING_REVIEW','APPROVED','DEFERRED')
  order by lc.created_at desc
  limit 1;

  if found then
    insert into agent.negative_learning_case_occurrences(
      candidate_id,project_id,source_agent_run_id,evidence_refs,verification_evidence_refs
    ) values (
      v_existing.id,p_project_id,p_source_agent_run_id,v_evidence_refs,coalesce(v_verification_refs,'{}'::text[])
    )
    on conflict (candidate_id, source_agent_run_id) do nothing;

    update agent.negative_learning_cases
    set updated_at = now()
    where candidate_id = v_existing.id
      and project_id = p_project_id;

    return v_existing.id;
  end if;

  select * into v_existing
  from agent.learning_candidates
  where project_id = p_project_id
    and candidate_key = btrim(p_candidate_key);

  if found then
    if v_existing.candidate_type <> 'NEGATIVE_CASE'
      or v_existing.source_agent_run_id is distinct from p_source_agent_run_id
    then
      raise exception 'candidate key already belongs to a different governed learning candidate';
    end if;
    return v_existing.id;
  end if;

  insert into agent.learning_candidates(
    project_id,candidate_key,candidate_type,agent_key,skill_key,category,title,proposed_change,
    baseline_version,candidate_version,evidence_cutoff_at,source_agent_run_id,
    may_auto_apply,may_self_promote,may_expand_tool_authority,may_change_mutation_boundary,
    requires_human_review,current_authorization_required_at_release,status
  ) values (
    p_project_id,btrim(p_candidate_key),'NEGATIVE_CASE',p_agent_key,p_skill_key,
    'NEGATIVE_CASE_EXPERIENCE','Negative case: ' || btrim(p_use_case_key),btrim(p_avoid_lesson),
    'negative-case-memory-v1','negative-case:' || p_source_agent_run_id::text,now(),p_source_agent_run_id,
    false,false,false,false,true,true,'REVIEW_REQUIRED'
  )
  returning id into v_candidate_id;

  insert into agent.negative_learning_cases(
    candidate_id,project_id,source_agent_run_id,run_mode,use_case_key,problem_signature,
    failure_summary,avoid_lesson,evidence_refs,verification_evidence_refs
  ) values (
    v_candidate_id,p_project_id,p_source_agent_run_id,p_run_mode,btrim(p_use_case_key),
    btrim(p_problem_signature),btrim(p_failure_summary),btrim(p_avoid_lesson),
    v_evidence_refs,coalesce(v_verification_refs,'{}'::text[])
  );

  insert into agent.negative_learning_case_occurrences(
    candidate_id,project_id,source_agent_run_id,evidence_refs,verification_evidence_refs
  ) values (
    v_candidate_id,p_project_id,p_source_agent_run_id,v_evidence_refs,coalesce(v_verification_refs,'{}'::text[])
  );

  insert into agent.learning_candidate_transitions(
    project_id,candidate_id,from_status,to_status,reason,actor_user_id
  ) values (
    p_project_id,v_candidate_id,null,'REVIEW_REQUIRED',
    'VERIFIED_NEGATIVE_CASE_AWAITS_ADMIN_REVIEW',p_actor_user_id
  );

  return v_candidate_id;
end;
$$;

create or replace function agent.review_negative_learning_case(
  p_project_id uuid,
  p_candidate_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_case agent.negative_learning_cases%rowtype;
  v_learning_target_status text;
  v_review_status text;
  v_agent_definition_id uuid;
begin
  if p_decision not in ('APPROVE_NEGATIVE_CASE','REJECT','DEFER','MARK_ONE_OFF') then
    raise exception 'unsupported negative-case admin decision';
  end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then
    raise exception 'negative-case review reason is required';
  end if;

  if not exists (
    select 1 from governance.project_role_bindings b
    where b.project_id = p_project_id
      and b.user_id = p_actor_user_id
      and b.role_key = 'DATA_GOVERNANCE_ADMIN'
      and b.active = true
      and (b.expires_at is null or b.expires_at > now())
  ) then
    raise exception 'Data Governance Admin authority is required to review a negative learning case';
  end if;

  select * into v_case
  from agent.negative_learning_cases
  where candidate_id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'negative learning case not found in project'; end if;
  if v_case.review_status not in ('PENDING_REVIEW','DEFERRED') then
    raise exception 'negative learning case is no longer reviewable';
  end if;

  v_review_status := case p_decision
    when 'APPROVE_NEGATIVE_CASE' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    when 'DEFER' then 'DEFERRED'
    when 'MARK_ONE_OFF' then 'ONE_OFF'
  end;
  v_learning_target_status := case p_decision
    when 'APPROVE_NEGATIVE_CASE' then 'ACTIVE'
    when 'REJECT' then 'REJECTED'
    when 'DEFER' then 'REVIEW_REQUIRED'
    when 'MARK_ONE_OFF' then 'RETIRED'
  end;

  update agent.negative_learning_cases
  set review_status = v_review_status,
      reviewed_by = p_actor_user_id,
      reviewed_at = now(),
      review_reason = btrim(p_reason),
      updated_at = now()
  where candidate_id = p_candidate_id and project_id = p_project_id;

  insert into agent.negative_learning_case_reviews(
    candidate_id,project_id,decision,reason,actor_user_id
  ) values (
    p_candidate_id,p_project_id,p_decision,btrim(p_reason),p_actor_user_id
  );

  update agent.learning_candidates
  set status = v_learning_target_status, updated_at = now()
  where id = p_candidate_id
    and project_id = p_project_id
    and candidate_type = 'NEGATIVE_CASE'
    and status = 'REVIEW_REQUIRED';
  if not found then raise exception 'canonical negative learning candidate is not REVIEW_REQUIRED'; end if;

  insert into agent.learning_candidate_transitions(
    project_id,candidate_id,from_status,to_status,reason,actor_user_id
  ) values (
    p_project_id,p_candidate_id,'REVIEW_REQUIRED',v_learning_target_status,
    'NEGATIVE_CASE_ADMIN_DECISION:' || p_decision,p_actor_user_id
  );

  if p_decision = 'APPROVE_NEGATIVE_CASE' then
    select r.agent_definition_id into v_agent_definition_id
    from agent.agent_runs r
    where r.id = v_case.source_agent_run_id
      and r.project_id = p_project_id;
    if v_agent_definition_id is null then
      raise exception 'source agent definition is unavailable for negative learning case';
    end if;

    insert into agent.agent_learning_cases(
      project_id,agent_definition_id,source_agent_run_id,case_key,source_kind,problem_type,
      context,recommendation,decision_status,outcome_status,evidence,status,occurred_at,updated_at
    ) values (
      p_project_id,v_agent_definition_id,v_case.source_agent_run_id,
      'negative-case:' || p_candidate_id::text,'PGCL_NEGATIVE_CASE',v_case.use_case_key,
      jsonb_build_object(
        'negative_case_candidate_id',p_candidate_id,
        'problem_signature',v_case.problem_signature,
        'failure_summary',v_case.failure_summary,
        'run_mode',v_case.run_mode,
        'admin_review_reason',btrim(p_reason)
      ),
      jsonb_build_object('avoid_lesson',v_case.avoid_lesson),
      'VERIFIED','VERIFIED',
      jsonb_build_object(
        'negative_case_candidate_id',p_candidate_id,
        'evidence_refs',v_case.evidence_refs,
        'verification_evidence_refs',v_case.verification_evidence_refs,
        'reviewed_by',p_actor_user_id,
        'reviewed_at',now()
      ),
      'ACTIVE',now(),now()
    )
    on conflict (project_id, case_key) do update
    set context = excluded.context,
        recommendation = excluded.recommendation,
        evidence = excluded.evidence,
        decision_status = 'VERIFIED',
        outcome_status = 'VERIFIED',
        status = 'ACTIVE',
        updated_at = now();
  end if;

  return p_candidate_id;
end;
$$;

revoke all on function agent.create_negative_learning_case(
  uuid,text,text,text,uuid,text,text,text,text,text,text[],text[],uuid
) from public, anon, authenticated;
grant execute on function agent.create_negative_learning_case(
  uuid,text,text,text,uuid,text,text,text,text,text,text[],text[],uuid
) to service_role;

revoke all on function agent.review_negative_learning_case(
  uuid,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function agent.review_negative_learning_case(
  uuid,uuid,uuid,text,text
) to service_role;

comment on function agent.create_negative_learning_case(
  uuid,text,text,text,uuid,text,text,text,text,text,text[],text[],uuid
) is 'Creates a human-reviewable negative learning case from failure evidence. It grants no execution authority.';


create or replace function agent.list_approved_negative_learning_cases(
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
    lc.evidence->>'negative_case_candidate_id' as candidate_id,
    lc.case_key,
    lc.problem_type,
    lc.context,
    lc.recommendation,
    lc.evidence,
    lc.updated_at
  from agent.agent_learning_cases lc
  where lc.project_id = p_project_id
    and lc.agent_definition_id = p_agent_definition_id
    and lc.source_kind = 'PGCL_NEGATIVE_CASE'
    and lc.status = 'ACTIVE'
    and lc.decision_status = 'VERIFIED'
    and lc.outcome_status = 'VERIFIED'
    and nullif(btrim(lc.evidence->>'negative_case_candidate_id'),'') is not null
    and nullif(btrim(lc.recommendation->>'avoid_lesson'),'') is not null
  order by lc.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function agent.list_approved_negative_learning_cases(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function agent.list_approved_negative_learning_cases(uuid,uuid,integer)
  to service_role;

comment on function agent.list_approved_negative_learning_cases(uuid,uuid,integer) is
  'Returns active, verified, Data Governance Admin-approved negative learning cases for the same project and originating agent definition. Cases are context-only avoidance guidance and confer no action authority.';


create table if not exists agent.negative_learning_case_usages (
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
  constraint negative_learning_case_usages_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.negative_learning_cases(candidate_id, project_id)
    on delete cascade,
  constraint negative_learning_case_usages_learning_case_project_fk
    foreign key (learning_case_id, project_id)
    references agent.agent_learning_cases(id, project_id)
    on delete cascade,
  constraint negative_learning_case_usages_consumer_run_project_fk
    foreign key (consumer_agent_run_id, project_id)
    references agent.agent_runs(id, project_id)
    on delete cascade,
  constraint negative_learning_case_usages_uq
    unique (project_id, candidate_id, consumer_agent_run_id)
);

create or replace function agent.validate_negative_learning_case_usage()
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
    or v_learning_case.source_kind <> 'PGCL_NEGATIVE_CASE'
    or v_learning_case.evidence->>'negative_case_candidate_id' <> new.candidate_id::text
  then
    raise exception 'negative learning usage must reference the matching approved negative learning case';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_negative_learning_case_usage on agent.negative_learning_case_usages;
create trigger validate_negative_learning_case_usage
before insert or update on agent.negative_learning_case_usages
for each row execute function agent.validate_negative_learning_case_usage();

create index if not exists negative_learning_case_usages_candidate_idx
  on agent.negative_learning_case_usages(project_id, candidate_id, updated_at desc);
create index if not exists negative_learning_case_usages_consumer_run_idx
  on agent.negative_learning_case_usages(consumer_agent_run_id, updated_at desc);

alter table agent.negative_learning_case_usages enable row level security;
drop policy if exists negative_learning_case_usages_project_read on agent.negative_learning_case_usages;
create policy negative_learning_case_usages_project_read
  on agent.negative_learning_case_usages for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.negative_learning_case_usages from public, anon, authenticated, service_role;
grant select (project_id,candidate_id,usage_status,updated_at)
  on agent.negative_learning_case_usages to authenticated;
grant select, insert, update on agent.negative_learning_case_usages to service_role;

revoke all on function agent.validate_negative_learning_case_usage() from public, anon, authenticated, service_role;

comment on table agent.negative_learning_case_usages is
  'Tracks retrieval and bounded application of approved negative learning context by consuming agent runs. Usage evidence never grants authority.';
comment on function agent.validate_negative_learning_case_usage() is
  'Trigger-only guard requiring usage attribution to the exact approved negative learning case.';
