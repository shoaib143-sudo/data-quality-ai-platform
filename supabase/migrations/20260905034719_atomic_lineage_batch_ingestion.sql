create or replace function governance.ingest_lineage_batch_atomic(
  p_project_id uuid,
  p_actor uuid,
  p_source_key text,
  p_source_name text,
  p_source_system text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_key text := btrim(coalesce(p_source_key,''));
  v_source_name text := btrim(coalesce(p_source_name,''));
  v_source_system text := upper(btrim(coalesce(p_source_system,'')));
  v_integration governance.lineage_integrations%rowtype;
  v_event jsonb;
  v_external_event_id text;
  v_lock_event_id text;
  v_prior governance.lineage_ingestion_events%rowtype;
  v_event_row governance.lineage_ingestion_events%rowtype;
  v_inputs jsonb;
  v_outputs jsonb;
  v_input_assets jsonb;
  v_output_assets jsonb;
  v_asset jsonb;
  v_asset_row governance.lineage_assets%rowtype;
  v_namespace text;
  v_name text;
  v_asset_type text;
  v_requested_dataset text;
  v_dataset_id uuid;
  v_qualified text;
  v_metadata jsonb;
  v_t jsonb;
  v_transformation governance.lineage_transformations%rowtype;
  v_has_transformation boolean;
  v_mappings jsonb;
  v_mapping jsonb;
  v_source_asset_id uuid;
  v_target_asset_id uuid;
  v_source_asset_key text;
  v_target_asset_key text;
  v_source_asset jsonb;
  v_target_asset jsonb;
  v_edge_metadata jsonb;
  v_edge_count integer;
  v_transformation_count integer;
  v_reused_count integer := 0;
  v_total_edge_count integer := 0;
  v_total_transformation_count integer := 0;
  v_event_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_payload_hash text;
  v_now timestamptz;
begin
  if p_actor is null then raise exception 'Lineage ingestion requires an accountable actor'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'lineage.manage') then raise exception 'Actor is not authorized for lineage.manage in this project'; end if;
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if v_source_key='' or v_source_name='' or v_source_system='' then raise exception 'sourceKey, sourceName and sourceSystem are required'; end if;
  if jsonb_typeof(coalesce(p_events,'null'::jsonb))<>'array' or jsonb_array_length(p_events)=0 then raise exception 'events must be a non-empty JSON array'; end if;
  if char_length(v_source_key)>300 or char_length(v_source_name)>500 or char_length(v_source_system)>100 then raise exception 'Lineage source identity exceeds supported field length'; end if;

  for v_lock_event_id in
    select btrim(coalesce(value->>'externalEventId',''))
    from jsonb_array_elements(p_events)
    order by btrim(coalesce(value->>'externalEventId',''))
  loop
    if v_lock_event_id='' then raise exception 'Each lineage event requires externalEventId'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_project_id::text||':'||v_lock_event_id,0));
  end loop;

  insert into governance.lineage_integrations(project_id,source_key,name,integration_type,enabled,created_by)
  values (p_project_id,v_source_key,v_source_name,v_source_system,true,p_actor)
  on conflict(project_id,source_key) do update
  set name=excluded.name,integration_type=excluded.integration_type,enabled=true,created_by=excluded.created_by
  returning * into v_integration;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(v_event)<>'object' then raise exception 'Each lineage event must be a JSON object'; end if;
    v_external_event_id := btrim(coalesce(v_event->>'externalEventId',''));
    if v_external_event_id='' then raise exception 'Each lineage event requires externalEventId'; end if;
    if char_length(v_external_event_id)>1000 then raise exception 'Lineage externalEventId exceeds supported length'; end if;
    v_event_count := v_event_count + 1;

    select * into v_prior from governance.lineage_ingestion_events
    where project_id=p_project_id and external_event_id=v_external_event_id;
    if found then
      v_reused_count := v_reused_count + 1;
      v_total_edge_count := v_total_edge_count + coalesce(v_prior.edge_count,0);
      v_total_transformation_count := v_total_transformation_count + coalesce(v_prior.transformation_count,0);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'reused',true,'event',to_jsonb(v_prior),'edgeCount',coalesce(v_prior.edge_count,0),'transformationCount',coalesce(v_prior.transformation_count,0)
      ));
      continue;
    end if;

    v_inputs := coalesce(v_event->'inputs','[]'::jsonb);
    v_outputs := coalesce(v_event->'outputs','[]'::jsonb);
    if jsonb_typeof(v_inputs)<>'array' or jsonb_typeof(v_outputs)<>'array' then raise exception 'Lineage event inputs and outputs must be arrays'; end if;
    v_input_assets := '[]'::jsonb;
    v_output_assets := '[]'::jsonb;
    v_now := pg_catalog.now();

    for v_asset in select value from jsonb_array_elements(v_inputs)
    loop
      if jsonb_typeof(v_asset)<>'object' then raise exception 'Each lineage input asset must be an object'; end if;
      v_namespace := btrim(coalesce(v_asset->>'namespace',''));
      v_name := btrim(coalesce(v_asset->>'name',''));
      v_asset_type := upper(btrim(coalesce(v_asset->>'assetType','DATASET')));
      if v_name='' then raise exception 'Each lineage asset requires a name'; end if;
      v_requested_dataset := nullif(btrim(coalesce(v_asset->>'datasetId','')),'');
      v_dataset_id := null;
      if v_requested_dataset is not null then
        begin v_dataset_id := v_requested_dataset::uuid;
        exception when invalid_text_representation then raise exception 'Invalid lineage datasetId %',v_requested_dataset; end;
        if not exists(select 1 from catalog.datasets where id=v_dataset_id and project_id=p_project_id) then v_dataset_id := null; end if;
      end if;
      if v_dataset_id is null then
        v_qualified := case when v_namespace<>'' then v_namespace||'.'||v_name else v_name end;
        select case when count(*)=1 then max(id::text)::uuid else null end into v_dataset_id
        from (
          select id from catalog.datasets where project_id=p_project_id and name=v_name
          union
          select id from catalog.datasets where project_id=p_project_id and source_identifier=v_name
          union
          select id from catalog.datasets where project_id=p_project_id and source_identifier=v_qualified
        ) matches;
      end if;
      v_metadata := coalesce(v_asset->'metadata','{}'::jsonb) || jsonb_build_object('facets',coalesce(v_asset->'facets','{}'::jsonb),'integration_source','lineage_ingest');
      insert into governance.lineage_assets(project_id,integration_id,namespace,name,asset_type,dataset_id,metadata,last_seen_at)
      values (p_project_id,v_integration.id,v_namespace,v_name,v_asset_type,v_dataset_id,v_metadata,v_now)
      on conflict(project_id,namespace,name,asset_type) do update
      set integration_id=excluded.integration_id,dataset_id=excluded.dataset_id,metadata=excluded.metadata,last_seen_at=excluded.last_seen_at
      returning * into v_asset_row;
      v_input_assets := v_input_assets || jsonb_build_array(jsonb_build_object('id',v_asset_row.id,'dataset_id',v_asset_row.dataset_id,'namespace',v_asset_row.namespace,'name',v_asset_row.name,'asset_type',v_asset_row.asset_type));
    end loop;

    for v_asset in select value from jsonb_array_elements(v_outputs)
    loop
      if jsonb_typeof(v_asset)<>'object' then raise exception 'Each lineage output asset must be an object'; end if;
      v_namespace := btrim(coalesce(v_asset->>'namespace',''));
      v_name := btrim(coalesce(v_asset->>'name',''));
      v_asset_type := upper(btrim(coalesce(v_asset->>'assetType','DATASET')));
      if v_name='' then raise exception 'Each lineage asset requires a name'; end if;
      v_requested_dataset := nullif(btrim(coalesce(v_asset->>'datasetId','')),'');
      v_dataset_id := null;
      if v_requested_dataset is not null then
        begin v_dataset_id := v_requested_dataset::uuid;
        exception when invalid_text_representation then raise exception 'Invalid lineage datasetId %',v_requested_dataset; end;
        if not exists(select 1 from catalog.datasets where id=v_dataset_id and project_id=p_project_id) then v_dataset_id := null; end if;
      end if;
      if v_dataset_id is null then
        v_qualified := case when v_namespace<>'' then v_namespace||'.'||v_name else v_name end;
        select case when count(*)=1 then max(id::text)::uuid else null end into v_dataset_id
        from (
          select id from catalog.datasets where project_id=p_project_id and name=v_name
          union
          select id from catalog.datasets where project_id=p_project_id and source_identifier=v_name
          union
          select id from catalog.datasets where project_id=p_project_id and source_identifier=v_qualified
        ) matches;
      end if;
      v_metadata := coalesce(v_asset->'metadata','{}'::jsonb) || jsonb_build_object('facets',coalesce(v_asset->'facets','{}'::jsonb),'integration_source','lineage_ingest');
      insert into governance.lineage_assets(project_id,integration_id,namespace,name,asset_type,dataset_id,metadata,last_seen_at)
      values (p_project_id,v_integration.id,v_namespace,v_name,v_asset_type,v_dataset_id,v_metadata,v_now)
      on conflict(project_id,namespace,name,asset_type) do update
      set integration_id=excluded.integration_id,dataset_id=excluded.dataset_id,metadata=excluded.metadata,last_seen_at=excluded.last_seen_at
      returning * into v_asset_row;
      v_output_assets := v_output_assets || jsonb_build_array(jsonb_build_object('id',v_asset_row.id,'dataset_id',v_asset_row.dataset_id,'namespace',v_asset_row.namespace,'name',v_asset_row.name,'asset_type',v_asset_row.asset_type));
    end loop;

    v_t := v_event->'transformation';
    v_has_transformation := v_t is not null and jsonb_typeof(v_t)='object';
    v_transformation_count := 0;
    if v_has_transformation then
      if btrim(coalesce(v_t->>'externalId',''))='' then raise exception 'Lineage transformation requires externalId'; end if;
      insert into governance.lineage_transformations(project_id,integration_id,external_id,source_system,name,operation,logic_language,transformation_logic,logic_hash,metadata,last_seen_at)
      values (p_project_id,v_integration.id,btrim(v_t->>'externalId'),upper(btrim(coalesce(v_t->>'sourceSystem',v_source_system))),nullif(btrim(coalesce(v_t->>'name','')),''),upper(btrim(coalesce(v_t->>'operation','TRANSFORM'))),nullif(upper(btrim(coalesce(v_t->>'logicLanguage',''))),''),v_t->>'transformationLogic',nullif(btrim(coalesce(v_t->>'logicHash','')),''),coalesce(v_t->'metadata','{}'::jsonb),v_now)
      on conflict(project_id,integration_id,external_id) do update set source_system=excluded.source_system,name=excluded.name,operation=excluded.operation,logic_language=excluded.logic_language,transformation_logic=excluded.transformation_logic,logic_hash=excluded.logic_hash,metadata=excluded.metadata,last_seen_at=excluded.last_seen_at
      returning * into v_transformation;
      v_transformation_count := 1;

      v_mappings := coalesce(v_t->'columnMappings','[]'::jsonb);
      if jsonb_typeof(v_mappings)<>'array' then raise exception 'Lineage transformation columnMappings must be an array'; end if;
      if jsonb_array_length(v_mappings)>0 then
        delete from governance.lineage_column_mappings where transformation_id=v_transformation.id;
        for v_mapping in select value from jsonb_array_elements(v_mappings)
        loop
          if jsonb_typeof(v_mapping)<>'object' then raise exception 'Each lineage column mapping must be an object'; end if;
          v_source_asset_key := lower(btrim(coalesce(v_mapping->>'sourceAsset','')));
          v_target_asset_key := lower(btrim(coalesce(v_mapping->>'targetAsset','')));
          v_source_asset_id := null;
          v_target_asset_id := null;
          if v_source_asset_key<>'' then
            select (value->>'id')::uuid into v_source_asset_id from jsonb_array_elements(v_input_assets)
            where lower(value->>'name')=v_source_asset_key or lower(case when coalesce(value->>'namespace','')<>'' then (value->>'namespace')||'.'||(value->>'name') else value->>'name' end)=v_source_asset_key limit 1;
          end if;
          if v_source_asset_id is null and jsonb_array_length(v_input_assets)>0 then v_source_asset_id := (v_input_assets->0->>'id')::uuid; end if;
          if v_target_asset_key<>'' then
            select (value->>'id')::uuid into v_target_asset_id from jsonb_array_elements(v_output_assets)
            where lower(value->>'name')=v_target_asset_key or lower(case when coalesce(value->>'namespace','')<>'' then (value->>'namespace')||'.'||(value->>'name') else value->>'name' end)=v_target_asset_key limit 1;
          end if;
          if v_target_asset_id is null and jsonb_array_length(v_output_assets)>0 then v_target_asset_id := (v_output_assets->0->>'id')::uuid; end if;
          insert into governance.lineage_column_mappings(project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata)
          values (p_project_id,v_transformation.id,v_source_asset_id,nullif(btrim(coalesce(v_mapping->>'sourceColumn','')),''),v_target_asset_id,nullif(btrim(coalesce(v_mapping->>'targetColumn','')),''),nullif(btrim(coalesce(v_mapping->>'operation','')),''),v_mapping->>'expression',coalesce(v_mapping->'metadata','{}'::jsonb));
        end loop;
      end if;
    else
      v_transformation := null;
    end if;

    v_edge_count := 0;
    v_edge_metadata := jsonb_build_object('external_event_id',v_external_event_id,'event_type',coalesce(v_event->>'eventType','COMPLETE'),'job_namespace',v_event->>'jobNamespace','job_name',v_event->>'jobName','auto_discovered',true,'integration_id',v_integration.id,'transformation_id',case when v_has_transformation then v_transformation.id else null end,'operation',case when v_has_transformation then v_transformation.operation else null end,'logic_hash',case when v_has_transformation then v_transformation.logic_hash else null end);
    if jsonb_array_length(v_input_assets)>0 and jsonb_array_length(v_output_assets)>0 then
      for v_source_asset in select value from jsonb_array_elements(v_input_assets)
      loop
        for v_target_asset in select value from jsonb_array_elements(v_output_assets)
        loop
          insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,transformation_id,metadata)
          values (p_project_id,case when nullif(v_source_asset->>'dataset_id','') is not null then 'DATASET' else 'EXTERNAL_ASSET' end,coalesce(nullif(v_source_asset->>'dataset_id','')::uuid,(v_source_asset->>'id')::uuid),case when nullif(v_target_asset->>'dataset_id','') is not null then 'DATASET' else 'EXTERNAL_ASSET' end,coalesce(nullif(v_target_asset->>'dataset_id','')::uuid,(v_target_asset->>'id')::uuid),'TRANSFORMS_TO',case when v_has_transformation then v_transformation.id else null end,v_edge_metadata)
          on conflict(project_id,source_type,source_id,target_type,target_id,relationship) do update set transformation_id=excluded.transformation_id,metadata=excluded.metadata;
          v_edge_count := v_edge_count + 1;
        end loop;
      end loop;
    end if;

    v_payload_hash := lower(btrim(coalesce(v_event->>'payloadHash','')));
    if v_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'Each lineage event requires a SHA-256 payloadHash'; end if;
    insert into governance.lineage_ingestion_events(project_id,integration_id,external_event_id,event_type,job_namespace,job_name,payload_hash,edge_count,transformation_count,status)
    values (p_project_id,v_integration.id,v_external_event_id,coalesce(nullif(btrim(coalesce(v_event->>'eventType','')),''),'COMPLETE'),nullif(btrim(coalesce(v_event->>'jobNamespace','')),''),nullif(btrim(coalesce(v_event->>'jobName','')),''),v_payload_hash,v_edge_count,v_transformation_count,'COMPLETED')
    returning * into v_event_row;

    v_total_edge_count := v_total_edge_count + v_edge_count;
    v_total_transformation_count := v_total_transformation_count + v_transformation_count;
    v_results := v_results || jsonb_build_array(jsonb_build_object('reused',false,'event',to_jsonb(v_event_row),'inputAssets',v_input_assets,'outputAssets',v_output_assets,'transformation',case when v_has_transformation then to_jsonb(v_transformation) else null end,'edgeCount',v_edge_count,'transformationCount',v_transformation_count));
  end loop;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values (p_project_id,p_actor,'USER','LINEAGE_BATCH_INGESTED','PROJECT',p_project_id,jsonb_build_object('source_key',v_source_key,'source_system',v_source_system,'event_count',v_event_count,'reused_count',v_reused_count,'edge_count',v_total_edge_count,'transformation_count',v_total_transformation_count,'atomic_with_batch',true,'database_capability_verified',true));

  return jsonb_build_object('accepted',true,'sourceSystem',v_source_system,'eventCount',v_event_count,'reusedCount',v_reused_count,'edgeCount',v_total_edge_count,'transformationCount',v_total_transformation_count,'results',v_results,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

revoke execute on function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb) to service_role;
