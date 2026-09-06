-- Module 14: autonomous governance agents. Pin exact policy semantics, preserve action evidence, and enforce approval in the database.

alter table governance.autonomy_policies
  add column if not exists authority_status text not null default 'SYSTEM_BASELINE',
  add column if not exists reviewed_by uuid references auth.users(id) on delete restrict,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$ begin
  alter table governance.autonomy_policies add constraint autonomy_policies_authority_status_check check(authority_status in ('SYSTEM_BASELINE','APPROVED'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table governance.autonomy_policies add constraint autonomy_policies_approved_review_check check(authority_status<>'APPROVED' or (reviewed_by is not null and reviewed_at is not null and nullif(btrim(coalesce(review_note,'')),'') is not null));
exception when duplicate_object then null; end $$;

create table if not exists governance.autonomy_policy_versions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references app.projects(id) on delete restrict,
  policy_id uuid not null references governance.autonomy_policies(id) on delete restrict, version_number integer not null,
  semantic_hash text not null, snapshot jsonb not null, provenance text not null, created_at timestamptz not null default now(),
  unique(policy_id,version_number), unique(policy_id,semantic_hash)
);
alter table governance.autonomy_policy_versions enable row level security;
drop policy if exists autonomy_policy_versions_read on governance.autonomy_policy_versions;
create policy autonomy_policy_versions_read on governance.autonomy_policy_versions for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.autonomy_policy_versions from public,anon,authenticated,service_role;
grant select on governance.autonomy_policy_versions to authenticated,service_role;

alter table governance.autonomy_policies add column if not exists current_version_id uuid;
do $$ begin
  alter table governance.autonomy_policies add constraint autonomy_policies_current_version_id_fkey foreign key(current_version_id) references governance.autonomy_policy_versions(id) on delete restrict;
exception when duplicate_object then null; end $$;

create or replace function governance.autonomy_policy_snapshot(p governance.autonomy_policies)
returns jsonb language sql immutable set search_path='pg_catalog' as $$
  select jsonb_build_object('action_key',p.action_key,'enabled',p.enabled,'execution_mode',p.execution_mode,'min_confidence',p.min_confidence,
    'max_auto_risk_level',p.max_auto_risk_level,'reversible',p.reversible,'rollback_strategy',p.rollback_strategy,
    'allowed_target_types',p.allowed_target_types,'metadata',p.metadata,'authority_status',p.authority_status,
    'reviewed_by',p.reviewed_by,'reviewed_at',p.reviewed_at,'review_note',p.review_note);
$$;
revoke all on function governance.autonomy_policy_snapshot(governance.autonomy_policies) from public,anon,authenticated;
grant execute on function governance.autonomy_policy_snapshot(governance.autonomy_policies) to service_role;

create or replace function governance.capture_autonomy_policy_version(p_policy_id uuid,p_provenance text default 'CAPTURED')
returns uuid language plpgsql security definer set search_path='pg_catalog','governance','extensions' as $$
declare v_policy governance.autonomy_policies%rowtype; v_snapshot jsonb; v_hash text; v_id uuid; v_number integer;
begin
  select * into v_policy from governance.autonomy_policies where id=p_policy_id for update;
  if not found then raise exception 'Autonomy policy not found'; end if;
  v_snapshot:=governance.autonomy_policy_snapshot(v_policy);
  v_hash:=encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  select id into v_id from governance.autonomy_policy_versions where policy_id=p_policy_id and semantic_hash=v_hash;
  if v_id is null then
    select coalesce(max(version_number),0)+1 into v_number from governance.autonomy_policy_versions where policy_id=p_policy_id;
    insert into governance.autonomy_policy_versions(project_id,policy_id,version_number,semantic_hash,snapshot,provenance)
    values(v_policy.project_id,p_policy_id,v_number,v_hash,v_snapshot,coalesce(nullif(btrim(p_provenance),''),'CAPTURED')) returning id into v_id;
  end if;
  update governance.autonomy_policies set current_version_id=v_id where id=p_policy_id and current_version_id is distinct from v_id;
  return v_id;
end;
$$;
revoke all on function governance.capture_autonomy_policy_version(uuid,text) from public,anon,authenticated;
grant execute on function governance.capture_autonomy_policy_version(uuid,text) to service_role;

create or replace function governance.on_autonomy_policy_semantic_change()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
begin perform governance.capture_autonomy_policy_version(new.id,case when tg_op='INSERT' then 'CAPTURED_INSERT' else 'CAPTURED_CHANGE' end); return new; end; $$;
revoke all on function governance.on_autonomy_policy_semantic_change() from public,anon,authenticated,service_role;
drop trigger if exists autonomy_policy_semantic_version on governance.autonomy_policies;
create trigger autonomy_policy_semantic_version after insert or update of action_key,enabled,execution_mode,min_confidence,max_auto_risk_level,reversible,rollback_strategy,allowed_target_types,metadata,authority_status,reviewed_by,reviewed_at,review_note
on governance.autonomy_policies for each row execute function governance.on_autonomy_policy_semantic_change();

create or replace function governance.guard_autonomy_policy_safety()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
  if upper(new.action_key) in ('UPDATE_QUALITY_RULE_THRESHOLD','MUTATE_SOURCE_DATA','ALTER_SCHEMA','DELETE_DATA') and (new.enabled or new.execution_mode<>'BLOCKED') then raise exception 'Autonomy policy % is hard-blocked and cannot be enabled',new.action_key; end if;
  if new.execution_mode='AUTO' and coalesce((new.metadata->>'production_source_mutation')::boolean,false) then raise exception 'AUTO autonomy policy cannot authorize production source mutation'; end if;
  if new.authority_status='APPROVED' and (new.reviewed_by is null or new.reviewed_at is null or nullif(btrim(coalesce(new.review_note,'')),'') is null) then raise exception 'Approved autonomy policy requires human review evidence'; end if;
  return new;
end;
$$;
revoke all on function governance.guard_autonomy_policy_safety() from public,anon,authenticated,service_role;
drop trigger if exists autonomy_policy_safety_guard on governance.autonomy_policies;
create trigger autonomy_policy_safety_guard before insert or update of action_key,enabled,execution_mode,metadata,authority_status,reviewed_by,reviewed_at,review_note
on governance.autonomy_policies for each row execute function governance.guard_autonomy_policy_safety();

do $$ declare p record; begin for p in select id from governance.autonomy_policies loop perform governance.capture_autonomy_policy_version(p.id,'LEGACY_BASELINE_CURRENT_POLICY'); end loop; end $$;

create or replace function governance.configure_autonomy_policy(p_policy_id uuid,p_reviewer uuid,p_enabled boolean,p_execution_mode text,p_min_confidence numeric,p_max_auto_risk_level text,p_reversible boolean,p_rollback_strategy text,p_allowed_target_types text[],p_metadata jsonb,p_review_note text)
returns uuid language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v_project uuid; v_version uuid;
begin
  select project_id into v_project from governance.autonomy_policies where id=p_policy_id;
  if v_project is null then raise exception 'Autonomy policy not found'; end if;
  if not governance.has_project_capability(v_project,p_reviewer,'policy.approve') then raise exception 'Reviewer lacks policy.approve'; end if;
  if nullif(btrim(coalesce(p_review_note,'')),'') is null then raise exception 'Review note is required'; end if;
  update governance.autonomy_policies set enabled=p_enabled,execution_mode=upper(btrim(coalesce(p_execution_mode,''))),min_confidence=p_min_confidence,max_auto_risk_level=upper(btrim(coalesce(p_max_auto_risk_level,''))),reversible=p_reversible,rollback_strategy=p_rollback_strategy,allowed_target_types=coalesce(p_allowed_target_types,'{}'::text[]),metadata=coalesce(p_metadata,'{}'::jsonb),authority_status='APPROVED',reviewed_by=p_reviewer,reviewed_at=now(),review_note=btrim(p_review_note),updated_at=now() where id=p_policy_id;
  select current_version_id into v_version from governance.autonomy_policies where id=p_policy_id;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_project,p_reviewer,'USER','AUTONOMY_POLICY_REVIEWED','AUTONOMY_POLICY',p_policy_id,jsonb_build_object('policy_version_id',v_version,'authority_status','APPROVED'));
  return v_version;
end;
$$;
revoke all on function governance.configure_autonomy_policy(uuid,uuid,boolean,text,numeric,text,boolean,text,text[],jsonb,text) from public,anon,authenticated;
grant execute on function governance.configure_autonomy_policy(uuid,uuid,boolean,text,numeric,text,boolean,text,text[],jsonb,text) to service_role;

alter table governance.autonomy_actions add column if not exists policy_version_id uuid;
do $$ begin alter table governance.autonomy_actions add constraint autonomy_actions_policy_version_id_fkey foreign key(policy_version_id) references governance.autonomy_policy_versions(id) on delete restrict; exception when duplicate_object then null; end $$;
update governance.autonomy_actions a set policy_version_id=p.current_version_id from governance.autonomy_policies p where p.id=a.policy_id and a.policy_version_id is null;
alter table governance.autonomy_actions alter column policy_version_id set not null;

create table if not exists governance.autonomy_action_events (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references app.projects(id) on delete restrict,
 autonomy_action_id uuid not null references governance.autonomy_actions(id) on delete restrict, policy_version_id uuid not null references governance.autonomy_policy_versions(id) on delete restrict,
 event_type text not null, event_source text not null default 'DATABASE_TRIGGER', action_snapshot jsonb not null, evidence_hash text not null, created_at timestamptz not null default now(),
 check(event_type in ('LEGACY_CURRENT_BASELINE','CREATED','UPDATED')), check(event_source='DATABASE_TRIGGER')
);
create index if not exists autonomy_action_events_project_idx on governance.autonomy_action_events(project_id,autonomy_action_id,created_at,id);
alter table governance.autonomy_action_events enable row level security;
drop policy if exists autonomy_action_events_read on governance.autonomy_action_events;
create policy autonomy_action_events_read on governance.autonomy_action_events for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.autonomy_action_events from public,anon,authenticated,service_role;
grant select on governance.autonomy_action_events to authenticated,service_role;

create or replace function governance.autonomy_evidence_immutable() returns trigger language plpgsql set search_path='pg_catalog','governance' as $$ begin raise exception 'Autonomy evidence is append-only'; end; $$;
revoke all on function governance.autonomy_evidence_immutable() from public,anon,authenticated,service_role;
drop trigger if exists autonomy_policy_versions_immutable on governance.autonomy_policy_versions;
create trigger autonomy_policy_versions_immutable before update or delete on governance.autonomy_policy_versions for each row execute function governance.autonomy_evidence_immutable();
drop trigger if exists autonomy_action_events_immutable on governance.autonomy_action_events;
create trigger autonomy_action_events_immutable before update or delete on governance.autonomy_action_events for each row execute function governance.autonomy_evidence_immutable();

insert into governance.autonomy_action_events(project_id,autonomy_action_id,policy_version_id,event_type,action_snapshot,evidence_hash)
select a.project_id,a.id,a.policy_version_id,'LEGACY_CURRENT_BASELINE',(to_jsonb(a)-'updated_at') || jsonb_build_object('history_provenance','LEGACY_CURRENT_STATE_NOT_FULL_HISTORY'),
 encode(extensions.digest(convert_to(jsonb_build_object('action_id',a.id,'project_id',a.project_id,'policy_version_id',a.policy_version_id,'snapshot',(to_jsonb(a)-'updated_at') || jsonb_build_object('history_provenance','LEGACY_CURRENT_STATE_NOT_FULL_HISTORY'))::text,'UTF8'),'sha256'),'hex')
from governance.autonomy_actions a where not exists(select 1 from governance.autonomy_action_events e where e.autonomy_action_id=a.id);

create or replace function governance.autonomy_risk_rank(p text) returns integer language sql immutable set search_path='pg_catalog' as $$ select case upper(coalesce(p,'')) when 'INFO' then 0 when 'LOW' then 1 when 'MEDIUM' then 2 when 'HIGH' then 3 when 'CRITICAL' then 4 else 99 end; $$;
revoke all on function governance.autonomy_risk_rank(text) from public,anon,authenticated;
grant execute on function governance.autonomy_risk_rank(text) to service_role;

create or replace function governance.enforce_autonomy_action_policy()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance','agent' as $$
declare v_policy governance.autonomy_policies%rowtype; v_version governance.autonomy_policy_versions%rowtype; v_workflow governance.workflow_instances%rowtype; v_requires_approval boolean;
begin
 select * into v_policy from governance.autonomy_policies where id=new.policy_id;
 if not found or v_policy.project_id<>new.project_id or v_policy.action_key<>new.action_key then raise exception 'Autonomy action policy mismatch'; end if;
 if tg_op='INSERT' then new.policy_version_id:=v_policy.current_version_id;
 elsif new.policy_version_id is distinct from old.policy_version_id or new.policy_id is distinct from old.policy_id then raise exception 'Autonomy action policy identity/version is immutable after creation'; end if;
 select * into v_version from governance.autonomy_policy_versions where id=new.policy_version_id and policy_id=new.policy_id and project_id=new.project_id;
 if not found then raise exception 'Pinned autonomy policy version is invalid'; end if;
 if new.source_agent_run_id is not null and not exists(select 1 from agent.agent_runs r where r.id=new.source_agent_run_id and r.project_id=new.project_id) then raise exception 'Source agent run is outside action project'; end if;
 if upper(new.action_key) in ('UPDATE_QUALITY_RULE_THRESHOLD','MUTATE_SOURCE_DATA','ALTER_SCHEMA','DELETE_DATA') and new.status not in ('BLOCKED','REJECTED') then raise exception 'Hard-blocked autonomous action cannot execute'; end if;
 if not coalesce((v_version.snapshot->>'enabled')::boolean,false) or v_version.snapshot->>'execution_mode'='BLOCKED' then if new.status not in ('BLOCKED','REJECTED') then raise exception 'Disabled or blocked autonomy policy cannot authorize action status %',new.status; end if; return new; end if;
 if new.status in ('APPROVED','EXECUTING','EXECUTED') and new.confidence < (v_version.snapshot->>'min_confidence')::numeric then raise exception 'Autonomy action confidence is below pinned policy minimum'; end if;
 v_requires_approval := v_version.snapshot->>'execution_mode'='APPROVAL_REQUIRED' or (v_version.snapshot->>'execution_mode'='AUTO' and governance.autonomy_risk_rank(new.risk_level)>governance.autonomy_risk_rank(v_version.snapshot->>'max_auto_risk_level'));
 if new.status in ('APPROVED','EXECUTING','EXECUTED') and v_requires_approval then
   if new.approval_workflow_instance_id is null then raise exception 'Autonomy action requires approved human workflow'; end if;
   select * into v_workflow from governance.workflow_instances where id=new.approval_workflow_instance_id;
   if not found or v_workflow.project_id<>new.project_id or v_workflow.status<>'APPROVED' or upper(v_workflow.entity_type)<>'AUTONOMY_ACTION' or v_workflow.entity_id<>new.id then raise exception 'Approval workflow is not exact approved authority for this autonomy action'; end if;
 end if;
 if tg_op='UPDATE' and old.approval_workflow_instance_id is not null and new.approval_workflow_instance_id is distinct from old.approval_workflow_instance_id then raise exception 'Autonomy action approval workflow evidence is immutable once pinned'; end if;
 return new;
end;
$$;
revoke all on function governance.enforce_autonomy_action_policy() from public,anon,authenticated,service_role;
drop trigger if exists autonomy_action_policy_guard on governance.autonomy_actions;
create trigger autonomy_action_policy_guard before insert or update of policy_id,policy_version_id,source_agent_run_id,status,confidence,risk_level,approval_workflow_instance_id on governance.autonomy_actions for each row execute function governance.enforce_autonomy_action_policy();

create or replace function governance.capture_autonomy_action_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance','extensions' as $$
declare v_snapshot jsonb; v_hash text;
begin v_snapshot:=to_jsonb(new)-'updated_at'; v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('action_id',new.id,'project_id',new.project_id,'policy_version_id',new.policy_version_id,'snapshot',v_snapshot)::text,'UTF8'),'sha256'),'hex');
 insert into governance.autonomy_action_events(project_id,autonomy_action_id,policy_version_id,event_type,action_snapshot,evidence_hash) values(new.project_id,new.id,new.policy_version_id,case when tg_op='INSERT' then 'CREATED' else 'UPDATED' end,v_snapshot,v_hash); return new; end;
$$;
revoke all on function governance.capture_autonomy_action_event() from public,anon,authenticated,service_role;
drop trigger if exists autonomy_action_history on governance.autonomy_actions;
create trigger autonomy_action_history after insert or update of status,result,rollback,error_message,executed_at,rolled_back_at,approval_workflow_instance_id on governance.autonomy_actions for each row execute function governance.capture_autonomy_action_event();

do $$ begin alter table governance.autonomy_actions drop constraint autonomy_actions_source_agent_run_id_fkey; exception when undefined_object then null; end $$;
alter table governance.autonomy_actions add constraint autonomy_actions_source_agent_run_id_fkey foreign key(source_agent_run_id) references agent.agent_runs(id) on delete restrict;
do $$ begin alter table governance.autonomy_actions drop constraint autonomy_actions_requested_by_fkey; exception when undefined_object then null; end $$;
alter table governance.autonomy_actions add constraint autonomy_actions_requested_by_fkey foreign key(requested_by) references auth.users(id) on delete restrict;
do $$ begin alter table governance.autonomy_actions drop constraint autonomy_actions_approval_workflow_instance_id_fkey; exception when undefined_object then null; end $$;
alter table governance.autonomy_actions add constraint autonomy_actions_approval_workflow_instance_id_fkey foreign key(approval_workflow_instance_id) references governance.workflow_instances(id) on delete restrict;

revoke insert,update,delete,truncate on governance.autonomy_policies from service_role;
grant select on governance.autonomy_policies to service_role;
revoke delete,truncate on governance.autonomy_actions from service_role;

create or replace function governance.verify_autonomous_agent_posture()
returns jsonb language sql stable security definer set search_path='pg_catalog','governance','extensions' as $$
with p as (select count(*) policies,count(*) filter(where current_version_id is null) unversioned,count(*) filter(where upper(action_key) in ('UPDATE_QUALITY_RULE_THRESHOLD','MUTATE_SOURCE_DATA','ALTER_SCHEMA','DELETE_DATA') and (enabled or execution_mode<>'BLOCKED')) hard_block_violations,count(*) filter(where execution_mode='AUTO' and coalesce((metadata->>'production_source_mutation')::boolean,false)) source_mutation_violations from governance.autonomy_policies),
a as (select count(*) actions,count(*) filter(where x.policy_version_id is null) unpinned,count(*) filter(where not exists(select 1 from governance.autonomy_action_events e where e.autonomy_action_id=x.id)) missing_history,
 count(*) filter(where x.status in ('APPROVED','EXECUTING','EXECUTED') and v.snapshot->>'execution_mode'='APPROVAL_REQUIRED' and not exists(select 1 from governance.workflow_instances w where w.id=x.approval_workflow_instance_id and w.project_id=x.project_id and w.status='APPROVED' and upper(w.entity_type)='AUTONOMY_ACTION' and w.entity_id=x.id)) approval_violations,
 count(*) filter(where x.status in ('APPROVED','EXECUTING','EXECUTED') and v.snapshot->>'execution_mode'='AUTO' and governance.autonomy_risk_rank(x.risk_level)>governance.autonomy_risk_rank(v.snapshot->>'max_auto_risk_level') and not exists(select 1 from governance.workflow_instances w where w.id=x.approval_workflow_instance_id and w.project_id=x.project_id and w.status='APPROVED' and upper(w.entity_type)='AUTONOMY_ACTION' and w.entity_id=x.id)) risk_escalation_violations
 from governance.autonomy_actions x join governance.autonomy_policy_versions v on v.id=x.policy_version_id),
h as (select count(*) events,count(*) filter(where evidence_hash is distinct from encode(extensions.digest(convert_to(jsonb_build_object('action_id',autonomy_action_id,'project_id',project_id,'policy_version_id',policy_version_id,'snapshot',action_snapshot)::text,'UTF8'),'sha256'),'hex')) invalid_hashes,count(*) filter(where event_type='LEGACY_CURRENT_BASELINE') legacy_baselines from governance.autonomy_action_events),
t as (select exists(select 1 from pg_trigger where tgname='autonomy_policy_versions_immutable' and not tgisinternal and tgenabled<>'D') version_immutable,exists(select 1 from pg_trigger where tgname='autonomy_action_events_immutable' and not tgisinternal and tgenabled<>'D') history_immutable,exists(select 1 from pg_trigger where tgname='autonomy_action_policy_guard' and not tgisinternal and tgenabled<>'D') action_guard),
g as (select has_table_privilege('authenticated','governance.autonomy_actions','INSERT') or has_table_privilege('anon','governance.autonomy_actions','INSERT') browser_action_write,has_table_privilege('service_role','governance.autonomy_policies','UPDATE') or has_table_privilege('service_role','governance.autonomy_policies','INSERT') direct_service_policy_write)
select jsonb_build_object('valid',p.unversioned=0 and p.hard_block_violations=0 and p.source_mutation_violations=0 and a.unpinned=0 and a.missing_history=0 and a.approval_violations=0 and a.risk_escalation_violations=0 and h.invalid_hashes=0 and t.version_immutable and t.history_immutable and t.action_guard and not g.browser_action_write and not g.direct_service_policy_write,
 'policies',p.policies,'actions',a.actions,'history_events',h.events,'legacy_current_baselines',h.legacy_baselines,'unversioned_policies',p.unversioned,'unpinned_actions',a.unpinned,'missing_action_history',a.missing_history,'hard_block_violations',p.hard_block_violations,'source_mutation_violations',p.source_mutation_violations,'approval_violations',a.approval_violations,'risk_escalation_violations',a.risk_escalation_violations,'invalid_history_hashes',h.invalid_hashes,'policy_versions_append_only',t.version_immutable,'action_history_append_only',t.history_immutable,'action_policy_guard',t.action_guard,'browser_action_write',g.browser_action_write,'direct_service_policy_write',g.direct_service_policy_write,'legacy_history_semantics','LEGACY_CURRENT_STATE_NOT_FULL_HISTORY','approval_semantics','EXACT_APPROVED_AUTONOMY_ACTION_WORKFLOW_REQUIRED') from p cross join a cross join h cross join t cross join g;
$$;
revoke all on function governance.verify_autonomous_agent_posture() from public,anon,authenticated;
grant execute on function governance.verify_autonomous_agent_posture() to service_role;
