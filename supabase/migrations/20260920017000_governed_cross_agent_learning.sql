-- Governed cross-agent learning: central Learning Platform proposals.
-- Shared patterns are derived from independently approved, production-eligible
-- positive cases from at least two governed agents. Approval makes a pattern
-- available as context only; it never modifies agents or grants action authority.

create table if not exists agent.cross_agent_learning_patterns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  proposal_key text not null,
  pattern_key text not null,
  title text not null,
  summary text not null,
  source_candidate_ids uuid[] not null,
  source_agent_keys text[] not null,
  source_skill_keys text[] not null,
  reusable_lessons text[] not null,
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW','APPROVED','REJECTED','DEFERRED','RETIRED')),
  requires_data_governance_admin_review boolean not null default true
    check (requires_data_governance_admin_review = true),
  may_auto_promote boolean not null default false check (may_auto_promote = false),
  may_authorize_action boolean not null default false check (may_authorize_action = false),
  may_modify_agents boolean not null default false check (may_modify_agents = false),
  may_expand_authority boolean not null default false check (may_expand_authority = false),
  current_policy_reevaluation_required boolean not null default true
    check (current_policy_reevaluation_required = true),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cross_agent_learning_patterns_project_key_uq unique (project_id, proposal_key),
  constraint cross_agent_learning_patterns_pattern_ck check (length(btrim(pattern_key)) > 0),
  constraint cross_agent_learning_patterns_title_ck check (length(btrim(title)) > 0),
  constraint cross_agent_learning_patterns_summary_ck check (length(btrim(summary)) > 0),
  constraint cross_agent_learning_patterns_candidates_ck check (cardinality(source_candidate_ids) >= 2),
  constraint cross_agent_learning_patterns_agents_ck check (cardinality(source_agent_keys) >= 2),
  constraint cross_agent_learning_patterns_lessons_ck check (cardinality(reusable_lessons) >= 1),
  constraint cross_agent_learning_patterns_review_ck check (
    (review_status = 'PENDING_REVIEW' and reviewed_by is null and reviewed_at is null and review_reason is null)
    or
    (review_status <> 'PENDING_REVIEW' and reviewed_by is not null and reviewed_at is not null
      and length(btrim(coalesce(review_reason,''))) > 0)
  ),
  constraint cross_agent_learning_patterns_agent_keys_ck check (
    source_agent_keys <@ array[
      'profiling_agent','data_quality_agent','steward_agent','governance_analyst_agent',
      'architect_agent','investigator_agent','executive_agent','support_agent'
    ]::text[]
  )
);

create index if not exists cross_agent_learning_patterns_project_status_idx
  on agent.cross_agent_learning_patterns(project_id, review_status, updated_at desc);
create index if not exists cross_agent_learning_patterns_project_pattern_idx
  on agent.cross_agent_learning_patterns(project_id, pattern_key, review_status);

create table if not exists agent.cross_agent_learning_pattern_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  pattern_id uuid not null references agent.cross_agent_learning_patterns(id) on delete cascade,
  decision text not null check (decision in ('APPROVE_PATTERN','REJECT','DEFER','RETIRE')),
  reason text not null check (length(btrim(reason)) > 0),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists cross_agent_learning_pattern_reviews_project_idx
  on agent.cross_agent_learning_pattern_reviews(project_id, pattern_id, created_at desc);

alter table agent.cross_agent_learning_patterns enable row level security;
alter table agent.cross_agent_learning_pattern_reviews enable row level security;

drop policy if exists cross_agent_learning_patterns_project_read
  on agent.cross_agent_learning_patterns;
create policy cross_agent_learning_patterns_project_read
  on agent.cross_agent_learning_patterns
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists cross_agent_learning_pattern_reviews_project_read
  on agent.cross_agent_learning_pattern_reviews;
create policy cross_agent_learning_pattern_reviews_project_read
  on agent.cross_agent_learning_pattern_reviews
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.cross_agent_learning_patterns from public, anon, authenticated, service_role;
revoke all on agent.cross_agent_learning_pattern_reviews from public, anon, authenticated, service_role;
grant select on agent.cross_agent_learning_patterns to authenticated, service_role;
grant select on agent.cross_agent_learning_pattern_reviews to authenticated, service_role;

drop trigger if exists reject_cross_agent_learning_pattern_review_mutation
  on agent.cross_agent_learning_pattern_reviews;
create trigger reject_cross_agent_learning_pattern_review_mutation
before update or delete on agent.cross_agent_learning_pattern_reviews
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.create_cross_agent_learning_pattern(
  p_project_id uuid,
  p_proposal_key text,
  p_pattern_key text,
  p_title text,
  p_summary text,
  p_source_candidate_ids uuid[],
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate_ids uuid[];
  v_valid_candidate_ids uuid[];
  v_agent_keys text[];
  v_skill_keys text[];
  v_lessons text[];
  v_mismatched_patterns integer;
  v_expected_key text;
  v_existing agent.cross_agent_learning_patterns%rowtype;
  v_id uuid;
begin
  if p_project_id is null then raise exception 'projectId is required'; end if;
  if length(btrim(coalesce(p_proposal_key,''))) = 0 then raise exception 'proposalKey is required'; end if;
  if length(btrim(coalesce(p_pattern_key,''))) = 0 then raise exception 'patternKey is required'; end if;
  if length(btrim(coalesce(p_title,''))) = 0 then raise exception 'title is required'; end if;
  if length(btrim(coalesce(p_summary,''))) = 0 then raise exception 'summary is required'; end if;
  if p_source_candidate_ids is null or cardinality(p_source_candidate_ids) < 2 then
    raise exception 'cross-agent learning requires at least two source candidates';
  end if;

  select array_agg(distinct candidate_id order by candidate_id)
  into v_candidate_ids
  from unnest(p_source_candidate_ids) candidate_id;

  if cardinality(v_candidate_ids) < 2 then
    raise exception 'cross-agent learning requires at least two distinct source candidates';
  end if;

  select
    array_agg(distinct lc.id order by lc.id),
    array_agg(distinct lc.agent_key order by lc.agent_key),
    array_agg(distinct lc.skill_key order by lc.skill_key),
    array_agg(distinct plc.reusable_lesson order by plc.reusable_lesson),
    count(*) filter (
      where regexp_replace(plc.use_case_key, '^[^:]+:[^:]+:', '') <> btrim(p_pattern_key)
    )
  into
    v_valid_candidate_ids,
    v_agent_keys,
    v_skill_keys,
    v_lessons,
    v_mismatched_patterns
  from agent.learning_candidates lc
  join agent.positive_learning_cases plc
    on plc.candidate_id = lc.id
   and plc.project_id = lc.project_id
  where lc.project_id = p_project_id
    and lc.id = any(v_candidate_ids)
    and lc.candidate_type = 'POSITIVE_CASE'
    and plc.review_status = 'APPROVED'
    and plc.production_eligible = true
    and plc.learning_provenance_recorded_at is not null;

  if v_valid_candidate_ids is distinct from v_candidate_ids then
    raise exception 'cross-agent learning source cases must all be same-project approved production-eligible positive cases';
  end if;
  if cardinality(v_agent_keys) < 2 then
    raise exception 'cross-agent learning requires evidence from at least two distinct governed agents';
  end if;
  if coalesce(v_mismatched_patterns, 0) > 0 then
    raise exception 'cross-agent learning source cases do not share the governed pattern key';
  end if;

  v_expected_key := 'cross-agent:' || btrim(p_pattern_key) || ':' || array_to_string(v_candidate_ids, ',');
  if btrim(p_proposal_key) <> v_expected_key then
    raise exception 'cross-agent learning proposal key does not match canonical source evidence';
  end if;

  select * into v_existing
  from agent.cross_agent_learning_patterns p
  where p.project_id = p_project_id
    and p.proposal_key = v_expected_key;

  if found then
    if v_existing.pattern_key <> btrim(p_pattern_key)
      or v_existing.source_candidate_ids <> v_candidate_ids
      or v_existing.source_agent_keys <> v_agent_keys
      or v_existing.source_skill_keys <> v_skill_keys
      or v_existing.reusable_lessons <> v_lessons
    then
      raise exception 'cross-agent proposal key reuse does not match immutable source evidence';
    end if;
    return v_existing.id;
  end if;

  insert into agent.cross_agent_learning_patterns(
    project_id,
    proposal_key,
    pattern_key,
    title,
    summary,
    source_candidate_ids,
    source_agent_keys,
    source_skill_keys,
    reusable_lessons,
    review_status,
    requires_data_governance_admin_review,
    may_auto_promote,
    may_authorize_action,
    may_modify_agents,
    may_expand_authority,
    current_policy_reevaluation_required,
    created_by
  ) values (
    p_project_id,
    v_expected_key,
    btrim(p_pattern_key),
    btrim(p_title),
    btrim(p_summary),
    v_candidate_ids,
    v_agent_keys,
    v_skill_keys,
    v_lessons,
    'PENDING_REVIEW',
    true,
    false,
    false,
    false,
    false,
    true,
    p_actor_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function agent.review_cross_agent_learning_pattern(
  p_project_id uuid,
  p_pattern_id uuid,
  p_decision text,
  p_reason text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_pattern agent.cross_agent_learning_patterns%rowtype;
  v_target_status text;
begin
  if p_project_id is null or p_pattern_id is null or p_actor_user_id is null then
    raise exception 'project, pattern and actor are required';
  end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'review reason is required'; end if;
  if p_decision not in ('APPROVE_PATTERN','REJECT','DEFER','RETIRE') then
    raise exception 'unsupported cross-agent learning review decision';
  end if;

  if not exists (
    select 1
    from governance.project_role_bindings b
    where b.project_id = p_project_id
      and b.user_id = p_actor_user_id
      and b.role_key = 'DATA_GOVERNANCE_ADMIN'
      and b.active = true
      and (b.expires_at is null or b.expires_at > statement_timestamp())
  ) then
    raise exception 'Data Governance Admin authority is required to review a cross-agent learning pattern';
  end if;

  select * into v_pattern
  from agent.cross_agent_learning_patterns p
  where p.id = p_pattern_id
    and p.project_id = p_project_id
  for update;

  if not found then raise exception 'cross-agent learning pattern not found in project'; end if;

  if p_decision = 'RETIRE' then
    if v_pattern.review_status <> 'APPROVED' then
      raise exception 'only APPROVED cross-agent learning patterns may be retired';
    end if;
    v_target_status := 'RETIRED';
  else
    if v_pattern.review_status not in ('PENDING_REVIEW','DEFERRED') then
      raise exception 'cross-agent learning pattern is not reviewable';
    end if;
    v_target_status := case p_decision
      when 'APPROVE_PATTERN' then 'APPROVED'
      when 'REJECT' then 'REJECTED'
      when 'DEFER' then 'DEFERRED'
    end;
  end if;

  update agent.cross_agent_learning_patterns
  set review_status = v_target_status,
      reviewed_by = p_actor_user_id,
      reviewed_at = now(),
      review_reason = btrim(p_reason),
      updated_at = now()
  where id = p_pattern_id
    and project_id = p_project_id;

  insert into agent.cross_agent_learning_pattern_reviews(
    project_id, pattern_id, decision, reason, actor_user_id
  ) values (
    p_project_id, p_pattern_id, p_decision, btrim(p_reason), p_actor_user_id
  );

  return p_pattern_id;
end;
$$;

revoke all on function agent.create_cross_agent_learning_pattern(
  uuid,text,text,text,text,uuid[],uuid
) from public, anon, authenticated;
grant execute on function agent.create_cross_agent_learning_pattern(
  uuid,text,text,text,text,uuid[],uuid
) to service_role;

revoke all on function agent.review_cross_agent_learning_pattern(
  uuid,uuid,text,text,uuid
) from public, anon, authenticated;
grant execute on function agent.review_cross_agent_learning_pattern(
  uuid,uuid,text,text,uuid
) to service_role;

comment on table agent.cross_agent_learning_patterns is
  'Central Learning Platform proposals derived from independently approved positive cases across multiple governed agents. Approved patterns are context only and never action authority.';
