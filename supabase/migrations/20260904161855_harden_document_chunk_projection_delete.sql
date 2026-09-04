create or replace function orchestration.project_governance_document_chunk_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row governance.document_chunks%rowtype;
  v_org_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_document governance.documents%rowtype;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select organization_id into v_org_id from app.projects where id = v_row.project_id;
  if v_org_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'GOVERNANCE.DOCUMENT_CHUNK_CREATED' when tg_op = 'DELETE' then 'GOVERNANCE.DOCUMENT_CHUNK_DELETED' else 'GOVERNANCE.DOCUMENT_CHUNK_UPDATED' end;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at,new.created_at,now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object(
      'documentId',v_row.document_id,
      'chunkIndex',v_row.chunk_index,
      'knowledgeDocument',jsonb_build_object('objectType','DOCUMENT_CHUNK','objectId',v_row.id::text)
    );
  else
    select * into v_document from governance.documents where id = v_row.document_id;
    if not found then
      raise exception 'Cannot project document chunk % because document % is missing',v_row.id,v_row.document_id;
    end if;
    v_payload := jsonb_build_object(
      'documentId',v_row.document_id,
      'datasetId',v_document.dataset_id,
      'datasetVersionId',v_document.dataset_version_id,
      'chunkIndex',v_row.chunk_index,
      'knowledgeDocument',jsonb_build_object(
        'objectType','DOCUMENT_CHUNK',
        'objectId',v_row.id::text,
        'label',coalesce(v_document.file_name,v_document.source_uri) || ' #' || v_row.chunk_index::text,
        'description',null,
        'content',v_row.content,
        'href','/datasets/' || v_document.dataset_id::text,
        'metadata',jsonb_build_object(
          'documentId',v_row.document_id,
          'datasetId',v_document.dataset_id,
          'datasetVersionId',v_document.dataset_version_id,
          'chunkIndex',v_row.chunk_index,
          'contentHash',v_row.content_hash,
          'characterCount',v_row.character_count
        ),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,
    occurred_at,aggregate_type,aggregate_id,aggregate_version,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_row.project_id,v_org_id,1,v_operation,v_event_type,
    v_occurred_at,'DOCUMENT_CHUNK',v_row.id::text,v_row.chunk_index::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_governance_document_chunk_change() from public, anon, authenticated;