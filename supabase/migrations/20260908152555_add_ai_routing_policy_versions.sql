create table if not exists governance.ai_routing_policy_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  task text not null,
  sensitivity text not null,
  risk text not null,
  enabled boolean not null default true,
  allowed_ai_system_ids uuid[] not null default '{}'::uuid[],
  min_evaluation_score numeric,
  min_scored_count integer not null default 0,
  allow_environment_fallback boolean not null default false,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_capability text not null default 'policy.approve',
  review_note text not null,
  created_at timestamptz not null default now(),
  check (task in ('profiling_investigation','governance_reasoning','incident_investigation','general')),
  check (sensitivity in ('ANY','PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  check (risk in ('ANY','LOW','MEDIUM','HIGH','CRITICAL')),
  check (min_evaluation_score is null or (min_evaluation_score >= 0 and min_evaluation_score <= 1)),
  check (min_scored_count >= 0),
  check (length(btrim(review_note)) > 0)
);

create index if not exists ai_routing_policy_versions_project_scope_idx
  on governance.ai_routing_policy_versions(project_id,task,sensitivity,risk,created_at desc,id);
create index if not exists ai_routing_policy_versions_reviewer_idx
  on governance.ai_routing_policy_versions(reviewer_user_id);

alter table governance.ai_routing_policy_versions enable row level security;

drop policy if exists ai_routing_policy_versions_read on governance.ai_routing_policy_versions;
create policy ai_routing_policy_versions_read on governance.ai_routing_policy_versions
for select to authenticated using(app_private.is_project_member(project_id));

revoke all on governance.ai_routing_policy_versions from public,anon,authenticated,service_role;
grant select on governance.ai_routing_policy_versions to authenticated,service_role;
grant insert on governance.ai_routing_policy_versions to service_role;

create or replace function governance.ai_routing_policy_immutable()
returns trigger language plpgsql
set search_path='pg_catalog','governance' as $$
begin
  raise exception 'AI routing policy evidence is append-only';
end;
$$;
revoke all on function governance.ai_routing_policy_immutable() from public,anon,authenticated,service_role;

drop trigger if exists ai_routing_policy_versions_immutable on governance.ai_routing_policy_versions;
create trigger ai_routing_policy_versions_immutable
before update or delete on governance.ai_routing_policy_versions
for each row execute function governance.ai_routing_policy_immutable();

create or replace function governance.publish_ai_routing_policy(
  p_project_id uuid,
  p_reviewer uuid,
  p_task text,
  p_sensitivity text,
  p_risk text,
  p_enabled boolean,
  p_allowed_ai_system_ids uuid[],
  p_min_evaluation_score numeric,
  p_min_scored_count integer,
  p_allow_environment_fallback boolean,
  p_review_note text
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance' as $$
declare
  v_id uuid := gen_random_uuid();
  v_task text := lower(btrim(coalesce(p_task,'')));
  v_sensitivity text := upper(btrim(coalesce(p_sensitivity,'')));
  v_risk text := upper(btrim(coalesce(p_risk,'')));
  v_allowed uuid[] := coalesce(p_allowed_ai_system_ids,'{}'::uuid[]);
begin
  if v_task not in ('profiling_investigation','governance_reasoning','incident_investigation','general') then raise exception 'Unsupported routing task'; end if;
  if v_sensitivity not in ('ANY','PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED') then raise exception 'Unsupported routing sensitivity'; end if;
  if v_risk not in ('ANY','LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'Unsupported routing risk'; end if;
  if p_min_evaluation_score is not null and (p_min_evaluation_score < 0 or p_min_evaluation_score > 1) then raise exception 'Evaluation score threshold must be between 0 and 1'; end if;
  if coalesce(p_min_scored_count,0) < 0 then raise exception 'Scored-count threshold must be non-negative'; end if;
  if nullif(btrim(coalesce(p_review_note,'')),'') is null then raise exception 'Human review note is required'; end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'policy.approve') then raise exception 'Reviewer lacks policy.approve'; end if;
  if exists (
    select 1 from unnest(v_allowed) x(id)
    where not exists(select 1 from governance.ai_systems s where s.id=x.id and s.project_id=p_project_id)
  ) then raise exception 'Routing allowlist contains an AI system outside the project'; end if;

  insert into governance.ai_routing_policy_versions(
    id,project_id,task,sensitivity,risk,enabled,allowed_ai_system_ids,
    min_evaluation_score,min_scored_count,allow_environment_fallback,
    reviewer_user_id,reviewer_capability,review_note
  ) values(
    v_id,p_project_id,v_task,v_sensitivity,v_risk,coalesce(p_enabled,true),v_allowed,
    p_min_evaluation_score,coalesce(p_min_scored_count,0),coalesce(p_allow_environment_fallback,false),
    p_reviewer,'policy.approve',btrim(p_review_note)
  );

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_reviewer,'USER','AI_ROUTING_POLICY_PUBLISHED','AI_ROUTING_POLICY_VERSION',v_id,
    jsonb_build_object(
      'task',v_task,'sensitivity',v_sensitivity,'risk',v_risk,'enabled',coalesce(p_enabled,true),
      'allowed_ai_system_count',cardinality(v_allowed),'min_evaluation_score',p_min_evaluation_score,
      'min_scored_count',coalesce(p_min_scored_count,0),'allow_environment_fallback',coalesce(p_allow_environment_fallback,false),
      'required_capability','policy.approve'
    ));
  return v_id;
end;
$$;
revoke all on function governance.publish_ai_routing_policy(uuid,uuid,text,text,text,boolean,uuid[],numeric,integer,boolean,text) from public,anon,authenticated;
grant execute on function governance.publish_ai_routing_policy(uuid,uuid,text,text,text,boolean,uuid[],numeric,integer,boolean,text) to service_role;

create or replace function governance.resolve_ai_routing_policy(
  p_project_id uuid,
  p_task text,
  p_sensitivity text,
  p_risk text
)
returns setof governance.ai_routing_policy_versions
language sql security invoker
set search_path='pg_catalog','governance' as $$
  select p.*
  from governance.ai_routing_policy_versions p
  where p.project_id=p_project_id
    and p.task=lower(btrim(p_task))
    and p.sensitivity in (upper(btrim(coalesce(p_sensitivity,'ANY'))),'ANY')
    and p.risk in (upper(btrim(coalesce(p_risk,'ANY'))),'ANY')
  order by
    (p.sensitivity <> 'ANY') desc,
    (p.risk <> 'ANY') desc,
    p.created_at desc,
    p.id desc
  limit 1;
$$;
revoke all on function governance.resolve_ai_routing_policy(uuid,text,text,text) from public,anon,authenticated;
grant execute on function governance.resolve_ai_routing_policy(uuid,text,text,text) to service_role;