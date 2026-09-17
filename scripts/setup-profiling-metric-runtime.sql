create table public.profiling_metric_runtime_fixture (
  id integer not null,
  email text,
  age integer,
  note text
);

insert into public.profiling_metric_runtime_fixture(id,email,age,note) values
  (1,'a@example.com',10,null),
  (2,'b@example.com',20,null),
  (3,'c@example.com',30,'ok'),
  (4,'d@example.com',40,null),
  (4,'d@example.com',40,null);

do $do$
declare
  v_organization_id uuid := '10000000-0000-0000-0000-000000000001';
  v_project_id uuid := '10000000-0000-0000-0000-000000000002';
  v_data_source_id uuid := '10000000-0000-0000-0000-000000000003';
  v_dataset_id uuid := '10000000-0000-0000-0000-000000000004';
  v_version_id uuid := '10000000-0000-0000-0000-000000000005';
  v_scope_id uuid := '10000000-0000-0000-0000-000000000006';
  v_scope_version_id uuid := '10000000-0000-0000-0000-000000000007';
  v_run_id uuid := '10000000-0000-0000-0000-000000000008';
  v_discovery_run_id uuid;
  v_manifest_id uuid;
begin
  insert into app.organizations(id,name,slug,metadata)
  values (v_organization_id,'Metric runtime acceptance','metric-runtime-acceptance',jsonb_build_object('synthetic',true));

  insert into app.projects(id,organization_id,name,slug,description,metadata)
  values (v_project_id,v_organization_id,'Metric runtime acceptance','metric-runtime-acceptance','Disposable deterministic metric execution fixture',jsonb_build_object('synthetic',true));

  insert into catalog.data_sources(id,project_id,name,source_type,connection_metadata,status)
  values (v_data_source_id,v_project_id,'Synthetic table source','TABLE',jsonb_build_object('schema','public','table','profiling_metric_runtime_fixture','synthetic',true),'ACTIVE');

  insert into catalog.datasets(id,project_id,name,description,source_identifier,data_source_id,metadata)
  values (v_dataset_id,v_project_id,'Synthetic metric runtime','Disposable metric execution dataset','public.profiling_metric_runtime_fixture',v_data_source_id,jsonb_build_object('synthetic',true));

  insert into catalog.dataset_versions(id,dataset_id,version_number,source_uri,schema_hash,row_count,column_count,status,metadata)
  values (v_version_id,v_dataset_id,1,'table://public/profiling_metric_runtime_fixture','metric-runtime-schema',5,4,'AVAILABLE',jsonb_build_object('synthetic',true));

  insert into catalog.source_scopes(id,project_id,source_id,name,status)
  values (v_scope_id,v_project_id,v_data_source_id,'synthetic-default','ACTIVE');

  insert into catalog.source_scope_versions(id,scope_id,project_id,source_id,version_number,scope_mode,native_selection,rules,scope_hash,frozen_at)
  values (v_scope_version_id,v_scope_id,v_project_id,v_data_source_id,1,'SNAPSHOT',jsonb_build_object('synthetic',true),jsonb_build_object('include',jsonb_build_array('public.profiling_metric_runtime_fixture')),repeat('a',64),now());

  update catalog.source_scopes
     set current_version_id=v_scope_version_id,
         updated_at=now()
   where id=v_scope_id;

  insert into catalog.discovery_runs(project_id,source_id,status,assets_discovered,schema_snapshot,started_at,completed_at,scope_id,scope_version_id,observed_from,observed_to,objects_observed,objects_added,objects_changed,objects_missing,objects_unchanged,consistency_mode,objects_removed)
  values (v_project_id,v_data_source_id,'COMPLETED',1,jsonb_build_object('synthetic',true),now(),now(),v_scope_id,v_scope_version_id,now(),now(),1,1,0,0,0,'SNAPSHOT',0)
  returning id into v_discovery_run_id;

  insert into catalog.discovered_assets(discovery_run_id,source_id,asset_type,namespace,name,columns,metadata,asset_key,content_hash,version_number,is_current,first_seen_at,last_seen_at,last_seen_run_id,structure_hash,source_annotation_hash,identity_key)
  values (v_discovery_run_id,v_data_source_id,'TABLE','public','profiling_metric_runtime_fixture','[]'::jsonb,jsonb_build_object('synthetic',true),'table://public/profiling_metric_runtime_fixture',repeat('b',64),1,true,now(),now(),v_discovery_run_id,repeat('c',64),repeat('d',64),'table://public/profiling_metric_runtime_fixture');

  insert into catalog.discovery_manifests(project_id,source_id,scope_id,scope_version_id,discovery_run_id,expected_object_count,expected_field_count,observed_object_count,observed_field_count,failed_item_count,truncated,complete,manifest_hash,consistency_mode,metadata,completed_at)
  values (v_project_id,v_data_source_id,v_scope_id,v_scope_version_id,v_discovery_run_id,1,4,1,4,0,false,true,repeat('e',64),'SNAPSHOT',jsonb_build_object('synthetic',true),now())
  returning id into v_manifest_id;

  update catalog.discovery_runs
     set manifest_id=v_manifest_id
   where id=v_discovery_run_id;

  insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
  values (v_version_id,'TABLE','table://public/profiling_metric_runtime_fixture',jsonb_build_object('schema','public','table','profiling_metric_runtime_fixture','synthetic',true),true);

  insert into profiling.profile_runs(id,dataset_version_id,status,engine_name,engine_version,row_count,column_count,schema_hash,summary)
  values (v_run_id,v_version_id,'RUNNING','deterministic-registry-runtime','1.1',5,4,'metric-runtime-schema',jsonb_build_object('synthetic',true));

  insert into profiling.profile_columns(profile_run_id,column_name,ordinal_position,source_type,inferred_type,nullable) values
    (v_run_id,'id',1,'integer','NUMBER',false),
    (v_run_id,'email',2,'text','STRING',true),
    (v_run_id,'age',3,'integer','NUMBER',true),
    (v_run_id,'note',4,'text','STRING',true);
end;
$do$;
