create or replace function orchestration.project_profiling_run_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_dataset_id uuid;
  v_actor_id text;
  v_event_type text;
  v_operation text;
  v_occurred_at timestamptz;
  v_metric_count integer;
  v_chunk record;
begin
  select d.project_id, p.organization_id, d.id
  into v_project_id, v_org_id, v_dataset_id
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  join app.projects p on p.id = d.project_id
  where dv.id = new.dataset_version_id;

  if v_project_id is null or v_org_id is null then
    raise exception 'Cannot project profile run % because dataset/project context is missing', new.id;
  end if;

  v_actor_id := auth.uid()::text;
  v_operation := 'APPEND';
  v_event_type := case when tg_op = 'INSERT' then 'PROFILING.RUN_CREATED' else 'PROFILING.RUN_UPDATED' end;
  v_occurred_at := coalesce(new.completed_at, new.started_at, now());

  insert into orchestration.projection_outbox(
    event_id, project_id, organization_id, schema_version, operation, event_type,
    occurred_at, aggregate_type, aggregate_id, actor_type, actor_id, payload
  ) values (
    gen_random_uuid(), v_project_id, v_org_id, 1, v_operation, v_event_type,
    v_occurred_at, 'PROFILE_RUN', new.id::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end, v_actor_id,
    jsonb_build_object(
      'datasetId', v_dataset_id,
      'datasetVersionId', new.dataset_version_id,
      'status', new.status::text,
      'engineName', new.engine_name,
      'engineVersion', new.engine_version,
      'samplingMode', new.sampling_mode,
      'samplingSize', new.sampling_size,
      'samplingRate', new.sampling_rate,
      'rowCount', new.row_count,
      'columnCount', new.column_count,
      'duplicateRowCount', new.duplicate_row_count,
      'schemaHash', new.schema_hash,
      'configurationHash', new.configuration_hash,
      'profileSignature', new.profile_signature,
      'startedAt', new.started_at,
      'completedAt', new.completed_at,
      'errorCode', new.error_code,
      'summary', new.summary
    )
  );

  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status::text in ('COMPLETED','FAILED','CANCELLED','PARTIAL') then

    select count(*) into v_metric_count
    from profiling.profile_metrics pm
    where pm.profile_run_id = new.id;

    for v_chunk in
      with numbered as (
        select pm.*,
               ((row_number() over (order by pm.created_at, pm.id) - 1) / 500)::integer as batch_no
        from profiling.profile_metrics pm
        where pm.profile_run_id = new.id
      )
      select batch_no,
             jsonb_agg(
               jsonb_build_object(
                 'metricId', id,
                 'metricDefinitionId', metric_definition_id,
                 'profileColumnId', profile_column_id,
                 'metricKey', metric_key,
                 'numericValue', numeric_value,
                 'textValue', text_value,
                 'booleanValue', boolean_value,
                 'jsonValue', json_value,
                 'createdAt', created_at
               )
               order by created_at, id
             ) as metrics
      from numbered
      group by batch_no
      order by batch_no
    loop
      insert into orchestration.projection_outbox(
        event_id, project_id, organization_id, schema_version, operation, event_type,
        occurred_at, aggregate_type, aggregate_id, aggregate_version,
        actor_type, actor_id, payload
      ) values (
        gen_random_uuid(), v_project_id, v_org_id, 1, 'APPEND', 'PROFILING.METRIC_BATCH_CAPTURED',
        v_occurred_at, 'PROFILE_RUN', new.id::text, v_chunk.batch_no::text,
        case when v_actor_id is null then 'SYSTEM' else 'USER' end, v_actor_id,
        jsonb_build_object(
          'datasetId', v_dataset_id,
          'datasetVersionId', new.dataset_version_id,
          'profileRunId', new.id,
          'profileStatus', new.status::text,
          'batchNumber', v_chunk.batch_no,
          'batchSize', jsonb_array_length(v_chunk.metrics),
          'metricCount', v_metric_count,
          'metrics', v_chunk.metrics
        )
      );
    end loop;
  end if;

  return new;
end;
$$;
revoke all on function orchestration.project_profiling_run_change() from public, anon, authenticated;
drop trigger if exists profile_runs_projection_outbox on profiling.profile_runs;
create trigger profile_runs_projection_outbox
after insert or update of status, engine_name, engine_version, sampling_mode, sampling_size, sampling_rate, row_count, column_count, duplicate_row_count, schema_hash, configuration_hash, profile_signature, completed_at, summary, error_code, error_message
on profiling.profile_runs
for each row execute function orchestration.project_profiling_run_change();

create or replace function orchestration.project_profile_finding_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row profiling.profile_findings%rowtype;
  v_project_id uuid;
  v_org_id uuid;
  v_dataset_id uuid;
  v_dataset_version_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  select d.project_id, p.organization_id, d.id, pr.dataset_version_id
  into v_project_id, v_org_id, v_dataset_id, v_dataset_version_id
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
  join catalog.datasets d on d.id = dv.dataset_id
  join app.projects p on p.id = d.project_id
  where pr.id = v_row.profile_run_id;

  if v_project_id is null or v_org_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'PROFILING.FINDING_CREATED' when tg_op = 'DELETE' then 'PROFILING.FINDING_DELETED' else 'PROFILING.FINDING_UPDATED' end;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.created_at, now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object(
      'datasetId', v_dataset_id,
      'datasetVersionId', v_dataset_version_id,
      'profileRunId', v_row.profile_run_id,
      'knowledgeDocument', jsonb_build_object('objectType','FINDING','objectId',v_row.id::text)
    );
  else
    v_payload := jsonb_build_object(
      'datasetId', v_dataset_id,
      'datasetVersionId', v_dataset_version_id,
      'profileRunId', v_row.profile_run_id,
      'profileColumnId', v_row.profile_column_id,
      'findingType', v_row.finding_type,
      'severity', v_row.severity,
      'confidence', v_row.confidence,
      'evidence', v_row.evidence,
      'recommendation', v_row.recommendation,
      'knowledgeDocument', jsonb_build_object(
        'objectType','FINDING',
        'objectId',v_row.id::text,
        'label',v_row.title,
        'description',v_row.description,
        'content',concat_ws(' ',v_row.title,v_row.description,v_row.finding_type,v_row.severity),
        'href','/profiling/runs/' || v_row.profile_run_id::text,
        'metadata',jsonb_build_object(
          'datasetId',v_dataset_id,
          'datasetVersionId',v_dataset_version_id,
          'profileRunId',v_row.profile_run_id,
          'profileColumnId',v_row.profile_column_id,
          'findingType',v_row.finding_type,
          'severity',v_row.severity,
          'confidence',v_row.confidence
        ),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,
    occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_project_id,v_org_id,1,v_operation,v_event_type,
    v_occurred_at,'PROFILE_FINDING',v_row.id::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_profile_finding_change() from public, anon, authenticated;
drop trigger if exists profile_findings_projection_outbox on profiling.profile_findings;
create trigger profile_findings_projection_outbox
after insert or delete or update of profile_column_id, finding_type, severity, title, description, confidence, evidence, recommendation
on profiling.profile_findings
for each row execute function orchestration.project_profile_finding_change();

create or replace function orchestration.project_data_quality_score_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_dataset_id uuid;
  v_dataset_version_id uuid;
  v_actor_id text;
begin
  select d.project_id, p.organization_id, d.id, pr.dataset_version_id
  into v_project_id, v_org_id, v_dataset_id, v_dataset_version_id
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
  join catalog.datasets d on d.id = dv.dataset_id
  join app.projects p on p.id = d.project_id
  where pr.id = new.profile_run_id;

  if v_project_id is null or v_org_id is null then
    raise exception 'Cannot project DQ score % because profile run context is missing', new.id;
  end if;

  v_actor_id := auth.uid()::text;
  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,
    occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_project_id,v_org_id,1,'APPEND',
    case when tg_op = 'INSERT' then 'DQ.SCORE_CREATED' else 'DQ.SCORE_UPDATED' end,
    coalesce(new.created_at,now()),'DATA_QUALITY_SCORE',new.id::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,
    jsonb_build_object(
      'datasetId',v_dataset_id,
      'datasetVersionId',v_dataset_version_id,
      'profileRunId',new.profile_run_id,
      'completenessScore',new.completeness_score,
      'uniquenessScore',new.uniqueness_score,
      'validityScore',new.validity_score,
      'accuracyScore',new.accuracy_score,
      'overallScore',new.overall_score
    )
  );
  return new;
end;
$$;
revoke all on function orchestration.project_data_quality_score_change() from public, anon, authenticated;
drop trigger if exists data_quality_scores_projection_outbox on profiling.data_quality_scores;
create trigger data_quality_scores_projection_outbox
after insert or update of completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score
on profiling.data_quality_scores
for each row execute function orchestration.project_data_quality_score_change();

create or replace function orchestration.project_governance_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_org_id is null then raise exception 'Cannot project document % because project % is missing', v_row.id, v_row.project_id; end if;

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
$$;
revoke all on function orchestration.project_governance_document_change() from public, anon, authenticated;
drop trigger if exists documents_projection_outbox on governance.documents;
create trigger documents_projection_outbox
after insert or delete or update of file_name, file_type, content_type, content_hash, extraction_method, character_count, chunk_count, metadata
on governance.documents
for each row execute function orchestration.project_governance_document_change();

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
  select * into v_document from governance.documents where id = v_row.document_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select organization_id into v_org_id from app.projects where id = v_row.project_id;
  if v_org_id is null then raise exception 'Cannot project document chunk % because project % is missing',v_row.id,v_row.project_id; end if;

  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'GOVERNANCE.DOCUMENT_CHUNK_CREATED' when tg_op = 'DELETE' then 'GOVERNANCE.DOCUMENT_CHUNK_DELETED' else 'GOVERNANCE.DOCUMENT_CHUNK_UPDATED' end;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at,new.created_at,now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument',jsonb_build_object('objectType','DOCUMENT_CHUNK','objectId',v_row.id::text));
  else
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
drop trigger if exists document_chunks_projection_outbox on governance.document_chunks;
create trigger document_chunks_projection_outbox
after insert or delete or update of chunk_index, content, content_hash, character_count, metadata
on governance.document_chunks
for each row execute function orchestration.project_governance_document_chunk_change();