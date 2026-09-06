-- Wave 3: governed workflow/remediation and data-contract/change-governance history.

-- Workflow instances pin the exact definition semantics used at start time.
alter table governance.workflow_instances
  add column if not exists definition_version integer,
  add column if not exists definition_snapshot jsonb;

update governance.workflow_instances i
set definition_version=d.version,
    definition_snapshot=jsonb_build_object(
      'workflow_key',d.workflow_key,'name',d.name,'entity_type',d.entity_type,'version',d.version,'steps',d.steps
    )
from governance.workflow_definitions d
where d.id=i.workflow_definition_id
  and (i.definition_version is null or i.definition_snapshot is null);

alter table governance.workflow_instances alter column definition_version set not null;
alter table governance.workflow_instances alter column definition_snapshot set not null;

-- Historical actions retain an actor locator even if the auth identity is later removed.
alter table governance.workflow_actions add column if not exists actor_ref text;
update governance.workflow_actions set actor_ref=actor_user_id::text where actor_ref is null and actor_user_id is not null;

create table if not exists governance.workflow_instance_events(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_instance_id uuid not null references governance.workflow_instances(id) on delete restrict,
  event_type text not null,
  status text not null,
  current_step integer not null,
  actor_user_id uuid,
  actor_ref text,
  actor_type text not null default 'SYSTEM',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(actor_type in ('SYSTEM','USER'))
);
create index if not exists workflow_instance_events_instance_idx on governance.workflow_instance_events(workflow_instance_id,created_at,id);
alter table governance.workflow_instance_events enable row level security;
drop policy if exists workflow_instance_events_read on governance.workflow_instance_events;
create policy workflow_instance_events_read on governance.workflow_instance_events for select to authenticated
using(app_private.is_project_member(project_id));
revoke all on governance.workflow_instance_events from public,anon,authenticated,service_role;
grant select on governance.workflow_instance_events to authenticated,service_role;

insert into governance.workflow_instance_events(project_id,workflow_instance_id,event_type,status,current_step,actor_user_id,actor_ref,actor_type,snapshot)
select i.project_id,i.id,'LEGACY_BASELINE',i.status,i.current_step,i.started_by,i.started_by::text,
       case when i.started_by is null then 'SYSTEM' else 'USER' end,
       jsonb_build_object('definition_version',i.definition_version,'definition_snapshot',i.definition_snapshot,'context',i.context,'started_at',i.started_at,'completed_at',i.completed_at)
from governance.workflow_instances i
where not exists(select 1 from governance.workflow_instance_events e where e.workflow_instance_id=i.id);

create or replace function governance.wave3_immutable_evidence()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin raise exception 'Governance workflow/contract evidence is append-only'; end; $$;
revoke all on function governance.wave3_immutable_evidence() from public,anon,authenticated,service_role;

drop trigger if exists workflow_actions_immutable on governance.workflow_actions;
create trigger workflow_actions_immutable before update or delete on governance.workflow_actions
for each row execute function governance.wave3_immutable_evidence();
drop trigger if exists workflow_instance_events_immutable on governance.workflow_instance_events;
create trigger workflow_instance_events_immutable before update or delete on governance.workflow_instance_events
for each row execute function governance.wave3_immutable_evidence();

create or replace function governance.capture_workflow_instance_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v_actor_text text; v_actor uuid; v_actor_type text:='SYSTEM';
begin
  v_actor_text:=nullif(current_setting('governance.workflow_actor',true),'');
  if v_actor_text is not null then v_actor:=v_actor_text::uuid; v_actor_type:='USER'; end if;
  insert into governance.workflow_instance_events(project_id,workflow_instance_id,event_type,status,current_step,actor_user_id,actor_ref,actor_type,snapshot)
  values(new.project_id,new.id,
    case when tg_op='INSERT' then 'STARTED' when new.status is distinct from old.status then new.status else 'ADVANCED' end,
    new.status,new.current_step,v_actor,v_actor_text,v_actor_type,
    jsonb_build_object('definition_version',new.definition_version,'definition_snapshot',new.definition_snapshot,'context',new.context,'completed_at',new.completed_at));
  return new;
end; $$;
revoke all on function governance.capture_workflow_instance_event() from public,anon,authenticated,service_role;
drop trigger if exists capture_workflow_instance_event on governance.workflow_instances;
create trigger capture_workflow_instance_event after insert or update of status,current_step,context,completed_at on governance.workflow_instances
for each row execute function governance.capture_workflow_instance_event();

-- Definition semantics become immutable after they have been used. Enabled may still be toggled to stop future starts.
create or replace function governance.guard_workflow_definition_history()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
  if exists(select 1 from governance.workflow_instances where workflow_definition_id=old.id) and
     (new.project_id,new.workflow_key,new.name,new.entity_type,new.version,new.steps,new.created_by,new.created_at)
       is distinct from
     (old.project_id,old.workflow_key,old.name,old.entity_type,old.version,old.steps,old.created_by,old.created_at) then
    raise exception 'Used workflow definition semantics are immutable; create a new definition version';
  end if;
  return new;
end; $$;
revoke all on function governance.guard_workflow_definition_history() from public,anon,authenticated,service_role;
drop trigger if exists guard_workflow_definition_history on governance.workflow_definitions;
create trigger guard_workflow_definition_history before update on governance.workflow_definitions
for each row execute function governance.guard_workflow_definition_history();

create or replace function governance.start_workflow(p_definition_id uuid,p_entity_type text,p_entity_id uuid,p_started_by uuid,p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='pg_catalog','governance','app' as $$
declare v_def governance.workflow_definitions%rowtype; v_id uuid; v_snapshot jsonb;
begin
  select * into v_def from governance.workflow_definitions where id=p_definition_id and enabled=true;
  if not found then raise exception 'Workflow definition is unavailable'; end if;
  if nullif(btrim(coalesce(p_entity_type,'')),'') is null or upper(p_entity_type)<>upper(v_def.entity_type) then
    raise exception 'Workflow entity type does not match the pinned definition';
  end if;
  if p_entity_id is null then raise exception 'Workflow entity id is required'; end if;
  if p_started_by is not null and not exists(
    select 1 from app.projects p join app.organization_members m on m.organization_id=p.organization_id
    where p.id=v_def.project_id and m.user_id=p_started_by
  ) then raise exception 'Workflow starter is not a project member'; end if;
  v_snapshot:=jsonb_build_object('workflow_key',v_def.workflow_key,'name',v_def.name,'entity_type',v_def.entity_type,'version',v_def.version,'steps',v_def.steps);
  if p_started_by is not null then perform set_config('governance.workflow_actor',p_started_by::text,true); end if;
  insert into governance.workflow_instances(project_id,workflow_definition_id,entity_type,entity_id,status,current_step,context,started_by,definition_version,definition_snapshot)
  values(v_def.project_id,v_def.id,v_def.entity_type,p_entity_id,'RUNNING',0,coalesce(p_context,'{}'::jsonb),p_started_by,v_def.version,v_snapshot)
  returning id into v_id;
  perform set_config('governance.workflow_actor','',true);
  return v_id;
end; $$;
revoke all on function governance.start_workflow(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function governance.start_workflow(uuid,text,uuid,uuid,jsonb) to service_role;

create or replace function governance.act_workflow(p_instance_id uuid,p_actor_user_id uuid,p_action text,p_notes text default null,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','app' as $$
declare
  v_instance governance.workflow_instances%rowtype; v_steps jsonb; v_step jsonb; v_step_count int;
  v_required_capability text; v_action text:=upper(btrim(coalesce(p_action,''))); v_next int; v_status text;
begin
  select * into v_instance from governance.workflow_instances where id=p_instance_id for update;
  if not found then raise exception 'Workflow instance not found'; end if;
  if v_instance.status<>'RUNNING' then raise exception 'Workflow instance is not active'; end if;
  if p_actor_user_id is null or not exists(
    select 1 from app.projects p join app.organization_members m on m.organization_id=p.organization_id
    where p.id=v_instance.project_id and m.user_id=p_actor_user_id
  ) then raise exception 'Workflow actor is not a project member'; end if;
  if v_action not in ('APPROVE','REJECT','COMMENT','CANCEL') then raise exception 'Unsupported workflow action'; end if;
  v_steps:=coalesce(v_instance.definition_snapshot->'steps','[]'::jsonb);
  v_step_count:=jsonb_array_length(v_steps);
  if v_instance.current_step<0 or (v_step_count>0 and v_instance.current_step>=v_step_count) then raise exception 'Workflow current step is outside the pinned definition'; end if;
  if v_step_count>0 then v_step:=v_steps->v_instance.current_step; end if;
  v_required_capability:=nullif(btrim(coalesce(v_step->>'capability','')),'');
  if v_action in ('APPROVE','REJECT') and v_required_capability is not null and
     not governance.has_project_capability(v_instance.project_id,p_actor_user_id,v_required_capability) then
    raise exception 'Workflow actor lacks required capability %',v_required_capability;
  end if;
  if v_action='CANCEL' and p_actor_user_id is distinct from v_instance.started_by and
     not governance.has_project_capability(v_instance.project_id,p_actor_user_id,coalesce(v_required_capability,'policy.approve')) then
    raise exception 'Workflow actor is not authorized to cancel this workflow';
  end if;
  insert into governance.workflow_actions(workflow_instance_id,step_index,action,actor_user_id,actor_ref,notes,evidence)
  values(v_instance.id,v_instance.current_step,v_action,p_actor_user_id,p_actor_user_id::text,p_notes,
    coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('required_capability',v_required_capability,'definition_version',v_instance.definition_version));
  if v_action='REJECT' then v_status:='REJECTED'; v_next:=v_instance.current_step;
  elsif v_action='CANCEL' then v_status:='CANCELLED'; v_next:=v_instance.current_step;
  elsif v_action='APPROVE' then v_next:=v_instance.current_step+1; v_status:=case when v_next>=v_step_count then 'APPROVED' else 'RUNNING' end;
  else v_next:=v_instance.current_step; v_status:='RUNNING'; end if;
  perform set_config('governance.workflow_actor',p_actor_user_id::text,true);
  update governance.workflow_instances set status=v_status,current_step=v_next,
    completed_at=case when v_status<>'RUNNING' then now() else null end where id=v_instance.id;
  perform set_config('governance.workflow_actor','',true);
  return jsonb_build_object('instance_id',v_instance.id,'status',v_status,'current_step',v_next,'step_count',v_step_count,'required_capability',v_required_capability);
end; $$;
revoke all on function governance.act_workflow(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function governance.act_workflow(uuid,uuid,text,text,jsonb) to service_role;

-- Remediation state remains mutable as a state machine, but every transition becomes immutable evidence.
create table if not exists governance.remediation_outcome_events(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references app.projects(id) on delete cascade,
  outcome_type text not null, outcome_id uuid not null, workflow_instance_id uuid not null,
  status text not null, actor_user_id uuid, actor_ref text, actor_type text not null default 'SYSTEM',
  snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  check(outcome_type in ('PROFILING','DATA_QUALITY')), check(actor_type in ('SYSTEM','USER'))
);
create index if not exists remediation_outcome_events_idx on governance.remediation_outcome_events(outcome_type,outcome_id,created_at,id);
alter table governance.remediation_outcome_events enable row level security;
drop policy if exists remediation_outcome_events_read on governance.remediation_outcome_events;
create policy remediation_outcome_events_read on governance.remediation_outcome_events for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.remediation_outcome_events from public,anon,authenticated,service_role;
grant select on governance.remediation_outcome_events to authenticated,service_role;
drop trigger if exists remediation_outcome_events_immutable on governance.remediation_outcome_events;
create trigger remediation_outcome_events_immutable before update or delete on governance.remediation_outcome_events for each row execute function governance.wave3_immutable_evidence();

insert into governance.remediation_outcome_events(project_id,outcome_type,outcome_id,workflow_instance_id,status,actor_user_id,actor_ref,actor_type,snapshot)
select project_id,'PROFILING',id,workflow_instance_id,status,created_by,created_by::text,case when created_by is null then 'SYSTEM' else 'USER' end,
 jsonb_build_object('event','LEGACY_BASELINE','execution_mode',execution_mode,'production_mutation_performed',production_mutation_performed,'outcome',outcome,'created_at',created_at,'verified_at',verified_at)
from governance.profiling_remediation_outcomes p where not exists(select 1 from governance.remediation_outcome_events e where e.outcome_type='PROFILING' and e.outcome_id=p.id);
insert into governance.remediation_outcome_events(project_id,outcome_type,outcome_id,workflow_instance_id,status,actor_user_id,actor_ref,actor_type,snapshot)
select project_id,'DATA_QUALITY',id,workflow_instance_id,status,created_by,created_by::text,case when created_by is null then 'SYSTEM' else 'USER' end,
 jsonb_build_object('event','LEGACY_BASELINE','execution_mode',execution_mode,'production_mutation_performed',production_mutation_performed,'outcome',outcome,'created_at',created_at,'verified_at',verified_at)
from governance.data_quality_remediation_outcomes p where not exists(select 1 from governance.remediation_outcome_events e where e.outcome_type='DATA_QUALITY' and e.outcome_id=p.id);

create or replace function governance.capture_remediation_outcome_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v_type text:=case when tg_table_name='profiling_remediation_outcomes' then 'PROFILING' else 'DATA_QUALITY' end; v_actor uuid; v_actor_type text:='SYSTEM';
begin
  if v_type='PROFILING' then v_actor:=new.verification_requested_by; else v_actor:=new.created_by; end if;
  if v_actor is not null then v_actor_type:='USER'; end if;
  insert into governance.remediation_outcome_events(project_id,outcome_type,outcome_id,workflow_instance_id,status,actor_user_id,actor_ref,actor_type,snapshot)
  values(new.project_id,v_type,new.id,new.workflow_instance_id,new.status,v_actor,v_actor::text,v_actor_type,
    jsonb_build_object('event',case when tg_op='INSERT' then 'CREATED' else 'STATE_CHANGED' end,'execution_mode',new.execution_mode,
      'production_mutation_performed',new.production_mutation_performed,'remediation_issue_ids',new.remediation_issue_ids,'checks',new.checks,'outcome',new.outcome,
      'verified_at',new.verified_at,'updated_at',new.updated_at));
  return new;
end; $$;
revoke all on function governance.capture_remediation_outcome_event() from public,anon,authenticated,service_role;
drop trigger if exists capture_profiling_remediation_event on governance.profiling_remediation_outcomes;
create trigger capture_profiling_remediation_event after insert or update on governance.profiling_remediation_outcomes for each row execute function governance.capture_remediation_outcome_event();
drop trigger if exists capture_dq_remediation_event on governance.data_quality_remediation_outcomes;
create trigger capture_dq_remediation_event after insert or update on governance.data_quality_remediation_outcomes for each row execute function governance.capture_remediation_outcome_event();

alter table governance.profiling_remediation_outcomes drop constraint if exists profiling_remediation_outcomes_workflow_instance_id_fkey;
alter table governance.profiling_remediation_outcomes add constraint profiling_remediation_outcomes_workflow_instance_id_fkey foreign key(workflow_instance_id) references governance.workflow_instances(id) on delete restrict;
alter table governance.profiling_remediation_outcomes drop constraint if exists profiling_remediation_outcomes_source_profile_run_id_fkey;
alter table governance.profiling_remediation_outcomes add constraint profiling_remediation_outcomes_source_profile_run_id_fkey foreign key(source_profile_run_id) references profiling.profile_runs(id) on delete restrict;
alter table governance.data_quality_remediation_outcomes drop constraint if exists data_quality_remediation_outcomes_workflow_instance_id_fkey;
alter table governance.data_quality_remediation_outcomes add constraint data_quality_remediation_outcomes_workflow_instance_id_fkey foreign key(workflow_instance_id) references governance.workflow_instances(id) on delete restrict;
alter table governance.data_quality_remediation_outcomes drop constraint if exists data_quality_remediation_outcomes_investigation_id_fkey;
alter table governance.data_quality_remediation_outcomes add constraint data_quality_remediation_outcomes_investigation_id_fkey foreign key(investigation_id) references governance.data_quality_investigations(id) on delete restrict;
alter table governance.data_quality_remediation_outcomes drop constraint if exists data_quality_remediation_outcomes_source_agent_run_id_fkey;
alter table governance.data_quality_remediation_outcomes add constraint data_quality_remediation_outcomes_source_agent_run_id_fkey foreign key(source_agent_run_id) references agent.agent_runs(id) on delete restrict;

-- Remediation knowledge is promoted evidence, not browser-editable mutable memory.
revoke insert,update,delete on governance.remediation_knowledge from authenticated;
drop policy if exists remediation_knowledge_project_insert on governance.remediation_knowledge;
drop policy if exists remediation_knowledge_project_update on governance.remediation_knowledge;
drop policy if exists remediation_knowledge_project_delete on governance.remediation_knowledge;

-- Data contracts distinguish a version's lifecycle from its governed authority.
alter table governance.data_contract_versions
  add column if not exists authority_status text not null default 'UNVERIFIED',
  add column if not exists semantic_hash text;
alter table governance.data_contract_versions drop constraint if exists data_contract_versions_authority_status_check;
alter table governance.data_contract_versions add constraint data_contract_versions_authority_status_check check(authority_status in ('UNVERIFIED','APPROVED','REJECTED'));
alter table governance.data_contract_versions drop constraint if exists data_contract_versions_status_check;
alter table governance.data_contract_versions add constraint data_contract_versions_status_check check(status in ('DRAFT','ACTIVE','RETIRED','REJECTED'));

update governance.data_contract_versions
set semantic_hash=encode(extensions.digest(convert_to(jsonb_build_object(
 'schema_hash',schema_hash,'compatibility_policy',compatibility_policy,'freshness_sla_hours',freshness_sla_hours,
 'row_count_min',row_count_min,'row_count_max',row_count_max,'quality_requirements',quality_requirements,'critical_columns',critical_columns,'metadata',metadata
)::text,'UTF8'),'sha256'),'hex')
where semantic_hash is null;
alter table governance.data_contract_versions alter column semantic_hash set not null;
create unique index if not exists data_contract_versions_semantic_unique on governance.data_contract_versions(contract_id,semantic_hash);

-- Existing ACTIVE rows without human approval were never governed authority. Preserve them as an unverified baseline.
update governance.data_contract_versions set status='DRAFT',authority_status='UNVERIFIED'
where status='ACTIVE' and (approved_by is null or effective_at is null);
update governance.data_contracts c set status='DRAFT'
where status='ACTIVE' and not exists(
 select 1 from governance.data_contract_versions v where v.contract_id=c.id and v.version_number=c.current_version and v.status='ACTIVE' and v.authority_status='APPROVED' and v.approved_by is not null and v.effective_at is not null
);

alter table governance.data_contracts add column if not exists current_version_id uuid;
update governance.data_contracts c set current_version_id=v.id from governance.data_contract_versions v
where v.contract_id=c.id and v.version_number=c.current_version and c.current_version_id is null;
alter table governance.data_contracts drop constraint if exists data_contracts_current_version_id_fkey;
alter table governance.data_contracts add constraint data_contracts_current_version_id_fkey foreign key(current_version_id) references governance.data_contract_versions(id) on delete restrict;

create table if not exists governance.data_contract_version_events(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references app.projects(id) on delete cascade,
 contract_id uuid not null references governance.data_contracts(id) on delete restrict,
 contract_version_id uuid not null references governance.data_contract_versions(id) on delete restrict,
 event_type text not null, actor_user_id uuid, actor_ref text, actor_type text not null default 'SYSTEM',
 snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 check(actor_type in ('SYSTEM','USER'))
);
create index if not exists data_contract_version_events_idx on governance.data_contract_version_events(contract_version_id,created_at,id);
alter table governance.data_contract_version_events enable row level security;
drop policy if exists data_contract_version_events_read on governance.data_contract_version_events;
create policy data_contract_version_events_read on governance.data_contract_version_events for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.data_contract_version_events from public,anon,authenticated,service_role;
grant select on governance.data_contract_version_events to authenticated,service_role;
drop trigger if exists data_contract_version_events_immutable on governance.data_contract_version_events;
create trigger data_contract_version_events_immutable before update or delete on governance.data_contract_version_events for each row execute function governance.wave3_immutable_evidence();

insert into governance.data_contract_version_events(project_id,contract_id,contract_version_id,event_type,actor_user_id,actor_ref,actor_type,snapshot)
select c.project_id,c.id,v.id,'LEGACY_BASELINE',v.approved_by,v.approved_by::text,case when v.approved_by is null then 'SYSTEM' else 'USER' end,
 jsonb_build_object('version_number',v.version_number,'semantic_hash',v.semantic_hash,'status',v.status,'authority_status',v.authority_status,'effective_at',v.effective_at,'created_at',v.created_at)
from governance.data_contract_versions v join governance.data_contracts c on c.id=v.contract_id
where not exists(select 1 from governance.data_contract_version_events e where e.contract_version_id=v.id);

create or replace function governance.guard_data_contract_version_history()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
declare v_review boolean:=coalesce(current_setting('governance.data_contract_review_context',true),'false')='true'; v_hash text;
begin
  if (new.contract_id,new.version_number,new.schema_hash,new.compatibility_policy,new.freshness_sla_hours,new.row_count_min,new.row_count_max,new.quality_requirements,new.critical_columns,new.metadata,new.semantic_hash,new.created_at)
     is distinct from
     (old.contract_id,old.version_number,old.schema_hash,old.compatibility_policy,old.freshness_sla_hours,old.row_count_min,old.row_count_max,old.quality_requirements,old.critical_columns,old.metadata,old.semantic_hash,old.created_at) then
    raise exception 'Data contract version semantics are immutable; create a new version';
  end if;
  if (new.status,new.authority_status,new.approved_by,new.effective_at) is distinct from (old.status,old.authority_status,old.approved_by,old.effective_at) and not v_review then
    raise exception 'Data contract authority changes require governed review';
  end if;
  if new.status='ACTIVE' and (new.authority_status<>'APPROVED' or new.approved_by is null or new.effective_at is null) then
    raise exception 'An active data contract version requires governed human approval evidence';
  end if;
  return new;
end; $$;
revoke all on function governance.guard_data_contract_version_history() from public,anon,authenticated,service_role;
drop trigger if exists guard_data_contract_version_history on governance.data_contract_versions;
create trigger guard_data_contract_version_history before update on governance.data_contract_versions for each row execute function governance.guard_data_contract_version_history();

create or replace function governance.capture_data_contract_version_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v_project uuid; v_actor_text text; v_actor uuid; v_actor_type text:='SYSTEM';
begin
 select project_id into v_project from governance.data_contracts where id=new.contract_id;
 v_actor_text:=nullif(current_setting('governance.data_contract_actor',true),'');
 if v_actor_text is not null then v_actor:=v_actor_text::uuid; v_actor_type:='USER'; end if;
 insert into governance.data_contract_version_events(project_id,contract_id,contract_version_id,event_type,actor_user_id,actor_ref,actor_type,snapshot)
 values(v_project,new.contract_id,new.id,case when tg_op='INSERT' then 'PROPOSED' when new.status is distinct from old.status then new.status else 'AUTHORITY_CHANGED' end,
 v_actor,v_actor_text,v_actor_type,jsonb_build_object('version_number',new.version_number,'semantic_hash',new.semantic_hash,'status',new.status,'authority_status',new.authority_status,'approved_by',new.approved_by,'effective_at',new.effective_at));
 return new;
end; $$;
revoke all on function governance.capture_data_contract_version_event() from public,anon,authenticated,service_role;
drop trigger if exists capture_data_contract_version_event on governance.data_contract_versions;
create trigger capture_data_contract_version_event after insert or update of status,authority_status,approved_by,effective_at on governance.data_contract_versions for each row execute function governance.capture_data_contract_version_event();

create or replace function governance.propose_data_contract_version(p_contract_id uuid,p_actor uuid,p_schema_hash text default null,p_compatibility_policy text default 'BACKWARD',p_freshness_sla_hours integer default null,p_row_count_min bigint default null,p_row_count_max bigint default null,p_quality_requirements jsonb default '{}'::jsonb,p_critical_columns text[] default '{}'::text[],p_metadata jsonb default '{}'::jsonb,p_change_reason text default null)
returns uuid language plpgsql security definer set search_path='pg_catalog','governance','app','extensions' as $$
declare c governance.data_contracts%rowtype; v_num int; v_hash text; v_id uuid;
begin
 select * into c from governance.data_contracts where id=p_contract_id for update;
 if not found then raise exception 'Data contract not found'; end if;
 if p_actor is null or not exists(select 1 from app.projects p join app.organization_members m on m.organization_id=p.organization_id where p.id=c.project_id and m.user_id=p_actor) then raise exception 'Contract proposer is not a project member'; end if;
 select coalesce(max(version_number),0)+1 into v_num from governance.data_contract_versions where contract_id=c.id;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('schema_hash',p_schema_hash,'compatibility_policy',p_compatibility_policy,'freshness_sla_hours',p_freshness_sla_hours,'row_count_min',p_row_count_min,'row_count_max',p_row_count_max,'quality_requirements',coalesce(p_quality_requirements,'{}'::jsonb),'critical_columns',coalesce(p_critical_columns,'{}'::text[]),'metadata',coalesce(p_metadata,'{}'::jsonb))::text,'UTF8'),'sha256'),'hex');
 perform set_config('governance.data_contract_actor',p_actor::text,true);
 insert into governance.data_contract_versions(contract_id,version_number,schema_hash,compatibility_policy,freshness_sla_hours,row_count_min,row_count_max,quality_requirements,critical_columns,metadata,change_reason,status,authority_status,semantic_hash)
 values(c.id,v_num,p_schema_hash,p_compatibility_policy,p_freshness_sla_hours,p_row_count_min,p_row_count_max,coalesce(p_quality_requirements,'{}'::jsonb),coalesce(p_critical_columns,'{}'::text[]),coalesce(p_metadata,'{}'::jsonb),p_change_reason,'DRAFT','UNVERIFIED',v_hash) returning id into v_id;
 perform set_config('governance.data_contract_actor','',true);
 return v_id;
end; $$;
revoke all on function governance.propose_data_contract_version(uuid,uuid,text,text,integer,bigint,bigint,jsonb,text[],jsonb,text) from public,anon,authenticated;
grant execute on function governance.propose_data_contract_version(uuid,uuid,text,text,integer,bigint,bigint,jsonb,text[],jsonb,text) to service_role;

create or replace function governance.review_data_contract_version(p_version_id uuid,p_reviewer uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v governance.data_contract_versions%rowtype; c governance.data_contracts%rowtype; d text:=upper(btrim(coalesce(p_decision,'')));
begin
 select * into v from governance.data_contract_versions where id=p_version_id for update;
 if not found then raise exception 'Data contract version not found'; end if;
 select * into c from governance.data_contracts where id=v.contract_id for update;
 if p_reviewer is null or not governance.has_project_capability(c.project_id,p_reviewer,'policy.approve') then raise exception 'Reviewer is not authorized for policy.approve'; end if;
 if d not in ('APPROVE','REJECT','RETIRE') then raise exception 'Unsupported contract review decision'; end if;
 perform set_config('governance.data_contract_actor',p_reviewer::text,true);
 perform set_config('governance.data_contract_review_context','true',true);
 if d='APPROVE' then
   update governance.data_contract_versions set status='RETIRED' where contract_id=c.id and status='ACTIVE' and id<>v.id;
   update governance.data_contract_versions set status='ACTIVE',authority_status='APPROVED',approved_by=p_reviewer,effective_at=now() where id=v.id;
   update governance.data_contracts set status='ACTIVE',current_version=v.version_number,current_version_id=v.id,updated_at=now() where id=c.id;
 elsif d='REJECT' then
   update governance.data_contract_versions set status='REJECTED',authority_status='REJECTED',approved_by=p_reviewer,effective_at=null where id=v.id;
 else
   update governance.data_contract_versions set status='RETIRED' where id=v.id;
   if c.current_version_id=v.id then update governance.data_contracts set status='DRAFT',updated_at=now() where id=c.id; end if;
 end if;
 perform set_config('governance.data_contract_review_context','false',true);
 perform set_config('governance.data_contract_actor','',true);
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
 values(c.project_id,p_reviewer,'USER','DATA_CONTRACT_REVIEW_DECIDED','DATA_CONTRACT_VERSION',v.id,jsonb_build_object('decision',d,'contract_id',c.id,'version_number',v.version_number,'note',p_note,'atomic_with_decision',true));
 return jsonb_build_object('contract_id',c.id,'version_id',v.id,'decision',d,'version_number',v.version_number);
end; $$;
revoke all on function governance.review_data_contract_version(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function governance.review_data_contract_version(uuid,uuid,text,text) to service_role;

-- Canonical evaluation rows may refresh, but every result is captured before it can be overwritten.
create table if not exists governance.data_contract_evaluation_events(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references app.projects(id) on delete cascade,
 evaluation_id uuid not null references governance.data_contract_evaluations(id) on delete restrict,
 contract_id uuid not null references governance.data_contracts(id) on delete restrict,
 contract_version_id uuid not null references governance.data_contract_versions(id) on delete restrict,
 profile_run_id uuid not null references profiling.profile_runs(id) on delete restrict,
 status text not null, checks jsonb not null, event_type text not null, created_at timestamptz not null default now()
);
create index if not exists data_contract_evaluation_events_idx on governance.data_contract_evaluation_events(evaluation_id,created_at,id);
alter table governance.data_contract_evaluation_events enable row level security;
drop policy if exists data_contract_evaluation_events_read on governance.data_contract_evaluation_events;
create policy data_contract_evaluation_events_read on governance.data_contract_evaluation_events for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.data_contract_evaluation_events from public,anon,authenticated,service_role;
grant select on governance.data_contract_evaluation_events to authenticated,service_role;
drop trigger if exists data_contract_evaluation_events_immutable on governance.data_contract_evaluation_events;
create trigger data_contract_evaluation_events_immutable before update or delete on governance.data_contract_evaluation_events for each row execute function governance.wave3_immutable_evidence();

insert into governance.data_contract_evaluation_events(project_id,evaluation_id,contract_id,contract_version_id,profile_run_id,status,checks,event_type,created_at)
select e.project_id,e.id,e.contract_id,e.contract_version_id,e.profile_run_id,e.status,e.checks,'LEGACY_BASELINE',e.evaluated_at
from governance.data_contract_evaluations e where not exists(select 1 from governance.data_contract_evaluation_events x where x.evaluation_id=e.id);

create or replace function governance.capture_data_contract_evaluation_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
begin
 insert into governance.data_contract_evaluation_events(project_id,evaluation_id,contract_id,contract_version_id,profile_run_id,status,checks,event_type)
 values(new.project_id,new.id,new.contract_id,new.contract_version_id,new.profile_run_id,new.status,new.checks,case when tg_op='INSERT' then 'EVALUATED' else 'REEVALUATED' end);
 return new;
end; $$;
revoke all on function governance.capture_data_contract_evaluation_event() from public,anon,authenticated,service_role;
drop trigger if exists capture_data_contract_evaluation_event on governance.data_contract_evaluations;
create trigger capture_data_contract_evaluation_event after insert or update of status,checks,evaluated_at on governance.data_contract_evaluations for each row execute function governance.capture_data_contract_evaluation_event();

alter table governance.data_contract_evaluations drop constraint if exists data_contract_evaluations_contract_version_id_fkey;
alter table governance.data_contract_evaluations add constraint data_contract_evaluations_contract_version_id_fkey foreign key(contract_version_id) references governance.data_contract_versions(id) on delete restrict;
alter table governance.data_contract_evaluations drop constraint if exists data_contract_evaluations_profile_run_id_fkey;
alter table governance.data_contract_evaluations add constraint data_contract_evaluations_profile_run_id_fkey foreign key(profile_run_id) references profiling.profile_runs(id) on delete restrict;
alter table governance.data_contract_versions drop constraint if exists data_contract_versions_contract_id_fkey;
alter table governance.data_contract_versions add constraint data_contract_versions_contract_id_fkey foreign key(contract_id) references governance.data_contracts(id) on delete restrict;

-- Active contracts must resolve to a reviewed, approved, effective current version.
create or replace function governance.guard_data_contract_current_authority()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
 if new.status='ACTIVE' and not exists(
   select 1 from governance.data_contract_versions v where v.contract_id=new.id and v.id=new.current_version_id and v.version_number=new.current_version
     and v.status='ACTIVE' and v.authority_status='APPROVED' and v.approved_by is not null and v.effective_at is not null
 ) then raise exception 'Active data contract requires an approved effective current version'; end if;
 return new;
end; $$;
revoke all on function governance.guard_data_contract_current_authority() from public,anon,authenticated,service_role;
drop trigger if exists guard_data_contract_current_authority on governance.data_contracts;
create trigger guard_data_contract_current_authority before insert or update of status,current_version,current_version_id on governance.data_contracts for each row execute function governance.guard_data_contract_current_authority();

create or replace function governance.verify_workflow_contract_posture()
returns jsonb language sql stable security definer set search_path='pg_catalog','governance' as $$
select jsonb_build_object(
 'valid',
   not exists(select 1 from governance.workflow_instances where definition_version is null or definition_snapshot is null)
   and exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='workflow_actions' and t.tgname='workflow_actions_immutable' and not t.tgisinternal)
   and not exists(select 1 from governance.data_contracts c where c.status='ACTIVE' and not exists(select 1 from governance.data_contract_versions v where v.id=c.current_version_id and v.contract_id=c.id and v.status='ACTIVE' and v.authority_status='APPROVED' and v.approved_by is not null and v.effective_at is not null)),
 'workflow_instances_pinned',not exists(select 1 from governance.workflow_instances where definition_version is null or definition_snapshot is null),
 'workflow_actions_append_only',exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='workflow_actions' and t.tgname='workflow_actions_immutable' and not t.tgisinternal),
 'active_contracts_without_authority',(select count(*) from governance.data_contracts c where c.status='ACTIVE' and not exists(select 1 from governance.data_contract_versions v where v.id=c.current_version_id and v.contract_id=c.id and v.status='ACTIVE' and v.authority_status='APPROVED' and v.approved_by is not null and v.effective_at is not null)),
 'unverified_active_versions',(select count(*) from governance.data_contract_versions where status='ACTIVE' and authority_status<>'APPROVED'),
 'workflow_event_count',(select count(*) from governance.workflow_instance_events),
 'contract_version_event_count',(select count(*) from governance.data_contract_version_events),
 'contract_evaluation_event_count',(select count(*) from governance.data_contract_evaluation_events)
); $$;
revoke all on function governance.verify_workflow_contract_posture() from public,anon,authenticated;
grant execute on function governance.verify_workflow_contract_posture() to service_role;
