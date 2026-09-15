begin;

do $$
declare
  v_oid oid;
  v_source text;
  v_patched text;
  v_decl_old text := $decl$
  v_suffix text := replace(gen_random_uuid()::text,'-','');
$decl$;
  v_decl_new text := $decl$
  v_suffix text := replace(gen_random_uuid()::text,'-','');
  v_data_source_id uuid;
  v_scope_id uuid;
  v_scope_version_id uuid;
  v_discovery_run_id uuid;
  v_manifest_id uuid;
$decl$;
  v_fixture_old text := $fixture$
    insert into catalog.datasets(project_id,name,source_identifier,business_domain,metadata)
    values(v_project_id,'Synthetic Governed Dataset','profiling_validation.synthetic_customers','TEST',jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_dataset_id;

    insert into catalog.dataset_versions(dataset_id,version_number,source_uri,status,row_count,column_count,schema_hash,metadata)
    values(v_dataset_id,1,'table://profiling_validation.synthetic_customers','AVAILABLE',10,0,'schema-v1',jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_version_id;

    insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
    values(v_version_id,'TABLE','table://profiling_validation.synthetic_customers',jsonb_build_object('schema','profiling_validation','table','synthetic_customers'),true);
$fixture$;
  v_fixture_new text := $fixture$
    insert into catalog.data_sources(project_id,name,source_type,connection_metadata,status)
    values(v_project_id,'Synthetic JDBC Source '||left(v_suffix,12),'JDBC',jsonb_build_object('synthetic',true,'integration_run_id',v_run_id),'ACTIVE')
    returning id into v_data_source_id;

    insert into catalog.datasets(project_id,name,source_identifier,business_domain,data_source_id,metadata)
    values(v_project_id,'Synthetic Governed Dataset','profiling_validation.synthetic_customers','TEST',v_data_source_id,jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_dataset_id;

    insert into catalog.dataset_versions(dataset_id,version_number,source_uri,status,row_count,column_count,schema_hash,metadata)
    values(v_dataset_id,1,'table://profiling_validation.synthetic_customers','AVAILABLE',10,0,'schema-v1',jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_version_id;

    insert into catalog.source_scopes(project_id,source_id,name,status)
    values(v_project_id,v_data_source_id,'synthetic-default','ACTIVE')
    returning id into v_scope_id;

    insert into catalog.source_scope_versions(scope_id,project_id,source_id,version_number,scope_mode,native_selection,rules,scope_hash,created_by,frozen_at)
    values(v_scope_id,v_project_id,v_data_source_id,1,'SNAPSHOT',jsonb_build_object('synthetic',true),jsonb_build_object('include',jsonb_build_array('profiling_validation.synthetic_customers')),encode(digest('synthetic-scope-'||v_suffix,'sha256'),'hex'),v_reviewer_id,now())
    returning id into v_scope_version_id;

    update catalog.source_scopes
       set current_version_id=v_scope_version_id,
           updated_at=now()
     where id=v_scope_id;

    insert into catalog.discovery_runs(project_id,source_id,status,assets_discovered,schema_snapshot,started_at,completed_at,scope_id,scope_version_id,observed_from,observed_to,objects_observed,objects_added,objects_changed,objects_missing,objects_unchanged,consistency_mode,objects_removed)
    values(v_project_id,v_data_source_id,'COMPLETED',1,jsonb_build_object('synthetic',true),now(),now(),v_scope_id,v_scope_version_id,now(),now(),1,1,0,0,0,'SNAPSHOT',0)
    returning id into v_discovery_run_id;

    insert into catalog.discovered_assets(discovery_run_id,source_id,asset_type,namespace,name,columns,metadata,asset_key,content_hash,version_number,is_current,first_seen_at,last_seen_at,last_seen_run_id,structure_hash,source_annotation_hash,identity_key)
    values(v_discovery_run_id,v_data_source_id,'TABLE','profiling_validation','synthetic_customers','[]'::jsonb,jsonb_build_object('synthetic',true),'profiling_validation.synthetic_customers',encode(digest('synthetic-asset-'||v_suffix,'sha256'),'hex'),1,true,now(),now(),v_discovery_run_id,encode(digest('synthetic-structure-'||v_suffix,'sha256'),'hex'),encode(digest('synthetic-annotation-'||v_suffix,'sha256'),'hex'),'profiling_validation.synthetic_customers');

    insert into catalog.discovery_manifests(project_id,source_id,scope_id,scope_version_id,discovery_run_id,expected_object_count,expected_field_count,observed_object_count,observed_field_count,failed_item_count,truncated,complete,manifest_hash,consistency_mode,metadata,completed_at)
    values(v_project_id,v_data_source_id,v_scope_id,v_scope_version_id,v_discovery_run_id,1,0,1,0,0,false,true,encode(digest('synthetic-manifest-'||v_suffix,'sha256'),'hex'),'SNAPSHOT',jsonb_build_object('synthetic',true,'integration_run_id',v_run_id),now())
    returning id into v_manifest_id;

    update catalog.discovery_runs
       set manifest_id=v_manifest_id
     where id=v_discovery_run_id;

    insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
    values(v_version_id,'TABLE','table://profiling_validation.synthetic_customers',jsonb_build_object('schema','profiling_validation','table','synthetic_customers','synthetic',true),true);

    if coalesce((catalog.verify_dataset_profile_readiness(v_project_id,v_dataset_id)->>'profiling_ready')::boolean,false) is not true then
      raise exception 'Synthetic governed JDBC readiness fixture did not reach READY';
    end if;
$fixture$;
begin
  select p.oid, p.prosrc
    into v_oid, v_source
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='governance'
    and p.proname='run_synthetic_governance_integration_suite'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_oid is null then
    raise exception 'governance.run_synthetic_governance_integration_suite() is missing';
  end if;
  if strpos(v_source,v_decl_old)=0 then
    raise exception 'Synthetic governance suite declaration contract changed; refusing readiness fixture patch';
  end if;
  if strpos(v_source,v_fixture_old)=0 then
    raise exception 'Synthetic governance suite profiling fixture contract changed; refusing readiness fixture patch';
  end if;

  v_patched := replace(v_source,v_decl_old,v_decl_new);
  v_patched := replace(v_patched,v_fixture_old,v_fixture_new);

  execute format(
    'create or replace function governance.run_synthetic_governance_integration_suite() returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, governance, profiling, catalog, orchestration, app as %L',
    v_patched
  );
end $$;

comment on function governance.run_synthetic_governance_integration_suite() is
  'Synthetic cross-module governance integration suite. Its profiling fixture uses deterministic governed JDBC source/scope/discovery evidence and must pass the same readiness gate as production profiling; synthetic evidence never counts as production learning evidence.';

commit;
