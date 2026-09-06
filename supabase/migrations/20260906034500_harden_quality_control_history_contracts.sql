-- Wave 2 release hardening: preserve exact semantics, actor provenance, immutable history, and stable catalog control targets.

-- The first Wave 2 migration installs the event trigger before legacy run backfill. Normalize only the
-- migration-generated events, identified by the explicit legacy provenance marker, before restoring immutability.
drop trigger if exists quality_rule_run_events_immutable on profiling.quality_rule_run_events;
delete from profiling.quality_rule_run_events e
where e.event_type='REEXECUTED'
  and e.run_snapshot->'evidence'->>'version_provenance'='LEGACY_BASELINE_CURRENT_DEFINITION';
insert into profiling.quality_rule_run_events(project_id,quality_rule_run_id,rule_definition_id,rule_version_id,event_type,run_snapshot)
select d.project_id,r.id,r.rule_definition_id,r.rule_version_id,'LEGACY_BASELINE_CAPTURED',
       jsonb_build_object('status',r.status,'passed',r.passed,'observed_value',r.observed_value,'threshold',r.threshold,
         'evidence',r.evidence,'error_message',r.error_message,'dataset_version_id',r.dataset_version_id,
         'profile_run_id',r.profile_run_id,'agent_run_id',r.agent_run_id,'started_at',r.started_at,'completed_at',r.completed_at)
from profiling.quality_rule_runs r
join profiling.quality_rule_definitions d on d.id=r.rule_definition_id
where r.evidence->>'version_provenance'='LEGACY_BASELINE_CURRENT_DEFINITION'
  and not exists(select 1 from profiling.quality_rule_run_events e where e.quality_rule_run_id=r.id);
create trigger quality_rule_run_events_immutable before update or delete on profiling.quality_rule_run_events
for each row execute function profiling.immutable_quality_evidence();

-- Historical quality evidence must prevent destructive parent deletes instead of disappearing by cascade.
alter table profiling.quality_rule_versions drop constraint if exists quality_rule_versions_rule_definition_id_fkey;
alter table profiling.quality_rule_versions add constraint quality_rule_versions_rule_definition_id_fkey
  foreign key(rule_definition_id) references profiling.quality_rule_definitions(id) on delete restrict;

alter table profiling.quality_rule_runs drop constraint if exists quality_rule_runs_rule_definition_id_fkey;
alter table profiling.quality_rule_runs add constraint quality_rule_runs_rule_definition_id_fkey
  foreign key(rule_definition_id) references profiling.quality_rule_definitions(id) on delete restrict;
alter table profiling.quality_rule_runs drop constraint if exists quality_rule_runs_dataset_version_id_fkey;
alter table profiling.quality_rule_runs add constraint quality_rule_runs_dataset_version_id_fkey
  foreign key(dataset_version_id) references catalog.dataset_versions(id) on delete restrict;

alter table profiling.quality_rule_definitions drop constraint if exists quality_rule_definitions_current_version_id_fkey;
alter table profiling.quality_rule_definitions add constraint quality_rule_definitions_current_version_id_fkey
  foreign key(current_version_id) references profiling.quality_rule_versions(id) on delete restrict;
alter table profiling.quality_rule_runs drop constraint if exists quality_rule_runs_rule_version_id_fkey;
alter table profiling.quality_rule_runs add constraint quality_rule_runs_rule_version_id_fkey
  foreign key(rule_version_id) references profiling.quality_rule_versions(id) on delete restrict;
alter table profiling.quality_rule_runs alter column rule_version_id set not null;

alter table profiling.quality_rule_run_events add constraint quality_rule_run_events_run_fkey
  foreign key(quality_rule_run_id) references profiling.quality_rule_runs(id) on delete restrict;
alter table profiling.quality_rule_run_events add constraint quality_rule_run_events_rule_fkey
  foreign key(rule_definition_id) references profiling.quality_rule_definitions(id) on delete restrict;
alter table profiling.quality_rule_run_events add constraint quality_rule_run_events_version_fkey
  foreign key(rule_version_id) references profiling.quality_rule_versions(id) on delete restrict;
alter table profiling.quality_rule_run_events alter column rule_version_id set not null;

alter table profiling.quality_rule_exceptions drop constraint if exists quality_rule_exceptions_quality_rule_run_id_fkey;
alter table profiling.quality_rule_exceptions add constraint quality_rule_exceptions_quality_rule_run_id_fkey
  foreign key(quality_rule_run_id) references profiling.quality_rule_runs(id) on delete restrict;
alter table profiling.quality_rule_exceptions drop constraint if exists quality_rule_exceptions_rule_definition_id_fkey;
alter table profiling.quality_rule_exceptions add constraint quality_rule_exceptions_rule_definition_id_fkey
  foreign key(rule_definition_id) references profiling.quality_rule_definitions(id) on delete restrict;
alter table profiling.quality_rule_exceptions drop constraint if exists quality_rule_exceptions_dataset_version_id_fkey;
alter table profiling.quality_rule_exceptions add constraint quality_rule_exceptions_dataset_version_id_fkey
  foreign key(dataset_version_id) references catalog.dataset_versions(id) on delete restrict;
alter table profiling.quality_rule_exception_events add constraint quality_rule_exception_events_exception_fkey
  foreign key(exception_id) references profiling.quality_rule_exceptions(id) on delete restrict;

-- A run is pinned exactly once. Re-execution updates state/evidence but cannot silently switch rule semantics.
create or replace function profiling.pin_quality_rule_run_version()
returns trigger language plpgsql security definer set search_path='pg_catalog','profiling' as $$
declare v uuid;
begin
  if tg_op='UPDATE' then
    if new.rule_definition_id is distinct from old.rule_definition_id then
      raise exception 'Executed quality rule identity is immutable; create a new run for a different rule';
    end if;
    if new.rule_version_id is distinct from old.rule_version_id then
      raise exception 'Executed quality rule version is immutable; create a new run for new semantics';
    end if;
    new.rule_version_id:=old.rule_version_id;
    new.evidence:=coalesce(new.evidence,'{}'::jsonb)||jsonb_build_object('rule_version_id',old.rule_version_id,'rule_semantics_pinned',true);
    return new;
  end if;
  select current_version_id into v from profiling.quality_rule_definitions where id=new.rule_definition_id;
  if v is null then v:=profiling.capture_quality_rule_version(new.rule_definition_id,'CAPTURED_ON_EXECUTION'); end if;
  if v is null then raise exception 'Quality rule semantics could not be pinned'; end if;
  new.rule_version_id:=v;
  new.evidence:=coalesce(new.evidence,'{}'::jsonb)||jsonb_build_object('rule_version_id',v,'rule_semantics_pinned',true);
  return new;
end; $$;
revoke all on function profiling.pin_quality_rule_run_version() from public,anon,authenticated,service_role;
drop trigger if exists quality_rule_run_pin_version on profiling.quality_rule_runs;
create trigger quality_rule_run_pin_version before insert or update on profiling.quality_rule_runs
for each row execute function profiling.pin_quality_rule_run_version();

-- Views exposed to browser roles must obey caller RLS rather than creator privileges.
alter view profiling.quality_rule_run_evidence set (security_invoker=true);
alter view governance.control_effective_evaluations set (security_invoker=true);
alter view governance.control_privacy_evidence_candidates set (security_invoker=true);

-- Human actor evidence must describe the actor for this transition. Automatic expiry is SYSTEM, not the stale approver.
alter table profiling.quality_rule_exception_events add column if not exists actor_type text not null default 'SYSTEM';
alter table profiling.quality_rule_exception_events drop constraint if exists quality_rule_exception_events_actor_type_check;
alter table profiling.quality_rule_exception_events add constraint quality_rule_exception_events_actor_type_check check(actor_type in ('SYSTEM','USER'));
create or replace function profiling.capture_quality_rule_exception_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','profiling' as $$
declare v_project uuid; v_actor uuid; v_actor_type text:='SYSTEM'; v_actor_text text;
begin
 select d.project_id into v_project from profiling.quality_rule_definitions d where d.id=new.rule_definition_id;
 v_actor_text:=nullif(current_setting('governance.quality_exception_actor',true),'');
 if v_actor_text is not null then v_actor:=v_actor_text::uuid; v_actor_type:='USER'; end if;
 insert into profiling.quality_rule_exception_events(project_id,exception_id,event_type,actor_user_id,actor_type,status,evidence)
 values(v_project,new.id,case when tg_op='INSERT' then 'OPENED' when new.status is distinct from old.status then new.status else 'UPDATED' end,
   v_actor,v_actor_type,new.status,jsonb_build_object('reason',new.reason,'waiver_reason',new.waiver_reason,'approved_by',new.approved_by,
   'approved_at',new.approved_at,'expires_at',new.expires_at,'resolution_notes',new.resolution_notes));
 return new; end; $$;
revoke all on function profiling.capture_quality_rule_exception_event() from public,anon,authenticated,service_role;

create or replace function governance.review_quality_rule_exception(p_exception_id uuid,p_reviewer uuid,p_decision text,p_reason text default null,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','profiling' as $$
declare v_project uuid; v_decision text:=upper(btrim(coalesce(p_decision,''))); r profiling.quality_rule_exceptions%rowtype;
begin
 select d.project_id into v_project from profiling.quality_rule_exceptions e join profiling.quality_rule_definitions d on d.id=e.rule_definition_id where e.id=p_exception_id;
 if v_project is null then raise exception 'Quality rule exception not found'; end if;
 if p_reviewer is null or not governance.has_project_capability(v_project,p_reviewer,'quality_rule.review') then raise exception 'Reviewer is not authorized for quality_rule.review'; end if;
 if v_decision not in ('WAIVED','REJECTED','RESOLVED','REVOKED') then raise exception 'Unsupported exception decision'; end if;
 if v_decision='WAIVED' and (nullif(btrim(coalesce(p_reason,'')),'') is null or p_expires_at is null or p_expires_at<=now()) then raise exception 'Waiver requires reason and a future expiry'; end if;
 perform set_config('governance.quality_exception_actor',p_reviewer::text,true);
 update profiling.quality_rule_exceptions set status=v_decision,
   waiver_reason=case when v_decision='WAIVED' then btrim(p_reason) else waiver_reason end,
   approved_by=case when v_decision='WAIVED' then p_reviewer else approved_by end,
   approved_at=case when v_decision='WAIVED' then now() else approved_at end,
   expires_at=case when v_decision='WAIVED' then p_expires_at else expires_at end,
   resolution_notes=case when v_decision in ('RESOLVED','REJECTED','REVOKED') then concat_ws(E'\n',nullif(resolution_notes,''),nullif(btrim(coalesce(p_reason,'')),'')) else resolution_notes end
 where id=p_exception_id returning * into r;
 perform set_config('governance.quality_exception_actor','',true);
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
 values(v_project,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','QUALITY_RULE_EXCEPTION',p_exception_id,
   jsonb_build_object('decision',v_decision,'expires_at',r.expires_at,'atomic_with_decision',true));
 return jsonb_build_object('id',r.id,'status',r.status,'approved_at',r.approved_at,'expires_at',r.expires_at); end; $$;
revoke all on function governance.review_quality_rule_exception(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function governance.review_quality_rule_exception(uuid,uuid,text,text,timestamptz) to service_role;

alter table governance.control_waiver_events add column if not exists actor_type text not null default 'SYSTEM';
alter table governance.control_waiver_events drop constraint if exists control_waiver_events_actor_type_check;
alter table governance.control_waiver_events add constraint control_waiver_events_actor_type_check check(actor_type in ('SYSTEM','USER'));
alter table governance.control_waiver_events add constraint control_waiver_events_waiver_fkey
  foreign key(waiver_id) references governance.control_waivers(id) on delete restrict;

create or replace function governance.capture_control_waiver_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v_actor uuid; v_actor_type text:='SYSTEM'; v_actor_text text;
begin
 v_actor_text:=nullif(current_setting('governance.control_waiver_actor',true),'');
 if v_actor_text is not null then v_actor:=v_actor_text::uuid; v_actor_type:='USER'; end if;
 insert into governance.control_waiver_events(project_id,waiver_id,event_type,actor_user_id,actor_type,status,evidence)
 values(new.project_id,new.id,case when tg_op='INSERT' then 'REQUESTED' when new.status is distinct from old.status then new.status else 'UPDATED' end,
   v_actor,v_actor_type,new.status,jsonb_build_object('control_id',new.control_id,'scope_binding_id',new.scope_binding_id,'reason',new.reason,
   'reviewed_by',new.reviewed_by,'reviewed_at',new.reviewed_at,'expires_at',new.expires_at,'review_note',new.review_note));
 return new; end; $$;
revoke all on function governance.capture_control_waiver_event() from public,anon,authenticated,service_role;

create or replace function governance.request_control_waiver(p_project_id uuid,p_control_id uuid,p_scope_binding_id uuid,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$ declare w governance.control_waivers%rowtype; begin
 if p_actor is null or not app_private.is_project_member(p_project_id,p_actor) then raise exception 'Requester is not a project member'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Waiver reason is required'; end if;
 if not exists(select 1 from governance.control_definitions where id=p_control_id and project_id=p_project_id and lifecycle_status='ACTIVE' and review_status='APPROVED') then raise exception 'Only approved active controls can be waived'; end if;
 if p_scope_binding_id is not null and not exists(select 1 from governance.control_scope_bindings where id=p_scope_binding_id and project_id=p_project_id and control_id=p_control_id and status='ACTIVE') then raise exception 'Scope binding not valid and active for control'; end if;
 perform set_config('governance.control_waiver_actor',p_actor::text,true);
 insert into governance.control_waivers(project_id,control_id,scope_binding_id,reason,requested_by) values(p_project_id,p_control_id,p_scope_binding_id,btrim(p_reason),p_actor) returning * into w;
 perform set_config('governance.control_waiver_actor','',true);
 return jsonb_build_object('id',w.id,'status',w.status); end; $$;
revoke all on function governance.request_control_waiver(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function governance.request_control_waiver(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function governance.review_control_waiver(p_waiver_id uuid,p_reviewer uuid,p_decision text,p_expires_at timestamptz default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$ declare w governance.control_waivers%rowtype; d text:=upper(btrim(coalesce(p_decision,''))); begin
 select * into w from governance.control_waivers where id=p_waiver_id for update; if not found then raise exception 'Control waiver not found'; end if;
 if p_reviewer is null or not governance.has_project_capability(w.project_id,p_reviewer,'control.review') then raise exception 'Reviewer is not authorized for control.review'; end if;
 if d not in ('APPROVED','REJECTED','REVOKED') then raise exception 'Unsupported waiver decision'; end if;
 if d='APPROVED' and (p_expires_at is null or p_expires_at<=now()) then raise exception 'Approved waiver requires future expiry'; end if;
 if d='APPROVED' and not exists(select 1 from governance.control_definitions c where c.id=w.control_id and c.project_id=w.project_id and c.lifecycle_status='ACTIVE' and c.review_status='APPROVED') then raise exception 'Only approved active controls can receive an approved waiver'; end if;
 perform set_config('governance.control_waiver_actor',p_reviewer::text,true);
 update governance.control_waivers set status=d,reviewed_by=p_reviewer,reviewed_at=now(),expires_at=case when d='APPROVED' then p_expires_at else expires_at end,
   review_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now() where id=p_waiver_id returning * into w;
 perform set_config('governance.control_waiver_actor','',true);
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
 values(w.project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','CONTROL_WAIVER',w.id,
   jsonb_build_object('decision',d,'expires_at',w.expires_at,'atomic_with_decision',true));
 return jsonb_build_object('id',w.id,'status',w.status,'expires_at',w.expires_at); end; $$;
revoke all on function governance.review_control_waiver(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function governance.review_control_waiver(uuid,uuid,text,timestamptz,text) to service_role;

-- Stable catalog identity is authoritative; physical discovered_asset_id is only the current locator and becomes null while stale.
alter table governance.control_scope_bindings drop constraint if exists control_scope_bindings_data_source_id_fkey;
alter table governance.control_scope_bindings add constraint control_scope_bindings_data_source_id_fkey
  foreign key(data_source_id) references catalog.data_sources(id) on delete restrict;
create unique index if not exists control_scope_catalog_active_unique
  on governance.control_scope_bindings(project_id,control_id,data_source_id,catalog_identity_key)
  where scope_type='CATALOG_ASSET' and status='ACTIVE';

create or replace function governance.refresh_control_catalog_scope_validity(p_source_id uuid default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','catalog' as $$
declare r record; a catalog.discovered_assets%rowtype; cur int:=0; stale int:=0;
begin
 for r in select * from governance.control_scope_bindings where scope_type='CATALOG_ASSET' and (p_source_id is null or data_source_id=p_source_id) loop
   select x.* into a from catalog.discovered_assets x join catalog.data_sources s on s.id=x.source_id
   where x.source_id=r.data_source_id and x.identity_key=r.catalog_identity_key and x.is_current and s.project_id=r.project_id
   order by x.version_number desc limit 1;
   if found then
     update governance.control_scope_bindings set discovered_asset_id=a.id,target_locator=a.asset_key,target_state='CURRENT',updated_at=now()
     where id=r.id and (target_state<>'CURRENT' or discovered_asset_id is distinct from a.id or target_locator is distinct from a.asset_key); cur:=cur+1;
   else
     update governance.control_scope_bindings set discovered_asset_id=null,target_state='STALE',updated_at=now()
     where id=r.id and (target_state<>'STALE' or discovered_asset_id is not null); stale:=stale+1;
   end if;
 end loop;
 return jsonb_build_object('current',cur,'stale',stale); end; $$;
revoke all on function governance.refresh_control_catalog_scope_validity(uuid) from public,anon,authenticated;
grant execute on function governance.refresh_control_catalog_scope_validity(uuid) to service_role;

-- Authoritative binding requires an accountable, governed approval decision, not merely mutable status labels.
create or replace function governance.bind_governance_control_catalog_scope(p_project_id uuid,p_control_id uuid,p_actor uuid,p_data_source_id uuid,p_catalog_identity_key text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare c governance.control_definitions%rowtype; b governance.control_scope_bindings%rowtype;
begin
 if p_actor is null or not governance.has_project_capability(p_project_id,p_actor,'control.review') then raise exception 'Actor is not authorized for control.review'; end if;
 select * into c from governance.control_definitions where id=p_control_id and project_id=p_project_id;
 if not found or c.lifecycle_status<>'ACTIVE' or c.review_status<>'APPROVED' or c.reviewed_by is null or c.reviewed_at is null or c.authority_class='UNVERIFIED' then
   raise exception 'Only governed, reviewed, approved active controls can receive authoritative catalog scope';
 end if;
 insert into governance.control_scope_bindings(project_id,control_id,scope_type,scope_key,status,metadata,data_source_id,catalog_identity_key,target_state)
 values(p_project_id,p_control_id,'CATALOG_ASSET','catalog_identity:'||p_catalog_identity_key,'ACTIVE',coalesce(p_metadata,'{}'::jsonb),p_data_source_id,p_catalog_identity_key,'CURRENT') returning * into b;
 insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
 values(p_project_id,p_actor,'USER','GOVERNANCE_CONTROL_SCOPE_BOUND','CONTROL_SCOPE_BINDING',b.id,
   jsonb_build_object('control_id',p_control_id,'scope_type','CATALOG_ASSET','catalog_identity_key',p_catalog_identity_key,'stable_identity',true,
     'control_reviewed_by',c.reviewed_by,'control_reviewed_at',c.reviewed_at,'authority_class',c.authority_class));
 return jsonb_build_object('id',b.id,'target_state',b.target_state,'target_locator',b.target_locator); end; $$;
revoke all on function governance.bind_governance_control_catalog_scope(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function governance.bind_governance_control_catalog_scope(uuid,uuid,uuid,uuid,text,jsonb) to service_role;

-- Posture verification reports computed invariants rather than hard-coded assurances.
create or replace function governance.verify_quality_control_posture()
returns jsonb language sql stable security definer set search_path='pg_catalog','governance','profiling' as $$
with checks as (
 select
  not exists(select 1 from profiling.quality_rule_runs where rule_version_id is null) as runs_pinned,
  not exists(select 1 from profiling.quality_rule_definitions where origin='SUGGESTED' and enabled and approval_status<>'APPROVED') as suggestions_guarded,
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='profiling' and c.relname='quality_rule_versions' and t.tgname='quality_rule_versions_immutable' and not t.tgisinternal) as versions_immutable,
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='profiling' and c.relname='quality_rule_run_events' and t.tgname='quality_rule_run_events_immutable' and not t.tgisinternal) as run_events_immutable,
  exists(select 1 from pg_indexes where schemaname='governance' and indexname='control_scope_catalog_active_unique') as catalog_binding_unique,
  not exists(select 1 from governance.control_scope_bindings b join catalog.data_sources s on s.id=b.data_source_id where b.scope_type='CATALOG_ASSET' and b.project_id<>s.project_id) as catalog_project_consistent,
  not exists(select 1 from governance.control_definitions where lifecycle_status='ACTIVE' and review_status<>'APPROVED') as active_controls_approved,
  not exists(select 1 from governance.control_waivers where status='APPROVED' and (expires_at is null or expires_at<=now())) as waivers_unexpired
)
select jsonb_build_object(
 'valid',runs_pinned and suggestions_guarded and versions_immutable and run_events_immutable and catalog_binding_unique and catalog_project_consistent and active_controls_approved and waivers_unexpired,
 'quality_run_semantics_pinned',runs_pinned,'suggested_rule_authority_guarded',suggestions_guarded,
 'quality_rule_versions_append_only',versions_immutable,'quality_reexecution_history_append_only',run_events_immutable,
 'control_catalog_stable_identity_unique',catalog_binding_unique,'control_catalog_project_consistent',catalog_project_consistent,
 'active_controls_approved',active_controls_approved,'waivers_unexpired',waivers_unexpired,
 'suggested_rules_enabled_without_approval',(select count(*) from profiling.quality_rule_definitions where origin='SUGGESTED' and enabled and approval_status<>'APPROVED'),
 'active_control_waivers',(select count(*) from governance.control_waivers where status='APPROVED' and expires_at>now()),
 'waiver_failure_semantics','OVERLAY_NOT_PASS'
) from checks; $$;
revoke all on function governance.verify_quality_control_posture() from public,anon,authenticated;
grant execute on function governance.verify_quality_control_posture() to service_role;
