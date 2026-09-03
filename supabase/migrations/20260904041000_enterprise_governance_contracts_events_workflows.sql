alter table profiling.observability_alerts drop constraint if exists observability_alerts_category_check;
alter table profiling.observability_alerts add constraint observability_alerts_category_check
check(category in ('QUALITY_SCORE_DROP','SCHEMA_DRIFT','VOLUME_CHANGE','QUALITY_RULE_FAILURE','PROFILE_FAILURE','FRESHNESS','DATA_CONTRACT'));

alter table profiling.quality_rule_exceptions drop constraint if exists quality_rule_exceptions_status_check;
alter table profiling.quality_rule_exceptions add constraint quality_rule_exceptions_status_check
check(status in ('OPEN','WAIVED','RESOLVED','REJECTED'));

create or replace function governance.invalidate_dataset_certification(p_dataset_id uuid,p_reason text,p_evidence jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,governance
as $$
declare v_changed boolean := false;
begin
  update governance.dataset_catalog
  set certification_status='EXPIRED',
      certified_at=null,
      certified_by=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'certification_invalidated_at',now(),
        'certification_invalidation_reason',p_reason,
        'certification_invalidation_evidence',coalesce(p_evidence,'{}'::jsonb)
      ),
      updated_at=now()
  where dataset_id=p_dataset_id and certification_status='CERTIFIED';
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;
revoke execute on function governance.invalidate_dataset_certification(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function governance.invalidate_dataset_certification(uuid,text,jsonb) to service_role;

create or replace function governance.evaluate_data_contract(p_profile_run_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,governance,profiling,catalog
as $$
declare
  v_run profiling.profile_runs%rowtype;
  v_dataset_id uuid;
  v_project_id uuid;
  v_contract governance.data_contracts%rowtype;
  v_version governance.data_contract_versions%rowtype;
  v_score profiling.data_quality_scores%rowtype;
  v_checks jsonb := '{}'::jsonb;
  v_failed boolean := false;
  v_min numeric;
  v_fingerprint text;
  v_result jsonb;
begin
  select * into v_run from profiling.profile_runs where id=p_profile_run_id;
  if not found then return jsonb_build_object('status','ERROR','error','profile run not found'); end if;

  select d.id,d.project_id into v_dataset_id,v_project_id
  from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id
  where dv.id=v_run.dataset_version_id;
  if v_dataset_id is null then return jsonb_build_object('status','ERROR','error','dataset not found'); end if;

  select * into v_contract from governance.data_contracts where dataset_id=v_dataset_id and status='ACTIVE' limit 1;
  if not found then return jsonb_build_object('status','NO_CONTRACT','dataset_id',v_dataset_id); end if;

  select * into v_version from governance.data_contract_versions
  where contract_id=v_contract.id and status='ACTIVE'
  order by version_number desc limit 1;
  if not found then return jsonb_build_object('status','NO_ACTIVE_VERSION','contract_id',v_contract.id); end if;

  select * into v_score from profiling.data_quality_scores where profile_run_id=p_profile_run_id limit 1;

  if v_version.schema_hash is not null then
    v_checks := v_checks || jsonb_build_object('schema_hash',jsonb_build_object('expected',v_version.schema_hash,'observed',v_run.schema_hash,'passed',v_run.schema_hash=v_version.schema_hash));
    if v_run.schema_hash is distinct from v_version.schema_hash then v_failed:=true; end if;
  end if;

  if v_version.row_count_min is not null then
    v_checks := v_checks || jsonb_build_object('row_count_min',jsonb_build_object('expected',v_version.row_count_min,'observed',v_run.row_count,'passed',coalesce(v_run.row_count>=v_version.row_count_min,false)));
    if v_run.row_count is null or v_run.row_count<v_version.row_count_min then v_failed:=true; end if;
  end if;
  if v_version.row_count_max is not null then
    v_checks := v_checks || jsonb_build_object('row_count_max',jsonb_build_object('expected',v_version.row_count_max,'observed',v_run.row_count,'passed',coalesce(v_run.row_count<=v_version.row_count_max,false)));
    if v_run.row_count is null or v_run.row_count>v_version.row_count_max then v_failed:=true; end if;
  end if;

  v_min := nullif(v_version.quality_requirements->>'min_overall_score','')::numeric;
  if v_min is not null then
    v_checks := v_checks || jsonb_build_object('overall_score',jsonb_build_object('expected_min',v_min,'observed',v_score.overall_score,'passed',coalesce(v_score.overall_score>=v_min,false)));
    if v_score.overall_score is null or v_score.overall_score<v_min then v_failed:=true; end if;
  end if;
  v_min := nullif(v_version.quality_requirements->>'min_completeness_score','')::numeric;
  if v_min is not null then
    v_checks := v_checks || jsonb_build_object('completeness_score',jsonb_build_object('expected_min',v_min,'observed',v_score.completeness_score,'passed',coalesce(v_score.completeness_score>=v_min,false)));
    if v_score.completeness_score is null or v_score.completeness_score<v_min then v_failed:=true; end if;
  end if;
  v_min := nullif(v_version.quality_requirements->>'min_uniqueness_score','')::numeric;
  if v_min is not null then
    v_checks := v_checks || jsonb_build_object('uniqueness_score',jsonb_build_object('expected_min',v_min,'observed',v_score.uniqueness_score,'passed',coalesce(v_score.uniqueness_score>=v_min,false)));
    if v_score.uniqueness_score is null or v_score.uniqueness_score<v_min then v_failed:=true; end if;
  end if;
  v_min := nullif(v_version.quality_requirements->>'min_validity_score','')::numeric;
  if v_min is not null then
    v_checks := v_checks || jsonb_build_object('validity_score',jsonb_build_object('expected_min',v_min,'observed',v_score.validity_score,'passed',coalesce(v_score.validity_score>=v_min,false)));
    if v_score.validity_score is null or v_score.validity_score<v_min then v_failed:=true; end if;
  end if;

  insert into governance.data_contract_evaluations(project_id,contract_id,contract_version_id,dataset_id,profile_run_id,status,checks)
  values(v_project_id,v_contract.id,v_version.id,v_dataset_id,p_profile_run_id,case when v_failed then 'FAILED' else 'PASSED' end,v_checks)
  on conflict(contract_version_id,profile_run_id) do update set status=excluded.status,checks=excluded.checks,evaluated_at=now();

  v_fingerprint := 'data-contract:'||v_dataset_id::text;
  if v_failed then
    insert into profiling.observability_alerts(project_id,dataset_id,dataset_version_id,profile_run_id,category,severity,title,description,fingerprint,evidence,status,first_observed_at,last_observed_at,updated_at)
    values(v_project_id,v_dataset_id,v_run.dataset_version_id,p_profile_run_id,'DATA_CONTRACT','HIGH',
      'Data contract validation failed','One or more active data contract expectations failed on the latest profiling evidence.',
      v_fingerprint,jsonb_build_object('contract_id',v_contract.id,'contract_version_id',v_version.id,'checks',v_checks),'OPEN',now(),now(),now())
    on conflict(project_id,fingerprint) do update set dataset_version_id=excluded.dataset_version_id,profile_run_id=excluded.profile_run_id,severity='HIGH',
      title=excluded.title,description=excluded.description,evidence=excluded.evidence,status='OPEN',last_observed_at=now(),resolved_at=null,updated_at=now();
    perform governance.invalidate_dataset_certification(v_dataset_id,'DATA_CONTRACT_FAILED',jsonb_build_object('profile_run_id',p_profile_run_id,'checks',v_checks));
  else
    update profiling.observability_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
    where project_id=v_project_id and fingerprint=v_fingerprint and status<>'RESOLVED';
  end if;

  v_result := jsonb_build_object('status',case when v_failed then 'FAILED' else 'PASSED' end,'contract_id',v_contract.id,'contract_version_id',v_version.id,'checks',v_checks);
  return v_result;
end;
$$;
revoke execute on function governance.evaluate_data_contract(uuid) from public,anon,authenticated;
grant execute on function governance.evaluate_data_contract(uuid) to service_role;

create or replace function governance.start_workflow(p_definition_id uuid,p_entity_type text,p_entity_id uuid,p_started_by uuid,p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,governance
as $$
declare v_def governance.workflow_definitions%rowtype; v_id uuid;
begin
  select * into v_def from governance.workflow_definitions where id=p_definition_id and enabled=true;
  if not found then raise exception 'Workflow definition is unavailable'; end if;
  insert into governance.workflow_instances(project_id,workflow_definition_id,entity_type,entity_id,status,current_step,context,started_by)
  values(v_def.project_id,v_def.id,p_entity_type,p_entity_id,'RUNNING',0,coalesce(p_context,'{}'::jsonb),p_started_by)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function governance.act_workflow(p_instance_id uuid,p_actor_user_id uuid,p_action text,p_notes text default null,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,governance
as $$
declare v_instance governance.workflow_instances%rowtype; v_def governance.workflow_definitions%rowtype; v_step_count integer; v_next integer; v_status text;
begin
  select * into v_instance from governance.workflow_instances where id=p_instance_id for update;
  if not found then raise exception 'Workflow instance not found'; end if;
  if v_instance.status<>'RUNNING' then raise exception 'Workflow instance is not active'; end if;
  select * into v_def from governance.workflow_definitions where id=v_instance.workflow_definition_id;
  v_step_count := jsonb_array_length(coalesce(v_def.steps,'[]'::jsonb));
  insert into governance.workflow_actions(workflow_instance_id,step_index,action,actor_user_id,notes,evidence)
  values(v_instance.id,v_instance.current_step,upper(p_action),p_actor_user_id,p_notes,coalesce(p_evidence,'{}'::jsonb));
  if upper(p_action)='REJECT' then v_status:='REJECTED'; v_next:=v_instance.current_step;
  elsif upper(p_action)='CANCEL' then v_status:='CANCELLED'; v_next:=v_instance.current_step;
  elsif upper(p_action)='APPROVE' then v_next:=v_instance.current_step+1; v_status:=case when v_next>=v_step_count then 'APPROVED' else 'RUNNING' end;
  else v_next:=v_instance.current_step; v_status:='RUNNING'; end if;
  update governance.workflow_instances set status=v_status,current_step=v_next,completed_at=case when v_status<>'RUNNING' then now() else null end where id=v_instance.id;
  return jsonb_build_object('instance_id',v_instance.id,'status',v_status,'current_step',v_next,'step_count',v_step_count);
end;
$$;
revoke execute on function governance.start_workflow(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke execute on function governance.act_workflow(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function governance.start_workflow(uuid,text,uuid,uuid,jsonb) to service_role;
grant execute on function governance.act_workflow(uuid,uuid,text,text,jsonb) to service_role;

create or replace function governance.on_dataset_version_governance()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,catalog,orchestration
as $$
declare v_project uuid;
begin
  select project_id into v_project from catalog.datasets where id=new.dataset_id;
  if new.version_number>1 then
    perform governance.invalidate_dataset_certification(new.dataset_id,'DATASET_VERSION_CHANGED',jsonb_build_object('dataset_version_id',new.id,'version_number',new.version_number));
  end if;
  if v_project is not null then
    perform orchestration.emit_event(v_project,'DATASET_VERSION_CREATED','DATASET_VERSION',new.id,'DATASET_VERSION_CREATED:'||new.id::text,jsonb_build_object('dataset_id',new.dataset_id,'dataset_version_id',new.id,'version_number',new.version_number));
  end if;
  return new;
end;
$$;
drop trigger if exists governance_dataset_version_created on catalog.dataset_versions;
create trigger governance_dataset_version_created after insert on catalog.dataset_versions for each row execute function governance.on_dataset_version_governance();

create or replace function governance.on_profile_run_completed()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,profiling,catalog,orchestration
as $$
declare v_dataset uuid; v_project uuid;
begin
  if new.status='COMPLETED' and old.status is distinct from new.status then
    select d.id,d.project_id into v_dataset,v_project from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id where dv.id=new.dataset_version_id;
    if v_project is not null then
      perform orchestration.emit_event(v_project,'PROFILE_COMPLETED','PROFILE_RUN',new.id,'PROFILE_COMPLETED:'||new.id::text,jsonb_build_object('profile_run_id',new.id,'dataset_version_id',new.dataset_version_id,'dataset_id',v_dataset));
      perform governance.evaluate_data_contract(new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists governance_profile_run_completed on profiling.profile_runs;
create trigger governance_profile_run_completed after update of status on profiling.profile_runs for each row execute function governance.on_profile_run_completed();

create or replace function governance.on_quality_rule_outcome()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,profiling,catalog,orchestration
as $$
declare v_dataset uuid; v_project uuid; v_severity text;
begin
  select d.id,d.project_id,r.severity into v_dataset,v_project,v_severity
  from profiling.quality_rule_definitions r join catalog.datasets d on d.id=r.dataset_id where r.id=new.rule_definition_id;
  if v_project is not null then
    perform orchestration.emit_event(v_project,'QUALITY_RULE_EVALUATED','QUALITY_RULE_RUN',new.id,'QUALITY_RULE_EVALUATED:'||new.id::text,
      jsonb_build_object('quality_rule_run_id',new.id,'profile_run_id',new.profile_run_id,'dataset_version_id',new.dataset_version_id,'dataset_id',v_dataset,'status',new.status,'severity',v_severity));
  end if;
  if new.status='FAILED' and v_severity in ('HIGH','CRITICAL') then
    perform governance.invalidate_dataset_certification(v_dataset,'HIGH_SEVERITY_QUALITY_FAILURE',jsonb_build_object('quality_rule_run_id',new.id,'severity',v_severity));
  end if;
  return new;
end;
$$;
drop trigger if exists governance_quality_rule_outcome on profiling.quality_rule_runs;
create trigger governance_quality_rule_outcome after insert on profiling.quality_rule_runs for each row execute function governance.on_quality_rule_outcome();

create or replace function governance.on_observability_alert_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,profiling,orchestration
as $$
begin
  if new.status='OPEN' and (tg_op='INSERT' or old.status is distinct from new.status or old.last_observed_at is distinct from new.last_observed_at) then
    perform orchestration.emit_event(new.project_id,'OBSERVABILITY_ALERT_OPENED','OBSERVABILITY_ALERT',new.id,'OBSERVABILITY_ALERT:'||new.id::text||':'||extract(epoch from new.last_observed_at)::bigint::text,
      jsonb_build_object('alert_id',new.id,'dataset_id',new.dataset_id,'profile_run_id',new.profile_run_id,'category',new.category,'severity',new.severity));
    if new.category='SCHEMA_DRIFT' and new.severity in ('HIGH','CRITICAL') then
      perform governance.invalidate_dataset_certification(new.dataset_id,'SCHEMA_DRIFT',jsonb_build_object('alert_id',new.id,'severity',new.severity));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists governance_observability_alert_event on profiling.observability_alerts;
create trigger governance_observability_alert_event after insert or update on profiling.observability_alerts for each row execute function governance.on_observability_alert_event();

create or replace function governance.on_stewardship_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance
as $$
declare v_dataset uuid := coalesce(new.dataset_id,old.dataset_id); v_required integer;
begin
  select count(*) into v_required from governance.stewardship_assignments where dataset_id=v_dataset and active=true and role in ('BUSINESS_OWNER','DATA_STEWARD');
  if v_required=0 then perform governance.invalidate_dataset_certification(v_dataset,'STEWARDSHIP_GAP',jsonb_build_object('dataset_id',v_dataset)); end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists governance_stewardship_change on governance.stewardship_assignments;
create trigger governance_stewardship_change after update or delete on governance.stewardship_assignments for each row execute function governance.on_stewardship_change();

revoke execute on function governance.on_dataset_version_governance() from public,anon,authenticated;
revoke execute on function governance.on_profile_run_completed() from public,anon,authenticated;
revoke execute on function governance.on_quality_rule_outcome() from public,anon,authenticated;
revoke execute on function governance.on_observability_alert_event() from public,anon,authenticated;
revoke execute on function governance.on_stewardship_change() from public,anon,authenticated;
grant execute on function governance.on_dataset_version_governance(),governance.on_profile_run_completed(),governance.on_quality_rule_outcome(),governance.on_observability_alert_event(),governance.on_stewardship_change() to service_role;

select pg_notify('pgrst','reload schema');
