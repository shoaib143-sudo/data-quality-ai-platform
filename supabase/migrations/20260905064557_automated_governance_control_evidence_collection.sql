create or replace function governance.protect_automated_control_evidence_key()
returns trigger
language plpgsql
set search_path=''
as $function$
declare
  v_context boolean := coalesce(pg_catalog.current_setting('governance.control_evidence_collector_context', true),'')='true';
begin
  if left(coalesce(new.evidence_key,''),5)='AUTO:' and not v_context then
    raise exception 'AUTO: governance control evidence keys are reserved for the authoritative evidence collector';
  end if;
  return new;
end;
$function$;

revoke execute on function governance.protect_automated_control_evidence_key() from public, anon, authenticated;

drop trigger if exists trg_protect_automated_control_evidence_key on governance.control_evidence;
create trigger trg_protect_automated_control_evidence_key
before insert or update of evidence_key on governance.control_evidence
for each row execute function governance.protect_automated_control_evidence_key();

create or replace function governance.refresh_governance_control_evidence(
  p_project_id uuid,
  p_control_id uuid,
  p_scope_binding_id uuid default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_control governance.control_definitions%rowtype;
  v_scope governance.control_scope_bindings%rowtype;
  v_scope_type text := 'PROJECT';
  v_scope_id uuid;
  v_scope_key text;
  v_type text;
  v_key text;
  v_count integer;
  v_latest timestamptz;
  v_payload jsonb;
  v_hash text;
  v_source_table text;
  v_existing governance.control_evidence%rowtype;
  v_existing_found boolean := false;
  v_changed integer := 0;
  v_collected integer := 0;
  v_superseded integer := 0;
  v_unchanged integer := 0;
  v_cde_key text;
begin
  select * into v_control
  from governance.control_definitions
  where id=p_control_id and project_id=p_project_id;
  if not found then raise exception 'Governance control was not found in this project'; end if;
  if v_control.lifecycle_status<>'ACTIVE' or v_control.review_status<>'APPROVED' then
    raise exception 'Automated evidence collection only runs for active approved controls';
  end if;
  if v_control.evaluation_method<>'EVIDENCE_ASSERTION' then
    raise exception 'Automated evidence collection requires an EVIDENCE_ASSERTION control';
  end if;
  if p_actor is not null and not governance.has_project_capability(p_project_id,p_actor,'agent.execute') then
    raise exception 'Actor is not authorized for agent.execute in this project';
  end if;
  if jsonb_typeof(coalesce(v_control.definition->'assertion'->'evidenceTypes','[]'::jsonb))<>'array' then
    raise exception 'Control definition does not contain assertion.evidenceTypes';
  end if;

  if p_scope_binding_id is not null then
    select * into v_scope
    from governance.control_scope_bindings
    where id=p_scope_binding_id and project_id=p_project_id and control_id=p_control_id and status='ACTIVE';
    if not found then raise exception 'Active scope binding was not found for this control'; end if;
    v_scope_type := v_scope.scope_type;
    v_scope_id := v_scope.scope_id;
    v_scope_key := v_scope.scope_key;
  else
    v_scope_id := p_project_id;
  end if;

  if v_scope_type='CDE' and v_scope_id is not null then
    select cde_key into v_cde_key from governance.critical_data_elements
    where id=v_scope_id and project_id=p_project_id;
  end if;

  for v_type in select distinct upper(value) from jsonb_array_elements_text(v_control.definition->'assertion'->'evidenceTypes')
  loop
    v_count := 0;
    v_latest := null;
    v_source_table := null;

    if v_type='CDE' then
      v_source_table := 'governance.critical_data_elements';
      select count(*)::integer,max(c.updated_at) into v_count,v_latest
      from governance.critical_data_elements c
      where c.project_id=p_project_id and c.status='ACTIVE'
        and (v_scope_type='PROJECT'
          or (v_scope_type='CDE' and c.id=v_scope_id)
          or (v_scope_type='DATASET' and exists(select 1 from governance.cde_mappings m where m.project_id=p_project_id and m.cde_id=c.id and m.dataset_id=v_scope_id and m.status='APPROVED'))
          or (v_scope_type='DOMAIN' and lower(coalesce(c.domain,''))=lower(coalesce(v_scope_key,''))));
    elsif v_type='GLOSSARY' then
      v_source_table := 'governance.glossary_terms';
      select count(*)::integer,max(t.updated_at) into v_count,v_latest
      from governance.glossary_terms t
      where t.project_id=p_project_id and t.status='ACTIVE'
        and (v_scope_type='PROJECT'
          or (v_scope_type='GLOSSARY_TERM' and t.id=v_scope_id)
          or (v_scope_type='DATASET' and exists(select 1 from governance.glossary_mappings gm where gm.term_id=t.id and gm.dataset_id=v_scope_id and gm.approved=true))
          or (v_scope_type='DOMAIN' and lower(coalesce(t.domain,''))=lower(coalesce(v_scope_key,''))));
    elsif v_type='STEWARDSHIP' then
      v_source_table := 'governance.accountability_assignments';
      select count(*)::integer,max(a.updated_at) into v_count,v_latest
      from governance.accountability_assignments a
      where a.project_id=p_project_id and a.status='ACTIVE'
        and (v_scope_type='PROJECT'
          or (v_scope_type='DATASET' and a.scope_type='DATASET' and a.scope_key=v_scope_id::text)
          or (v_scope_type='CDE' and a.scope_type='CDE' and a.scope_key in (v_scope_id::text,coalesce(v_cde_key,'')))
          or (v_scope_type='DOMAIN' and a.scope_type='DOMAIN' and lower(a.scope_key)=lower(coalesce(v_scope_key,''))));
    elsif v_type='ATTESTATION' then
      v_source_table := 'governance.audit_events';
      select count(*)::integer,max(a.created_at) into v_count,v_latest
      from governance.audit_events a
      where a.project_id=p_project_id and a.event_type ilike '%ATTEST%'
        and (v_scope_type='PROJECT'
          or (v_scope_id is not null and a.entity_id=v_scope_id)
          or (v_scope_key is not null and coalesce(a.metadata->>'scope_key','')=v_scope_key));
    elsif v_type='AUDIT' then
      v_source_table := 'governance.audit_events';
      select count(*)::integer,max(a.created_at) into v_count,v_latest
      from governance.audit_events a
      where a.project_id=p_project_id and a.event_type not like 'GOVERNANCE_CONTROL_%'
        and (v_scope_type='PROJECT'
          or (v_scope_id is not null and a.entity_id=v_scope_id)
          or (v_scope_id is not null and coalesce(a.metadata->>'dataset_id','')=v_scope_id::text)
          or (v_scope_key is not null and coalesce(a.metadata->>'scope_key','')=v_scope_key));
    elsif v_type='CLASSIFICATION' then
      v_source_table := 'governance.dataset_classifications';
      select count(*)::integer,max(dc.updated_at) into v_count,v_latest
      from governance.dataset_classifications dc
      join catalog.datasets d on d.id=dc.dataset_id and d.project_id=dc.project_id
      where dc.project_id=p_project_id and dc.status='APPROVED'
        and (v_scope_type='PROJECT'
          or (v_scope_type='DATASET' and dc.dataset_id=v_scope_id)
          or (v_scope_type='DOMAIN' and lower(coalesce(d.business_domain,''))=lower(coalesce(v_scope_key,'')))
          or (v_scope_type='CDE' and exists(select 1 from governance.cde_mappings cm where cm.project_id=p_project_id and cm.cde_id=v_scope_id and cm.dataset_id=dc.dataset_id and cm.status='APPROVED' and (dc.column_name is null or cm.column_name is null or lower(dc.column_name)=lower(cm.column_name)))));
    elsif v_type='LINEAGE' then
      v_source_table := 'governance.lineage_column_mappings';
      select count(*)::integer,max(lm.created_at) into v_count,v_latest
      from governance.lineage_column_mappings lm
      left join governance.lineage_assets sa on sa.id=lm.source_asset_id and sa.project_id=lm.project_id
      left join governance.lineage_assets ta on ta.id=lm.target_asset_id and ta.project_id=lm.project_id
      left join catalog.datasets sd on sd.id=sa.dataset_id and sd.project_id=lm.project_id
      left join catalog.datasets td on td.id=ta.dataset_id and td.project_id=lm.project_id
      where lm.project_id=p_project_id
        and (v_scope_type='PROJECT'
          or (v_scope_type='LINEAGE_ASSET' and (lm.source_asset_id=v_scope_id or lm.target_asset_id=v_scope_id))
          or (v_scope_type='DATASET' and (sa.dataset_id=v_scope_id or ta.dataset_id=v_scope_id))
          or (v_scope_type='DOMAIN' and (lower(coalesce(sd.business_domain,''))=lower(coalesce(v_scope_key,'')) or lower(coalesce(td.business_domain,''))=lower(coalesce(v_scope_key,''))))
          or (v_scope_type='CDE' and exists(select 1 from governance.cde_mappings cm where cm.project_id=p_project_id and cm.cde_id=v_scope_id and cm.status='APPROVED' and ((cm.dataset_id=sa.dataset_id and (cm.column_name is null or lower(cm.column_name)=lower(lm.source_column))) or (cm.dataset_id=ta.dataset_id and (cm.column_name is null or lower(cm.column_name)=lower(lm.target_column))))));
    elsif v_type='DATA_DICTIONARY' then
      v_source_table := 'profiling.profile_columns';
      select count(*)::integer,max(pc.created_at) into v_count,v_latest
      from profiling.profile_columns pc
      join profiling.profile_runs pr on pr.id=pc.profile_run_id
      join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
      join catalog.datasets d on d.id=dv.dataset_id and d.project_id=p_project_id
      where pr.status in ('SUCCEEDED','PARTIAL')
        and pr.id=(select pr2.id from profiling.profile_runs pr2 join catalog.dataset_versions dv2 on dv2.id=pr2.dataset_version_id where dv2.dataset_id=d.id and pr2.status in ('SUCCEEDED','PARTIAL') order by coalesce(pr2.completed_at,pr2.started_at) desc limit 1)
        and (v_scope_type='PROJECT'
          or (v_scope_type='DATASET' and d.id=v_scope_id)
          or (v_scope_type='DOMAIN' and lower(coalesce(d.business_domain,''))=lower(coalesce(v_scope_key,'')))
          or (v_scope_type='CDE' and exists(select 1 from governance.cde_mappings cm where cm.project_id=p_project_id and cm.cde_id=v_scope_id and cm.dataset_id=d.id and cm.status='APPROVED' and (cm.column_name is null or lower(cm.column_name)=lower(pc.column_name)))));
    elsif v_type='QUALITY_RULE_RUN' then
      v_source_table := 'profiling.quality_rule_runs';
      select count(*)::integer,max(qr.completed_at) into v_count,v_latest
      from profiling.quality_rule_runs qr
      join profiling.quality_rule_definitions qd on qd.id=qr.rule_definition_id and qd.project_id=p_project_id
      join catalog.datasets d on d.id=qd.dataset_id and d.project_id=p_project_id
      where qr.completed_at is not null and qd.enabled=true and qd.approval_status in ('APPROVED','NOT_REQUIRED')
        and (v_scope_type='PROJECT'
          or (v_scope_type='QUALITY_RULE' and qd.id=v_scope_id)
          or (v_scope_type='DATASET' and qd.dataset_id=v_scope_id)
          or (v_scope_type='DOMAIN' and lower(coalesce(d.business_domain,''))=lower(coalesce(v_scope_key,'')))
          or (v_scope_type='CDE' and exists(select 1 from governance.cde_mappings cm where cm.project_id=p_project_id and cm.cde_id=v_scope_id and cm.dataset_id=qd.dataset_id and cm.status='APPROVED' and (qd.column_name is null or cm.column_name is null or lower(qd.column_name)=lower(cm.column_name)))));
    elsif v_type='DATA_CONTRACT' then
      v_source_table := 'governance.data_contract_versions';
      select count(*)::integer,max(cv.effective_at) into v_count,v_latest
      from governance.data_contracts c
      join governance.data_contract_versions cv on cv.contract_id=c.id and cv.status='ACTIVE' and cv.approved_by is not null
      join catalog.datasets d on d.id=c.dataset_id and d.project_id=c.project_id
      where c.project_id=p_project_id and c.status='ACTIVE'
        and (v_scope_type='PROJECT'
          or (v_scope_type='DATA_CONTRACT' and c.id=v_scope_id)
          or (v_scope_type='DATASET' and c.dataset_id=v_scope_id)
          or (v_scope_type='DOMAIN' and lower(coalesce(d.business_domain,''))=lower(coalesce(v_scope_key,''))));
    else
      v_count := 0;
      v_latest := null;
      v_source_table := null;
    end if;

    v_key := 'AUTO:'||v_type||':'||coalesce(p_scope_binding_id::text,'PROJECT');
    if coalesce(v_count,0)>0 then
      v_payload := jsonb_build_object('collector','AUTHORITATIVE_POSTGRES_V1','source_count',v_count,'source_latest_at',v_latest,'scope_type',v_scope_type,'scope_id',v_scope_id,'scope_key',v_scope_key,'source_table',v_source_table);
      v_hash := encode(extensions.digest(convert_to(jsonb_build_object('type',v_type,'key',v_key,'scope_binding_id',p_scope_binding_id,'payload',v_payload)::text,'UTF8'),'sha256'),'hex');
      select * into v_existing from governance.control_evidence where project_id=p_project_id and control_id=p_control_id and scope_binding_id is not distinct from p_scope_binding_id and evidence_type=v_type and evidence_key=v_key for update;
      v_existing_found := found;
      perform pg_catalog.set_config('governance.control_evidence_collector_context','true',true);
      if v_existing_found then
        if v_existing.status='CURRENT' and v_existing.evidence_hash=v_hash then
          v_unchanged := v_unchanged+1;
        else
          update governance.control_evidence set status='CURRENT',subject_type=v_scope_type,subject_id=case when v_scope_type<>'DOMAIN' then v_scope_id else null end,source_table=v_source_table,source_record_id=null,observed_at=coalesce(v_latest,now()),expires_at=null,payload=v_payload,evidence_hash=v_hash,recorded_by=p_actor,updated_at=now() where id=v_existing.id;
          v_changed := v_changed+1;
        end if;
      else
        insert into governance.control_evidence(project_id,control_id,scope_binding_id,evidence_type,evidence_key,subject_type,subject_id,source_table,source_record_id,status,observed_at,expires_at,payload,evidence_hash,recorded_by,updated_at)
        values(p_project_id,p_control_id,p_scope_binding_id,v_type,v_key,v_scope_type,case when v_scope_type<>'DOMAIN' then v_scope_id else null end,v_source_table,null,'CURRENT',coalesce(v_latest,now()),null,v_payload,v_hash,p_actor,now());
        v_changed := v_changed+1;
      end if;
      perform pg_catalog.set_config('governance.control_evidence_collector_context','false',true);
      v_collected := v_collected+1;
    else
      perform pg_catalog.set_config('governance.control_evidence_collector_context','true',true);
      update governance.control_evidence set status='SUPERSEDED',updated_at=now() where project_id=p_project_id and control_id=p_control_id and scope_binding_id is not distinct from p_scope_binding_id and evidence_type=v_type and evidence_key=v_key and status='CURRENT' and coalesce(payload->>'collector','')='AUTHORITATIVE_POSTGRES_V1';
      if found then v_superseded := v_superseded+1; v_changed := v_changed+1; end if;
      perform pg_catalog.set_config('governance.control_evidence_collector_context','false',true);
    end if;
  end loop;

  if v_changed>0 then
    insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
    values(p_project_id,p_actor,case when p_actor is null then 'SYSTEM' else 'AGENT' end,'GOVERNANCE_CONTROL_EVIDENCE_REFRESHED','GOVERNANCE_CONTROL',p_control_id,jsonb_build_object('scope_binding_id',p_scope_binding_id,'collector','AUTHORITATIVE_POSTGRES_V1','collected_types',v_collected,'superseded_types',v_superseded,'unchanged_types',v_unchanged,'changed_types',v_changed,'atomic_with_refresh',true,'database_capability_verified',true));
  end if;

  return jsonb_build_object('control_id',p_control_id,'scope_binding_id',p_scope_binding_id,'collector','AUTHORITATIVE_POSTGRES_V1','collected_types',v_collected,'superseded_types',v_superseded,'unchanged_types',v_unchanged,'changed_types',v_changed,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.refresh_project_governance_control_intelligence(p_project_id uuid,p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_control record;
  v_scope record;
  v_scope_seen boolean;
  v_refresh jsonb;
  v_eval jsonb;
  v_controls integer := 0;
  v_scopes integer := 0;
  v_evaluations integer := 0;
  v_changed_types integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if p_actor is not null and not governance.has_project_capability(p_project_id,p_actor,'agent.execute') then raise exception 'Actor is not authorized for agent.execute in this project'; end if;

  for v_control in select id,control_key from governance.control_definitions where project_id=p_project_id and lifecycle_status='ACTIVE' and review_status='APPROVED' and evaluation_method='EVIDENCE_ASSERTION' order by control_key loop
    v_controls := v_controls+1;
    v_scope_seen := false;
    for v_scope in select id from governance.control_scope_bindings where project_id=p_project_id and control_id=v_control.id and status='ACTIVE' order by id loop
      v_scope_seen := true;
      v_scopes := v_scopes+1;
      v_refresh := governance.refresh_governance_control_evidence(p_project_id,v_control.id,v_scope.id,p_actor);
      v_eval := governance.evaluate_governance_control(p_project_id,v_control.id,v_scope.id,p_actor);
      v_evaluations := v_evaluations+1;
      v_changed_types := v_changed_types+coalesce((v_refresh->>'changed_types')::integer,0);
      v_results := v_results || jsonb_build_array(jsonb_build_object('control_key',v_control.control_key,'scope_binding_id',v_scope.id,'refresh',v_refresh,'evaluation',v_eval));
    end loop;
    if not v_scope_seen then
      v_refresh := governance.refresh_governance_control_evidence(p_project_id,v_control.id,null,p_actor);
      v_eval := governance.evaluate_governance_control(p_project_id,v_control.id,null,p_actor);
      v_evaluations := v_evaluations+1;
      v_changed_types := v_changed_types+coalesce((v_refresh->>'changed_types')::integer,0);
      v_results := v_results || jsonb_build_array(jsonb_build_object('control_key',v_control.control_key,'scope_binding_id',null,'refresh',v_refresh,'evaluation',v_eval));
    end if;
  end loop;

  return jsonb_build_object('project_id',p_project_id,'active_controls_refreshed',v_controls,'active_scope_bindings',v_scopes,'evaluations',v_evaluations,'changed_evidence_types',v_changed_types,'results',v_results,'database_capability_verified',true);
end;
$function$;

revoke execute on function governance.refresh_governance_control_evidence(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function governance.refresh_project_governance_control_intelligence(uuid,uuid) from public, anon, authenticated;
grant execute on function governance.refresh_governance_control_evidence(uuid,uuid,uuid,uuid) to service_role;
grant execute on function governance.refresh_project_governance_control_intelligence(uuid,uuid) to service_role;
