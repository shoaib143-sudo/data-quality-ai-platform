-- Module 12: AI-assisted governance. AI proposals are immutable evidence and never become governance authority by themselves.

create table if not exists governance.ai_governance_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  source_artifact_id uuid references agent.agent_artifacts(id) on delete restrict,
  suggestion_type text not null,
  subject_type text not null,
  subject_id uuid,
  target_locator text,
  suggestion jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  confidence numeric,
  expires_at timestamptz,
  content_hash text not null,
  created_at timestamptz not null default now(),
  check (suggestion_type in ('CLASSIFICATION','QUALITY_RULE','GLOSSARY','OWNERSHIP','POLICY_CONTROL','CONTRACT','WORKFLOW','OTHER')),
  check (length(btrim(subject_type)) > 0),
  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  unique(project_id, source_agent_run_id, content_hash)
);

create table if not exists governance.ai_governance_suggestion_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  suggestion_id uuid not null references governance.ai_governance_suggestions(id) on delete restrict,
  decision text not null,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_capability text not null,
  review_note text not null,
  created_at timestamptz not null default now(),
  check (decision in ('ACCEPTED','REJECTED')),
  check (length(btrim(review_note)) > 0),
  unique(suggestion_id)
);

create index if not exists ai_governance_suggestions_project_created_idx
  on governance.ai_governance_suggestions(project_id, created_at desc, id);
create index if not exists ai_governance_suggestion_decisions_project_created_idx
  on governance.ai_governance_suggestion_decisions(project_id, created_at desc, id);

alter table governance.ai_governance_suggestions enable row level security;
alter table governance.ai_governance_suggestion_decisions enable row level security;

drop policy if exists ai_governance_suggestions_read on governance.ai_governance_suggestions;
create policy ai_governance_suggestions_read on governance.ai_governance_suggestions
  for select to authenticated using(app_private.is_project_member(project_id));
drop policy if exists ai_governance_suggestion_decisions_read on governance.ai_governance_suggestion_decisions;
create policy ai_governance_suggestion_decisions_read on governance.ai_governance_suggestion_decisions
  for select to authenticated using(app_private.is_project_member(project_id));

revoke all on governance.ai_governance_suggestions from public,anon,authenticated,service_role;
revoke all on governance.ai_governance_suggestion_decisions from public,anon,authenticated,service_role;
grant select on governance.ai_governance_suggestions, governance.ai_governance_suggestion_decisions to authenticated,service_role;

create or replace function governance.ai_governance_evidence_immutable()
returns trigger language plpgsql
set search_path='pg_catalog','governance' as $$
begin
  raise exception 'AI governance suggestion evidence is append-only';
end;
$$;
revoke all on function governance.ai_governance_evidence_immutable() from public,anon,authenticated,service_role;

drop trigger if exists ai_governance_suggestions_immutable on governance.ai_governance_suggestions;
create trigger ai_governance_suggestions_immutable
before update or delete on governance.ai_governance_suggestions
for each row execute function governance.ai_governance_evidence_immutable();
drop trigger if exists ai_governance_suggestion_decisions_immutable on governance.ai_governance_suggestion_decisions;
create trigger ai_governance_suggestion_decisions_immutable
before update or delete on governance.ai_governance_suggestion_decisions
for each row execute function governance.ai_governance_evidence_immutable();

create or replace function governance.ai_suggestion_review_capability(p_suggestion_type text)
returns text language sql immutable
set search_path='pg_catalog' as $$
  select case upper(p_suggestion_type)
    when 'CLASSIFICATION' then 'classification.review'
    when 'QUALITY_RULE' then 'quality.manage'
    when 'GLOSSARY' then 'glossary.manage'
    when 'OWNERSHIP' then 'stewardship.manage'
    when 'POLICY_CONTROL' then 'policy.approve'
    when 'CONTRACT' then 'contract.approve'
    when 'WORKFLOW' then 'workflow.manage'
    else 'catalog.update'
  end;
$$;
revoke all on function governance.ai_suggestion_review_capability(text) from public,anon,authenticated;
grant execute on function governance.ai_suggestion_review_capability(text) to service_role;

create or replace function governance.record_ai_governance_suggestion(
  p_project_id uuid,
  p_source_agent_run_id uuid,
  p_suggestion_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_target_locator text,
  p_suggestion jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_confidence numeric default null,
  p_source_artifact_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance','agent','extensions' as $$
declare
  v_id uuid := gen_random_uuid();
  v_type text := upper(btrim(coalesce(p_suggestion_type,'')));
  v_hash text;
begin
  if v_type not in ('CLASSIFICATION','QUALITY_RULE','GLOSSARY','OWNERSHIP','POLICY_CONTROL','CONTRACT','WORKFLOW','OTHER') then
    raise exception 'Unsupported AI governance suggestion type';
  end if;
  if not exists(select 1 from agent.agent_runs r where r.id=p_source_agent_run_id and r.project_id=p_project_id) then
    raise exception 'Source agent run is outside project scope';
  end if;
  if p_source_artifact_id is not null and not exists(
    select 1 from agent.agent_artifacts a where a.id=p_source_artifact_id and a.agent_run_id=p_source_agent_run_id
  ) then raise exception 'Source artifact is not part of source agent run'; end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then raise exception 'Confidence must be between 0 and 1'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Suggestion expiry must be in the future'; end if;
  if p_suggestion is null or p_suggestion='null'::jsonb then raise exception 'Suggestion payload is required'; end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'project_id',p_project_id,'source_agent_run_id',p_source_agent_run_id,'source_artifact_id',p_source_artifact_id,
    'suggestion_type',v_type,'subject_type',btrim(p_subject_type),'subject_id',p_subject_id,'target_locator',p_target_locator,
    'suggestion',p_suggestion,'evidence',coalesce(p_evidence,'{}'::jsonb),'confidence',p_confidence,'expires_at',p_expires_at
  )::text,'UTF8'),'sha256'),'hex');

  insert into governance.ai_governance_suggestions(
    id,project_id,source_agent_run_id,source_artifact_id,suggestion_type,subject_type,subject_id,target_locator,
    suggestion,evidence,confidence,expires_at,content_hash
  ) values(
    v_id,p_project_id,p_source_agent_run_id,p_source_artifact_id,v_type,btrim(p_subject_type),p_subject_id,p_target_locator,
    p_suggestion,coalesce(p_evidence,'{}'::jsonb),p_confidence,p_expires_at,v_hash
  )
  on conflict(project_id,source_agent_run_id,content_hash) do update set content_hash=excluded.content_hash
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function governance.record_ai_governance_suggestion(uuid,uuid,text,text,uuid,text,jsonb,jsonb,numeric,uuid,timestamptz) from public,anon,authenticated;
grant execute on function governance.record_ai_governance_suggestion(uuid,uuid,text,text,uuid,text,jsonb,jsonb,numeric,uuid,timestamptz) to service_role;

create or replace function governance.review_ai_governance_suggestion(
  p_suggestion_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_review_note text
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance' as $$
declare
  v_s governance.ai_governance_suggestions%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_capability text;
  v_id uuid := gen_random_uuid();
begin
  select * into v_s from governance.ai_governance_suggestions where id=p_suggestion_id;
  if not found then raise exception 'AI governance suggestion not found'; end if;
  if v_s.expires_at is not null and v_s.expires_at <= now() then raise exception 'Expired AI governance suggestion cannot be reviewed'; end if;
  if v_decision not in ('ACCEPTED','REJECTED') then raise exception 'Decision must be ACCEPTED or REJECTED'; end if;
  if nullif(btrim(coalesce(p_review_note,'')),'') is null then raise exception 'Human review note is required'; end if;
  v_capability := governance.ai_suggestion_review_capability(v_s.suggestion_type);
  if not governance.has_project_capability(v_s.project_id,p_reviewer,v_capability) then
    raise exception 'Reviewer lacks required capability %',v_capability;
  end if;

  insert into governance.ai_governance_suggestion_decisions(
    id,project_id,suggestion_id,decision,reviewer_user_id,reviewer_capability,review_note
  ) values(v_id,v_s.project_id,v_s.id,v_decision,p_reviewer,v_capability,btrim(p_review_note));

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_s.project_id,p_reviewer,'USER','AI_GOVERNANCE_SUGGESTION_REVIEWED','AI_GOVERNANCE_SUGGESTION',v_s.id,
    jsonb_build_object('decision',v_decision,'required_capability',v_capability,'authority_effect','REVIEW_ACCEPTED_ONLY_NO_AUTOMATIC_GOVERNANCE_MUTATION'));
  return v_id;
end;
$$;
revoke all on function governance.review_ai_governance_suggestion(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function governance.review_ai_governance_suggestion(uuid,uuid,text,text) to service_role;

create or replace view governance.ai_governance_suggestion_effective
with (security_invoker=true) as
select s.*,
  case when d.decision is not null then d.decision when s.expires_at is not null and s.expires_at<=now() then 'EXPIRED' else 'SUGGESTED' end as review_status,
  d.reviewer_user_id,d.reviewer_capability,d.review_note,d.created_at as reviewed_at,
  'NO_AUTOMATIC_GOVERNANCE_MUTATION'::text as authority_effect
from governance.ai_governance_suggestions s
left join governance.ai_governance_suggestion_decisions d on d.suggestion_id=s.id;
grant select on governance.ai_governance_suggestion_effective to authenticated,service_role;

-- Browser roles may read governed agent evidence through RLS, but cannot manufacture run or artifact evidence.
revoke insert,update,delete on agent.agent_runs from anon,authenticated;
revoke insert,update,delete on agent.agent_artifacts from anon,authenticated;
revoke insert,update,delete on agent.agent_messages from anon,authenticated;

create or replace function governance.verify_ai_assisted_governance_posture()
returns jsonb language sql stable security definer
set search_path='pg_catalog','governance' as $$
with integrity as (
  select
    count(*) filter(where not exists(select 1 from agent.agent_runs r where r.id=s.source_agent_run_id and r.project_id=s.project_id)) as invalid_source_runs,
    count(*) as suggestion_count
  from governance.ai_governance_suggestions s
), decisions as (
  select count(*) filter(where reviewer_user_id is null or reviewer_capability is null or decision not in ('ACCEPTED','REJECTED')) as invalid_decisions,
         count(*) as decision_count
  from governance.ai_governance_suggestion_decisions
), triggers as (
  select
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='ai_governance_suggestions' and t.tgname='ai_governance_suggestions_immutable' and not t.tgisinternal and t.tgenabled<>'D') as suggestion_immutable,
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='ai_governance_suggestion_decisions' and t.tgname='ai_governance_suggestion_decisions_immutable' and not t.tgisinternal and t.tgenabled<>'D') as decision_immutable
), grants as (
  select
    has_table_privilege('anon','governance.ai_governance_suggestions','INSERT') or has_table_privilege('anon','governance.ai_governance_suggestions','UPDATE') or has_table_privilege('anon','governance.ai_governance_suggestions','DELETE')
      or has_table_privilege('authenticated','governance.ai_governance_suggestions','INSERT') or has_table_privilege('authenticated','governance.ai_governance_suggestions','UPDATE') or has_table_privilege('authenticated','governance.ai_governance_suggestions','DELETE') as suggestion_browser_write,
    has_table_privilege('anon','governance.ai_governance_suggestion_decisions','INSERT') or has_table_privilege('authenticated','governance.ai_governance_suggestion_decisions','INSERT') as decision_browser_write
)
select jsonb_build_object(
  'valid',i.invalid_source_runs=0 and d.invalid_decisions=0 and t.suggestion_immutable and t.decision_immutable and not g.suggestion_browser_write and not g.decision_browser_write,
  'suggestions',i.suggestion_count,'human_decisions',d.decision_count,'invalid_source_runs',i.invalid_source_runs,'invalid_decisions',d.invalid_decisions,
  'suggestion_append_only',t.suggestion_immutable,'decision_append_only',t.decision_immutable,
  'browser_suggestion_write',g.suggestion_browser_write,'browser_decision_write',g.decision_browser_write,
  'authority_semantics','AI_SUGGESTION_SEPARATE_FROM_HUMAN_GOVERNANCE_AUTHORITY',
  'accepted_suggestion_effect','NO_AUTOMATIC_GOVERNANCE_MUTATION'
) from integrity i cross join decisions d cross join triggers t cross join grants g;
$$;
revoke all on function governance.verify_ai_assisted_governance_posture() from public,anon,authenticated;
grant execute on function governance.verify_ai_assisted_governance_posture() to service_role;
