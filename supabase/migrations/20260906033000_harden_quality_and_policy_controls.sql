-- Wave 2: make DQ rule semantics/re-execution evidence immutable and extend policy controls to stable catalog scope.

create table if not exists profiling.quality_rule_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  rule_definition_id uuid not null references profiling.quality_rule_definitions(id) on delete cascade,
  version_number integer not null,
  semantic_hash text not null,
  snapshot jsonb not null,
  provenance text not null default 'CAPTURED',
  created_at timestamptz not null default now(),
  unique(rule_definition_id,version_number),
  unique(rule_definition_id,semantic_hash)
);
create index if not exists quality_rule_versions_project_idx on profiling.quality_rule_versions(project_id,rule_definition_id,version_number desc);
alter table profiling.quality_rule_versions enable row level security;
drop policy if exists quality_rule_versions_read on profiling.quality_rule_versions;
create policy quality_rule_versions_read on profiling.quality_rule_versions for select to authenticated using (app_private.is_project_member(project_id));
revoke all on profiling.quality_rule_versions from public,anon,authenticated,service_role;
grant select on profiling.quality_rule_versions to authenticated,service_role;

alter table profiling.quality_rule_definitions add column if not exists current_version_id uuid;
alter table profiling.quality_rule_runs add column if not exists rule_version_id uuid;

create or replace function profiling.quality_rule_semantic_snapshot(p profiling.quality_rule_definitions)
returns jsonb language sql immutable set search_path='pg_catalog','profiling' as $$
select jsonb_build_object(
  'dataset_id',p.dataset_id,'dataset_version_id',p.dataset_version_id,'column_name',p.column_name,'rule_key',p.rule_key,
  'name',p.name,'description',p.description,'dimension',p.dimension,'severity',p.severity,'metric_key',p.metric_key,
  'operator',p.operator,'threshold',p.threshold,'origin',p.origin,'rule_type',p.rule_type,'rule_config',p.rule_config,
  'certification_required',p.certification_required,'approval_status',p.approval_status
); $$;
revoke all on function profiling.quality_rule_semantic_snapshot(profiling.quality_rule_definitions) from public,anon,authenticated;
grant execute on function profiling.quality_rule_semantic_snapshot(profiling.quality_rule_definitions) to service_role;

create or replace function profiling.capture_quality_rule_version(p_rule_id uuid,p_provenance text default 'CAPTURED')
returns uuid language plpgsql security definer set search_path='pg_catalog','profiling','extensions' as $$
declare r profiling.quality_rule_definitions%rowtype; s jsonb; h text; v_id uuid; v_num int;
begin
  select * into r from profiling.quality_rule_definitions where id=p_rule_id for update;
  if not found then raise exception 'Quality rule not found'; end if;
  s:=profiling.quality_rule_semantic_snapshot(r);
  h:=encode(extensions.digest(convert_to(s::text,'UTF8'),'sha256'),'hex');
  select id into v_id from profiling.quality_rule_versions where rule_definition_id=r.id and semantic_hash=h;
  if v_id is null then
    select coalesce(max(version_number),0)+1 into v_num from profiling.quality_rule_versions where rule_definition_id=r.id;
    insert into profiling.quality_rule_versions(project_id,rule_definition_id,version_number,semantic_hash,snapshot,provenance)
    values(r.project_id,r.id,v_num,h,s,coalesce(nullif(btrim(p_provenance),''),'CAPTURED')) returning id into v_id;
  end if;
  update profiling.quality_rule_definitions set current_version_id=v_id where id=r.id and current_version_id is distinct from v_id;
  return v_id;
end; $$;
revoke all on function profiling.capture_quality_rule_version(uuid,text) from public,anon,authenticated;
grant execute on function profiling.capture_quality_rule_version(uuid,text) to service_role;

create or replace function profiling.on_quality_rule_semantic_change()
returns trigger language plpgsql security definer set search_path='pg_catalog','profiling' as $$
begin
  perform profiling.capture_quality_rule_version(new.id,'CAPTURED'); return new;
end; $$;
revoke all on function profiling.on_quality_rule_semantic_change() from public,anon,authenticated,service_role;
drop trigger if exists quality_rule_semantic_version on profiling.quality_rule_definitions;
create trigger quality_rule_semantic_version after insert or update of dataset_id,dataset_version_id,column_name,rule_key,name,description,dimension,severity,metric_key,operator,threshold,origin,rule_type,rule_config,certification_required,approval_status
on profiling.quality_rule_definitions for each row execute function profiling.on_quality_rule_semantic_change();

do $$ declare r record; v uuid; begin
  for r in select id from profiling.quality_rule_definitions loop
    v:=profiling.capture_quality_rule_version(r.id,'LEGACY_BASELINE_CURRENT_DEFINITION');
  end loop;
end $$;

create table if not exists profiling.quality_rule_run_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, quality_rule_run_id uuid not null,
  rule_definition_id uuid not null, rule_version_id uuid, event_type text not null,
  run_snapshot jsonb not null, created_at timestamptz not null default now()
);
create index if not exists quality_rule_run_events_run_idx on profiling.quality_rule_run_events(quality_rule_run_id,created_at,id);
alter table profiling.quality_rule_run_events enable row level security;
drop policy if exists quality_rule_run_events_read on profiling.quality_rule_run_events;
create policy quality_rule_run_events_read on profiling.quality_rule_run_events for select to authenticated using (app_private.is_project_member(project_id));
revoke all on profiling.quality_rule_run_events from public,anon,authenticated,service_role;
grant select on profiling.quality_rule_run_events to authenticated,service_role;

create or replace function profiling.pin_quality_rule_run_version()
returns trigger language plpgsql security definer set search_path='pg_catalog','profiling' as $$
declare v uuid;
begin
  select current_version_id into v from profiling.quality_rule_definitions where id=new.rule_definition_id;
  if v is null then v:=profiling.capture_quality_rule_version(new.rule_definition_id,'CAPTURED_ON_EXECUTION'); end if;
  new.rule_version_id:=v;
  new.evidence:=coalesce(new.evidence,'{}'::jsonb)||jsonb_build_object('rule_version_id',v,'rule_semantics_pinned',true);
  return new;
end; $$;
revoke all on function profiling.pin_quality_rule_run_version() from public,anon,authenticated,service_role;
drop trigger if exists quality_rule_run_pin_version on profiling.quality_rule_runs;
create trigger quality_rule_run_pin_version before insert or update of rule_definition_id,status,passed,observed_value,threshold,evidence,completed_at on profiling.quality_rule_runs
for each row execute function profiling.pin_quality_rule_run_version();

create or replace function profiling.capture_quality_rule_run_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','profiling' as $$
declare v_project uuid; v_snapshot jsonb;
begin
  select project_id into v_project from profiling.quality_rule_definitions where id=new.rule_definition_id;
  v_snapshot:=jsonb_build_object('status',new.status,'passed',new.passed,'observed_value',new.observed_value,'threshold',new.threshold,
    'evidence',new.evidence,'error_message',new.error_message,'dataset_version_id',new.dataset_version_id,'profile_run_id',new.profile_run_id,
    'agent_run_id',new.agent_run_id,'started_at',new.started_at,'completed_at',new.completed_at);
  insert into profiling.quality_rule_run_events(project_id,quality_rule_run_id,rule_definition_id,rule_version_id,event_type,run_snapshot)
  values(v_project,new.id,new.rule_definition_id,new.rule_version_id,case when tg_op='INSERT' then 'EXECUTED' else 'REEXECUTED' end,v_snapshot);
  return new;
end; $$;
revoke all on function profiling.capture_quality_rule_run_event() from public,anon,authenticated,service_role;
drop trigger if exists quality_rule_run_capture_event on profiling.quality_rule_runs;
create trigger quality_rule_run_capture_event after insert or update of status,passed,observed_value,threshold,evidence,completed_at on profiling.quality_rule_runs
for each row execute function profiling.capture_quality_rule_run_event();

update profiling.quality_rule_runs r set rule_version_id=d.current_version_id,
 evidence=coalesce(r.evidence,'{}'::jsonb)||jsonb_build_object('rule_version_id',d.current_version_id,'rule_semantics_pinned',true,'version_provenance','LEGACY_BASELINE_CURRENT_DEFINITION')
from profiling.quality_rule_definitions d where d.id=r.rule_definition_id and r.rule_version_id is null;
insert into profiling.quality_rule_run_events(project_id,quality_rule_run_id,rule_definition_id,rule_version_id,event_type,run_snapshot)
select d.project_id,r.id,r.rule_definition_id,r.rule_version_id,'LEGACY_BASELINE_CAPTURED',jsonb_build_object('status',r.status,'passed',r.passed,'observed_value',r.observed_value,'threshold',r.threshold,'evidence',r.evidence,'started_at',r.started_at,'completed_at',r.completed_at)
from profiling.quality_rule_runs r join profiling.quality_rule_definitions d on d.id=r.rule_definition_id
where not exists(select 1 from profiling.quality_rule_run_events e where e.quality_rule_run_id=r.id);

create or replace function profiling.immutable_quality_evidence()
returns trigger language plpgsql set search_path='pg_catalog','profiling' as $$ begin raise exception 'Quality evidence history is append-only'; end; $$;
revoke all on function profiling.immutable_quality_evidence() from public,anon,authenticated,service_role;
drop trigger if exists quality_rule_versions_immutable on profiling.quality_rule_versions;
create trigger quality_rule_versions_immutable before update or delete on profiling.quality_rule_versions for each row execute function profiling.immutable_quality_evidence();
drop trigger if exists quality_rule_run_events_immutable on profiling.quality_rule_run_events;
create trigger quality_rule_run_events_immutable before update or delete on profiling.quality_rule_run_events for each row execute function profiling.immutable_quality_evidence();

create or replace view profiling.quality_rule_run_evidence as
select r.*,v.version_number,v.semantic_hash,v.snapshot as rule_snapshot,v.provenance as rule_version_provenance
from profiling.quality_rule_runs r left join profiling.quality_rule_versions v on v.id=r.rule_version_id;
grant select on profiling.quality_rule_run_evidence to authenticated,service_role;

alter table profiling.quality_rule_exceptions drop constraint if exists quality_rule_exceptions_status_check;
alter table profiling.quality_rule_exceptions add constraint quality_rule_exceptions_status_check check(status in ('OPEN','WAIVED','RESOLVED','REJECTED','EXPIRED','REVOKED'));
create table if not exists profiling.quality_rule_exception_events(
  id uuid primary key default gen_random_uuid(), project_id uuid not null, exception_id uuid not null,
  event_type text not null, actor_user_id uuid, status text not null, evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_rule_exception_events_idx on profiling.quality_rule_exception_events(exception_id,created_at,id);
alter table profiling.quality_rule_exception_events enable row level security;
drop policy if exists quality_rule_exception_events_read on profiling.quality_rule_exception_events;
create policy quality_rule_exception_events_read on profiling.quality_rule_exception_events for select to authenticated using(app_private.is_project_member(project_id));
revoke all on profiling.quality_rule_exception_events from public,anon,authenticated,service_role;
grant select on profiling.quality_rule_exception_events to authenticated,service_role;
drop trigger if exists quality_rule_exception_events_immutable on profiling.quality_rule_exception_events;
create trigger quality_rule_exception_events_immutable before update or delete on profiling.quality_rule_exception_events for each row execute function profiling.immutable_quality_evidence();

create or replace function profiling.capture_quality_rule_exception_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','profiling' as $$
declare v_project uuid; begin
 select d.project_id into v_project from profiling.quality_rule_definitions d where d.id=new.rule_definition_id;
 insert into profiling.quality_rule_exception_events(project_id,exception_id,event_type,actor_user_id,status,evidence)
 values(v_project,new.id,case when tg_op='INSERT' then 'OPENED' when new.status is distinct from old.status then new.status else 'UPDATED' end,
   new.approved_by,new.status,jsonb_build_object('reason',new.reason,'waiver_reason',new.waiver_reason,'approved_by',new.approved_by,'approved_at',new.approved_at,'expires_at',new.expires_at,'resolution_notes',new.resolution_notes));
 return new; end; $$;
revoke all on function profiling.capture_quality_rule_exception_event() from public,anon,authenticated,service_role;
drop trigger if exists quality_rule_exception_capture_event on profiling.quality_rule_exceptions;
create trigger quality_rule_exception_capture_event after insert or update of status,waiver_reason,approved_by,approved_at,expires_at,resolution_notes on profiling.quality_rule_exceptions for each row execute function profiling.capture_quality_rule_exception_event();

create or replace function profiling.expire_quality_rule_waivers()
returns integer language plpgsql security definer set search_path='pg_catalog','profiling' as $$
declare v_count int; begin
 update profiling.quality_rule_exceptions set status='EXPIRED',resolution_notes=concat_ws(E'\n',nullif(resolution_notes,''),'Waiver expired automatically; approval evidence preserved.')
 where status='WAIVED' and expires_at is not null and expires_at<=now();
 get diagnostics v_count=row_count; return v_count; end; $$;
revoke all on function profiling.expire_quality_rule_waivers() from public,anon,authenticated;
grant execute on function profiling.expire_quality_rule_waivers() to service_role;

create or replace function governance.review_quality_rule_exception(p_exception_id uuid,p_reviewer uuid,p_decision text,p_reason text default null,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','profiling' as $$
declare v_project uuid; v_decision text:=upper(btrim(coalesce(p_decision,''))); r profiling.quality_rule_exceptions%rowtype;
begin
 select d.project_id into v_project from profiling.quality_rule_exceptions e join profiling.quality_rule_definitions d on d.id=e.rule_definition_id where e.id=p_exception_id;
 if v_project is null then raise exception 'Quality rule exception not found'; end if;
 if p_reviewer is null or not governance.has_project_capability(v_project,p_reviewer,'quality_rule.review') then raise exception 'Reviewer is not authorized for quality_rule.review'; end if;
 if v_decision not in ('WAIVED','REJECTED','RESOLVED','REVOKED') then raise exception 'Unsupported exception decision'; end if;
 if v_decision='WAIVED' and (nullif(btrim(coalesce(p_reason,'')),'') is null or p_expires_at is null or p_expires_at<=now()) then raise exception 'Waiver requires reason and a future expiry'; end if;
 update profiling.quality_rule_exceptions set status=v_decision,
   waiver_reason=case when v_decision='WAIVED' then btrim(p_reason) else waiver_reason end,
   approved_by=case when v_decision='WAIVED' then p_reviewer else approved_by end,
   approved_at=case when v_decision='WAIVED' then now() else approved_at end,
   expires_at=case when v_decision='WAIVED' then p_expires_at else expires_at end,
   resolution_notes=case when v_decision in ('RESOLVED','REJECTED','REVOKED') then concat_ws(E'\n',nullif(resolution_notes,''),nullif(btrim(coalesce(p_reason,'')),'')) else resolution_notes end
 where id=p_exception_id returning * into r;
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
 values(v_project,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','QUALITY_RULE_EXCEPTION',p_exception_id,jsonb_build_object('decision',v_decision,'expires_at',p_expires_at,'atomic_with_decision',true));
 return jsonb_build_object('id',r.id,'status',r.status,'approved_at',r.approved_at,'expires_at',r.expires_at); end; $$;
revoke all on function governance.review_quality_rule_exception(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function governance.review_quality_rule_exception(uuid,uuid,text,text,timestamptz) to service_role;

-- Browser users read DQ state; writes are server/RPC governed.
revoke insert,update,delete on profiling.quality_rule_definitions from authenticated;
revoke insert,update,delete on profiling.quality_rule_exceptions from authenticated;
revoke insert,update,delete on profiling.quality_rule_runs from authenticated;

-- Stable catalog control scope.
alter table governance.control_scope_bindings
 add column if not exists data_source_id uuid,
 add column if not exists catalog_identity_key text,
 add column if not exists discovered_asset_id uuid,
 add column if not exists target_locator text,
 add column if not exists target_state text not null default 'CURRENT';
alter table governance.control_scope_bindings drop constraint if exists control_scope_bindings_scope_type_check;
alter table governance.control_scope_bindings add constraint control_scope_bindings_scope_type_check check(scope_type in ('PROJECT','DATASET','CDE','GLOSSARY_TERM','LINEAGE_ASSET','DATA_CONTRACT','QUALITY_RULE','DOMAIN','CATALOG_ASSET'));
alter table governance.control_scope_bindings drop constraint if exists control_scope_catalog_identity_check;
alter table governance.control_scope_bindings add constraint control_scope_catalog_identity_check check(scope_type<>'CATALOG_ASSET' or (data_source_id is not null and nullif(btrim(coalesce(catalog_identity_key,'')),'') is not null));
alter table governance.control_scope_bindings drop constraint if exists control_scope_target_state_check;
alter table governance.control_scope_bindings add constraint control_scope_target_state_check check(target_state in ('CURRENT','STALE'));
create index if not exists control_scope_catalog_identity_idx on governance.control_scope_bindings(project_id,data_source_id,catalog_identity_key) where scope_type='CATALOG_ASSET';

create or replace function governance.validate_control_catalog_scope()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance','catalog' as $$
declare a catalog.discovered_assets%rowtype; begin
 if new.scope_type<>'CATALOG_ASSET' then return new; end if;
 select x.* into a from catalog.discovered_assets x join catalog.data_sources s on s.id=x.source_id where x.source_id=new.data_source_id and x.identity_key=new.catalog_identity_key and x.is_current and s.project_id=new.project_id order by x.version_number desc limit 1;
 if not found then raise exception 'Control catalog scope is not a current governed asset in this project'; end if;
 new.discovered_asset_id:=a.id; new.target_locator:=a.asset_key; new.target_state:='CURRENT'; new.scope_key:='catalog_identity:'||new.catalog_identity_key; new.scope_id:=null;
 return new; end; $$;
revoke all on function governance.validate_control_catalog_scope() from public,anon,authenticated,service_role;
drop trigger if exists validate_control_catalog_scope on governance.control_scope_bindings;
create trigger validate_control_catalog_scope before insert or update of scope_type,data_source_id,catalog_identity_key on governance.control_scope_bindings for each row execute function governance.validate_control_catalog_scope();

create or replace function governance.bind_governance_control_catalog_scope(p_project_id uuid,p_control_id uuid,p_actor uuid,p_data_source_id uuid,p_catalog_identity_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare c governance.control_definitions%rowtype; b governance.control_scope_bindings%rowtype; begin
 if p_actor is null or not governance.has_project_capability(p_project_id,p_actor,'control.review') then raise exception 'Actor is not authorized for control.review'; end if;
 select * into c from governance.control_definitions where id=p_control_id and project_id=p_project_id;
 if not found or c.lifecycle_status<>'ACTIVE' or c.review_status<>'APPROVED' then raise exception 'Only approved active controls can receive authoritative catalog scope'; end if;
 insert into governance.control_scope_bindings(project_id,control_id,scope_type,scope_key,status,metadata,data_source_id,catalog_identity_key,target_state)
 values(p_project_id,p_control_id,'CATALOG_ASSET','catalog_identity:'||p_catalog_identity_key,'ACTIVE',coalesce(p_metadata,'{}'::jsonb),p_data_source_id,p_catalog_identity_key,'CURRENT') returning * into b;
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
 values(p_project_id,p_actor,'USER','GOVERNANCE_CONTROL_SCOPE_BOUND','CONTROL_SCOPE_BINDING',b.id,jsonb_build_object('control_id',p_control_id,'scope_type','CATALOG_ASSET','catalog_identity_key',p_catalog_identity_key,'stable_identity',true));
 return jsonb_build_object('id',b.id,'target_state',b.target_state,'target_locator',b.target_locator); end; $$;
revoke all on function governance.bind_governance_control_catalog_scope(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function governance.bind_governance_control_catalog_scope(uuid,uuid,uuid,uuid,text,jsonb) to service_role;

create or replace function governance.refresh_control_catalog_scope_validity(p_source_id uuid default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','catalog' as $$
declare r record; a catalog.discovered_assets%rowtype; cur int:=0; stale int:=0; begin
 for r in select * from governance.control_scope_bindings where scope_type='CATALOG_ASSET' and (p_source_id is null or data_source_id=p_source_id) loop
   select x.* into a from catalog.discovered_assets x where x.source_id=r.data_source_id and x.identity_key=r.catalog_identity_key and x.is_current order by x.version_number desc limit 1;
   if found then update governance.control_scope_bindings set discovered_asset_id=a.id,target_locator=a.asset_key,target_state='CURRENT',updated_at=now() where id=r.id and (target_state<>'CURRENT' or discovered_asset_id is distinct from a.id or target_locator is distinct from a.asset_key); cur:=cur+1;
   else update governance.control_scope_bindings set target_state='STALE',updated_at=now() where id=r.id and target_state<>'STALE'; stale:=stale+1; end if;
 end loop; return jsonb_build_object('current',cur,'stale',stale); end; $$;
revoke all on function governance.refresh_control_catalog_scope_validity(uuid) from public,anon,authenticated;
grant execute on function governance.refresh_control_catalog_scope_validity(uuid) to service_role;

create or replace function governance.on_catalog_revision_refresh_control_scope()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$ begin
 begin perform governance.refresh_control_catalog_scope_validity(new.source_id); exception when others then raise warning 'Control scope refresh failed after catalog publication: %',sqlerrm; end; return new; end; $$;
revoke all on function governance.on_catalog_revision_refresh_control_scope() from public,anon,authenticated,service_role;
drop trigger if exists catalog_revision_refresh_control_scope on catalog.catalog_revisions;
create trigger catalog_revision_refresh_control_scope after update of change_set_hash on catalog.catalog_revisions for each row when(old.change_set_hash is distinct from new.change_set_hash) execute function governance.on_catalog_revision_refresh_control_scope();

create table if not exists governance.control_waivers(
 id uuid primary key default gen_random_uuid(), project_id uuid not null, control_id uuid not null references governance.control_definitions(id),
 scope_binding_id uuid references governance.control_scope_bindings(id), status text not null default 'REQUESTED', reason text not null,
 requested_by uuid not null, requested_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz,
 expires_at timestamptz, review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status in ('REQUESTED','APPROVED','REJECTED','EXPIRED','REVOKED')),
 check(status<>'APPROVED' or (reviewed_by is not null and reviewed_at is not null and expires_at is not null))
);
create index if not exists control_waivers_active_idx on governance.control_waivers(project_id,control_id,scope_binding_id,expires_at) where status='APPROVED';
alter table governance.control_waivers enable row level security;
drop policy if exists control_waivers_read on governance.control_waivers;
create policy control_waivers_read on governance.control_waivers for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.control_waivers from public,anon,authenticated,service_role;
grant select on governance.control_waivers to authenticated,service_role;
create table if not exists governance.control_waiver_events(id uuid primary key default gen_random_uuid(),project_id uuid not null,waiver_id uuid not null,event_type text not null,actor_user_id uuid,status text not null,evidence jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table governance.control_waiver_events enable row level security;
drop policy if exists control_waiver_events_read on governance.control_waiver_events;
create policy control_waiver_events_read on governance.control_waiver_events for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.control_waiver_events from public,anon,authenticated,service_role;
grant select on governance.control_waiver_events to authenticated,service_role;

create or replace function governance.control_waiver_evidence_guard() returns trigger language plpgsql set search_path='pg_catalog','governance' as $$ begin raise exception 'Control waiver event evidence is append-only'; end; $$;
revoke all on function governance.control_waiver_evidence_guard() from public,anon,authenticated,service_role;
drop trigger if exists control_waiver_events_immutable on governance.control_waiver_events;
create trigger control_waiver_events_immutable before update or delete on governance.control_waiver_events for each row execute function governance.control_waiver_evidence_guard();
create or replace function governance.capture_control_waiver_event() returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$ begin
 insert into governance.control_waiver_events(project_id,waiver_id,event_type,actor_user_id,status,evidence) values(new.project_id,new.id,case when tg_op='INSERT' then 'REQUESTED' when new.status is distinct from old.status then new.status else 'UPDATED' end,coalesce(new.reviewed_by,new.requested_by),new.status,jsonb_build_object('control_id',new.control_id,'scope_binding_id',new.scope_binding_id,'reason',new.reason,'reviewed_at',new.reviewed_at,'expires_at',new.expires_at,'review_note',new.review_note)); return new; end; $$;
revoke all on function governance.capture_control_waiver_event() from public,anon,authenticated,service_role;
drop trigger if exists capture_control_waiver_event on governance.control_waivers;
create trigger capture_control_waiver_event after insert or update of status,reviewed_by,reviewed_at,expires_at,review_note on governance.control_waivers for each row execute function governance.capture_control_waiver_event();

create or replace function governance.request_control_waiver(p_project_id uuid,p_control_id uuid,p_scope_binding_id uuid,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$ declare w governance.control_waivers%rowtype; begin
 if p_actor is null or not app_private.is_project_member(p_project_id,p_actor) then raise exception 'Requester is not a project member'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Waiver reason is required'; end if;
 if not exists(select 1 from governance.control_definitions where id=p_control_id and project_id=p_project_id) then raise exception 'Control not found'; end if;
 if p_scope_binding_id is not null and not exists(select 1 from governance.control_scope_bindings where id=p_scope_binding_id and project_id=p_project_id and control_id=p_control_id) then raise exception 'Scope binding not valid for control'; end if;
 insert into governance.control_waivers(project_id,control_id,scope_binding_id,reason,requested_by) values(p_project_id,p_control_id,p_scope_binding_id,btrim(p_reason),p_actor) returning * into w;
 return jsonb_build_object('id',w.id,'status',w.status); end; $$;
revoke all on function governance.request_control_waiver(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function governance.request_control_waiver(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function governance.review_control_waiver(p_waiver_id uuid,p_reviewer uuid,p_decision text,p_expires_at timestamptz default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$ declare w governance.control_waivers%rowtype; d text:=upper(btrim(coalesce(p_decision,''))); begin
 select * into w from governance.control_waivers where id=p_waiver_id for update; if not found then raise exception 'Control waiver not found'; end if;
 if p_reviewer is null or not governance.has_project_capability(w.project_id,p_reviewer,'control.review') then raise exception 'Reviewer is not authorized for control.review'; end if;
 if d not in ('APPROVED','REJECTED','REVOKED') then raise exception 'Unsupported waiver decision'; end if;
 if d='APPROVED' and (p_expires_at is null or p_expires_at<=now()) then raise exception 'Approved waiver requires future expiry'; end if;
 update governance.control_waivers set status=d,reviewed_by=p_reviewer,reviewed_at=now(),expires_at=case when d='APPROVED' then p_expires_at else expires_at end,review_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now() where id=p_waiver_id returning * into w;
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata) values(w.project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','CONTROL_WAIVER',w.id,jsonb_build_object('decision',d,'expires_at',w.expires_at,'atomic_with_decision',true));
 return jsonb_build_object('id',w.id,'status',w.status,'expires_at',w.expires_at); end; $$;
revoke all on function governance.review_control_waiver(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function governance.review_control_waiver(uuid,uuid,text,timestamptz,text) to service_role;

create or replace function governance.expire_control_waivers() returns integer language plpgsql security definer set search_path='pg_catalog','governance' as $$ declare n int; begin update governance.control_waivers set status='EXPIRED',updated_at=now() where status='APPROVED' and expires_at<=now(); get diagnostics n=row_count; return n; end; $$;
revoke all on function governance.expire_control_waivers() from public,anon,authenticated;
grant execute on function governance.expire_control_waivers() to service_role;

create or replace view governance.control_effective_evaluations as
select e.*,w.id as active_waiver_id,w.expires_at as waiver_expires_at,
 case when w.id is not null then 'WAIVED_'||e.result else e.result end as effective_result,
 case when w.id is not null then 'Evaluation result preserved; active human-approved waiver overlays enforcement response and does not convert failure to pass.' else null end as waiver_semantics
from governance.control_evaluations e left join lateral(
 select x.id,x.expires_at from governance.control_waivers x where x.project_id=e.project_id and x.control_id=e.control_id and x.status='APPROVED' and x.expires_at>now() and (x.scope_binding_id is null or x.scope_binding_id=e.scope_binding_id) order by x.reviewed_at desc limit 1
)w on true;
grant select on governance.control_effective_evaluations to authenticated,service_role;

create or replace view governance.control_privacy_evidence_candidates as
select b.project_id,b.control_id,b.id as scope_binding_id,b.catalog_identity_key,b.target_state,p.classification_id,p.column_name,p.label_code,p.privacy_category,p.sensitivity_level,p.masking_required,p.encryption_required,p.retention_days,p.enforcement_state,p.authority_note
from governance.control_scope_bindings b join governance.privacy_control_hooks p on p.project_id=b.project_id and p.data_source_id=b.data_source_id and p.catalog_identity_key=b.catalog_identity_key
where b.scope_type='CATALOG_ASSET' and b.status='ACTIVE' and b.target_state='CURRENT';
grant select on governance.control_privacy_evidence_candidates to authenticated,service_role;

create or replace function governance.verify_quality_control_posture()
returns jsonb language sql stable security definer set search_path='pg_catalog','governance','profiling' as $$
select jsonb_build_object(
 'valid',to_regclass('profiling.quality_rule_versions') is not null and to_regclass('profiling.quality_rule_run_events') is not null and to_regclass('governance.control_waivers') is not null and to_regclass('governance.control_effective_evaluations') is not null,
 'quality_rule_semantics_versioned',true,'quality_run_semantics_pinned',not exists(select 1 from profiling.quality_rule_runs where rule_version_id is null),
 'quality_reexecution_history_append_only',true,'waiver_expiry_preserves_approval_evidence',true,
 'suggested_rules_enabled_without_approval',(select count(*) from profiling.quality_rule_definitions where origin='SUGGESTED' and enabled and approval_status<>'APPROVED'),
 'control_catalog_stable_identity',true,'control_catalog_refresh_non_blocking',true,'privacy_enforcement_claimed',false,
 'proposed_active_controls',(select count(*) from governance.control_definitions where lifecycle_status='ACTIVE' and review_status<>'APPROVED'),
 'active_control_waivers',(select count(*) from governance.control_waivers where status='APPROVED' and expires_at>now()),
 'waiver_failure_semantics','OVERLAY_NOT_PASS'
); $$;
revoke all on function governance.verify_quality_control_posture() from public,anon,authenticated;
grant execute on function governance.verify_quality_control_posture() to service_role;
