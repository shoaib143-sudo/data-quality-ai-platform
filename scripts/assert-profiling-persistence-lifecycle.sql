-- Rollback-safe acceptance coverage for the governed profiling persistence lifecycle.
begin;

do $do$
declare
  v_organization_id uuid;
  v_project_id uuid;
  v_data_source_id uuid;
  v_dataset_id uuid;
  v_version_id uuid;
  v_scope_id uuid;
  v_scope_version_id uuid;
  v_discovery_run_id uuid;
  v_manifest_id uuid;
  v_run_id uuid;
  v_column_id uuid;
  v_metric jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_contract jsonb;
  v_metric_count integer;
  v_finding_count integer;
  v_definition record;
  v_suffix text := replace(gen_random_uuid()::text,'-','');
begin
  insert into app.organizations(name,slug,metadata)
  values ('Profiling runtime acceptance','profiling-runtime-' || left(gen_random_uuid()::text,8),jsonb_build_object('synthetic',true))
  returning id into v_organization_id;

  insert into app.projects(organization_id,name,slug,description,metadata)
  values (v_organization_id,'Profiling runtime acceptance','profiling-runtime-' || left(gen_random_uuid()::text,8),'Disposable profiling lifecycle fixture',jsonb_build_object('synthetic',true))
  returning id into v_project_id;

  insert into catalog.data_sources(project_id,name,source_type,connection_metadata,status)
  values (v_project_id,'Synthetic JDBC Source ' || left(v_suffix,12),'JDBC',jsonb_build_object('synthetic',true),'ACTIVE')
  returning id into v_data_source_id;

  insert into catalog.datasets(project_id,name,description,source_identifier,data_source_id,metadata)
  values (v_project_id,'Synthetic profiling lifecycle','Disposable runtime acceptance dataset','runtime://synthetic',v_data_source_id,jsonb_build_object('synthetic',true))
  returning id into v_dataset_id;

  insert into catalog.dataset_versions(dataset_id,version_number,source_uri,schema_hash,row_count,column_count,status,metadata)
  values (v_dataset_id,1,'runtime://synthetic/v1','runtime-schema',2,1,'AVAILABLE',jsonb_build_object('synthetic',true))
  returning id into v_version_id;

  insert into catalog.source_scopes(project_id,source_id,name,status)
  values (v_project_id,v_data_source_id,'synthetic-default','ACTIVE')
  returning id into v_scope_id;

  insert into catalog.source_scope_versions(scope_id,project_id,source_id,version_number,scope_mode,native_selection,rules,scope_hash,frozen_at)
  values (v_scope_id,v_project_id,v_data_source_id,1,'SNAPSHOT',jsonb_build_object('synthetic',true),jsonb_build_object('include',jsonb_build_array('runtime://synthetic')),encode(digest('synthetic-scope-' || v_suffix,'sha256'),'hex'),now())
  returning id into v_scope_version_id;

  update catalog.source_scopes set current_version_id=v_scope_version_id, updated_at=now() where id=v_scope_id;

  insert into catalog.discovery_runs(project_id,source_id,status,assets_discovered,schema_snapshot,started_at,completed_at,scope_id,scope_version_id,observed_from,observed_to,objects_observed,objects_added,objects_changed,objects_missing,objects_unchanged,consistency_mode,objects_removed)
  values (v_project_id,v_data_source_id,'COMPLETED',1,jsonb_build_object('synthetic',true),now(),now(),v_scope_id,v_scope_version_id,now(),now(),1,1,0,0,0,'SNAPSHOT',0)
  returning id into v_discovery_run_id;

  insert into catalog.discovered_assets(discovery_run_id,source_id,asset_type,namespace,name,columns,metadata,asset_key,content_hash,version_number,is_current,first_seen_at,last_seen_at,last_seen_run_id,structure_hash,source_annotation_hash,identity_key)
  values (v_discovery_run_id,v_data_source_id,'TABLE','runtime','synthetic','[]'::jsonb,jsonb_build_object('synthetic',true),'runtime://synthetic',encode(digest('synthetic-asset-' || v_suffix,'sha256'),'hex'),1,true,now(),now(),v_discovery_run_id,encode(digest('synthetic-structure-' || v_suffix,'sha256'),'hex'),encode(digest('synthetic-annotation-' || v_suffix,'sha256'),'hex'),'runtime://synthetic');

  insert into catalog.discovery_manifests(project_id,source_id,scope_id,scope_version_id,discovery_run_id,expected_object_count,expected_field_count,observed_object_count,observed_field_count,failed_item_count,truncated,complete,manifest_hash,consistency_mode,metadata,completed_at)
  values (v_project_id,v_data_source_id,v_scope_id,v_scope_version_id,v_discovery_run_id,1,0,1,0,0,false,true,encode(digest('synthetic-manifest-' || v_suffix,'sha256'),'hex'),'SNAPSHOT',jsonb_build_object('synthetic',true),now())
  returning id into v_manifest_id;

  update catalog.discovery_runs set manifest_id=v_manifest_id where id=v_discovery_run_id;

  insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
  values (v_version_id,'TABLE','table://runtime/synthetic',jsonb_build_object('schema','runtime','table','synthetic','synthetic',true),true);

  insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,row_count,column_count,schema_hash,summary)
  values (v_version_id,'RUNNING','runtime-acceptance','1',2,1,'runtime-schema',jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)))
  returning id into v_run_id;

  insert into profiling.profile_columns(profile_run_id,column_name,ordinal_position,source_type,inferred_type,nullable,total_count,non_null_count,null_count,blank_count,distinct_count)
  values (v_run_id,'id',1,'text','STRING',false,2,2,0,0,2)
  returning id into v_column_id;

  for v_definition in select id,metric_key,scope,value_type from profiling.metric_definitions where enabled order by metric_key
  loop
    v_metric := jsonb_build_object('metric_definition_id',v_definition.id,'profile_column_id',case when v_definition.scope='DATASET' then null else v_column_id end,'metric_key',v_definition.metric_key);
    v_metric := v_metric || case
      when v_definition.metric_key = 'row_count' then jsonb_build_object('numeric_value',2)
      when v_definition.metric_key = 'column_count' then jsonb_build_object('numeric_value',1)
      when v_definition.value_type = 'NUMBER' then jsonb_build_object('numeric_value',1)
      when v_definition.value_type = 'STRING' then jsonb_build_object('text_value','runtime')
      when v_definition.value_type = 'BOOLEAN' then jsonb_build_object('boolean_value',true)
      else jsonb_build_object('json_value',jsonb_build_object('runtime',true))
    end;
    v_metrics := v_metrics || jsonb_build_array(v_metric);
  end loop;

  perform profiling.persist_profiling_results(
    v_run_id,v_version_id,v_metrics,
    jsonb_build_array(jsonb_build_object('profile_column_id',v_column_id,'finding_type','RUNTIME_ACCEPTANCE','severity','LOW','title','Disposable lifecycle finding','description','Synthetic finding proving atomic persistence','confidence',1,'evidence',jsonb_build_object('synthetic',true))),
    jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1),
    jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)),
    'COMPLETED'
  );

  select profiling.validate_metric_execution_contract(v_run_id) into v_contract;
  if coalesce((v_contract->>'valid')::boolean,false) is not true then raise exception 'Completed profiling lifecycle contract invalid: %',v_contract; end if;
  if (select count(*) from profiling.profile_metrics where profile_run_id=v_run_id) <> jsonb_array_length(v_metrics) then raise exception 'Metric persistence count mismatch'; end if;
  if not exists(select 1 from profiling.profile_findings where profile_run_id=v_run_id and finding_type='RUNTIME_ACCEPTANCE') then raise exception 'Finding persistence missing'; end if;
  if not exists(select 1 from profiling.data_quality_scores where profile_run_id=v_run_id and overall_score=1) then raise exception 'Quality score persistence missing'; end if;
  if not exists(select 1 from profiling.profile_runs where id=v_run_id and status='COMPLETED' and completed_at is not null) then raise exception 'Final profiling run state missing'; end if;

  if not exists(
    select 1 from profiling.profile_run_governance_insights
    where profile_run_id=v_run_id and dataset_version_id=v_version_id and run_status='COMPLETED'
      and row_count=2 and column_count=1 and overall_score=1 and completeness_score=1 and uniqueness_score=1 and validity_score=1
      and total_findings=1 and high_findings=0 and medium_findings=0 and info_findings=0 and investigation_present=false
  ) then raise exception 'Governance insight projection missing or inconsistent'; end if;

  select count(*) into v_metric_count from profiling.profile_metrics where profile_run_id=v_run_id;
  select count(*) into v_finding_count from profiling.profile_findings where profile_run_id=v_run_id;

  begin
    perform profiling.persist_profiling_results(v_run_id,gen_random_uuid(),v_metrics,'[]'::jsonb,jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1),jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)),'COMPLETED');
    raise exception 'Mismatched dataset version persistence unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Mismatched dataset version persistence unexpectedly succeeded' then raise; end if;
    if sqlerrm not like 'Profiling run % was not found for dataset version %' then raise exception 'Unexpected mismatched-version failure: %',sqlerrm; end if;
  end;

  if (select count(*) from profiling.profile_metrics where profile_run_id=v_run_id) <> v_metric_count or (select count(*) from profiling.profile_findings where profile_run_id=v_run_id) <> v_finding_count then
    raise exception 'Failed persistence attempt mutated completed artifacts';
  end if;

  update profiling.profile_runs set status='CANCELLED' where id=v_run_id;
  begin
    perform profiling.persist_profiling_results(v_run_id,v_version_id,v_metrics,'[]'::jsonb,jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1),jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)),'COMPLETED');
    raise exception 'Cancelled run persistence unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Cancelled run persistence unexpectedly succeeded' then raise; end if;
    if sqlerrm not like 'Profiling run % has been cancelled' then raise exception 'Unexpected cancelled-run failure: %',sqlerrm; end if;
  end;

  if not exists(select 1 from profiling.profile_runs where id=v_run_id and status='CANCELLED') then raise exception 'Cancelled run state was not preserved'; end if;
end;
$do$;

rollback;
