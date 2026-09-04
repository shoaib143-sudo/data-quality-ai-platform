create or replace function orchestration.project_catalog_data_source_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row catalog.data_sources%rowtype;
  v_org uuid;
  v_operation text;
  v_event_type text;
  v_actor_id text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select organization_id into v_org from app.projects where id = v_row.project_id;
  if v_org is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Cannot project data source % because project % is missing', v_row.id, v_row.project_id;
  end if;

  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'CATALOG.DATA_SOURCE_CREATED' when tg_op = 'DELETE' then 'CATALOG.DATA_SOURCE_DELETED' else 'CATALOG.DATA_SOURCE_UPDATED' end;
  v_actor_id := auth.uid()::text;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at, new.created_at, now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument', jsonb_build_object('objectType','DATA_SOURCE','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'sourceType', v_row.source_type,
      'status', v_row.status,
      'knowledgeDocument', jsonb_build_object(
        'objectType','DATA_SOURCE','objectId',v_row.id::text,'label',v_row.name,
        'description',null,
        'content',concat_ws(' ', v_row.name, v_row.source_type, v_row.status),
        'href','/sources/' || v_row.id::text,
        'metadata',jsonb_build_object('sourceType',v_row.source_type,'status',v_row.status),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload)
  values(gen_random_uuid(),v_row.project_id,v_org,1,v_operation,v_event_type,v_occurred_at,'DATA_SOURCE',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload);

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function orchestration.project_governance_document_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row governance.documents%rowtype;
  v_org_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select organization_id into v_org_id from app.projects where id = v_row.project_id;
  if v_org_id is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Cannot project document % because project % is missing', v_row.id, v_row.project_id;
  end if;

  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'GOVERNANCE.DOCUMENT_CREATED' when tg_op = 'DELETE' then 'GOVERNANCE.DOCUMENT_DELETED' else 'GOVERNANCE.DOCUMENT_UPDATED' end;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at,new.created_at,now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument',jsonb_build_object('objectType','DOCUMENT','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'datasetId',v_row.dataset_id,
      'datasetVersionId',v_row.dataset_version_id,
      'profileRunId',v_row.profile_run_id,
      'fileType',v_row.file_type,
      'contentType',v_row.content_type,
      'characterCount',v_row.character_count,
      'chunkCount',v_row.chunk_count,
      'knowledgeDocument',jsonb_build_object(
        'objectType','DOCUMENT',
        'objectId',v_row.id::text,
        'label',coalesce(v_row.file_name,v_row.source_uri),
        'description',concat_ws(' ',v_row.file_type,v_row.content_type,v_row.extraction_method),
        'content',concat_ws(' ',v_row.file_name,v_row.source_uri,v_row.file_type,v_row.content_type),
        'href','/datasets/' || v_row.dataset_id::text,
        'metadata',jsonb_build_object(
          'datasetId',v_row.dataset_id,
          'datasetVersionId',v_row.dataset_version_id,
          'profileRunId',v_row.profile_run_id,
          'fileType',v_row.file_type,
          'contentType',v_row.content_type,
          'contentHash',v_row.content_hash,
          'extractionMethod',v_row.extraction_method,
          'characterCount',v_row.character_count,
          'chunkCount',v_row.chunk_count
        ),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,
    occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_row.project_id,v_org_id,1,v_operation,v_event_type,
    v_occurred_at,'DOCUMENT',v_row.id::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
