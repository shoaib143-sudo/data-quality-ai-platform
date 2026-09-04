create or replace function orchestration.projection_seed_event_uuid(p_key text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select (
    substr(md5(p_key),1,8) || '-' ||
    substr(md5(p_key),9,4) || '-' ||
    substr(md5(p_key),13,4) || '-' ||
    substr(md5(p_key),17,4) || '-' ||
    substr(md5(p_key),21,12)
  )::uuid
$$;
revoke all on function orchestration.projection_seed_event_uuid(text) from public, anon, authenticated;
grant execute on function orchestration.projection_seed_event_uuid(text) to service_role;

create or replace function orchestration.seed_initial_projection(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_run_id uuid;
  v_total bigint := 0;
  v_rows bigint := 0;
  v_details jsonb := '{}'::jsonb;
begin
  select organization_id into v_org_id from app.projects where id=p_project_id;
  if v_org_id is null then raise exception 'Project % was not found',p_project_id; end if;

  if exists (
    select 1 from orchestration.projection_reconciliation_runs
    where project_id=p_project_id
      and provider_key='projection_outbox'
      and projection_name='initial_projection_seed_v1'
      and status='PASSED'
  ) then
    return jsonb_build_object('projectId',p_project_id,'status','ALREADY_SEEDED','projection','initial_projection_seed_v1');
  end if;

  insert into orchestration.projection_reconciliation_runs(
    project_id,provider_key,projection_name,status,started_at,details
  ) values (
    p_project_id,'projection_outbox','initial_projection_seed_v1','RUNNING',now(),jsonb_build_object('seedVersion',1)
  ) returning id into v_run_id;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DATA_SOURCE:' || ds.id::text || ':v1'),
    ds.project_id,v_org_id,1,'REBUILD','CATALOG.DATA_SOURCE_UPDATED',coalesce(ds.updated_at,ds.created_at),
    'DATA_SOURCE',ds.id::text,'SYSTEM',
    jsonb_build_object(
      'sourceType',ds.source_type,'status',ds.status,
      'knowledgeDocument',jsonb_build_object(
        'objectType','DATA_SOURCE','objectId',ds.id::text,'label',ds.name,'description',null,
        'content',concat_ws(' ',ds.name,ds.source_type,ds.status),
        'href','/sources/'||ds.id::text,
        'metadata',jsonb_build_object('sourceType',ds.source_type,'status',ds.status),
        'updatedAt',coalesce(ds.updated_at,ds.created_at)
      )
    )
  from catalog.data_sources ds
  where ds.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('dataSources',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,aggregate_version,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DATASET:' || d.id::text || ':v1'),
    d.project_id,v_org_id,1,'REBUILD','CATALOG.DATASET_UPDATED',coalesce(d.updated_at,d.created_at),
    'DATASET',d.id::text,nullif(d.metadata->>'current_version_number',''),'SYSTEM',
    jsonb_build_object(
      'dataSourceId',d.data_source_id,'sourceIdentifier',d.source_identifier,'businessDomain',d.business_domain,
      'status',d.status::text,'profilingReady',d.metadata->'profiling_ready',
      'knowledgeDocument',jsonb_build_object(
        'objectType','DATASET','objectId',d.id::text,'label',d.name,'description',d.description,
        'content',concat_ws(' ',d.name,d.description,d.business_domain,d.source_identifier),
        'href','/datasets/'||d.id::text,
        'metadata',jsonb_build_object(
          'businessDomain',d.business_domain,'status',d.status::text,
          'sourceType',d.metadata->>'registered_source_type','profilingReady',d.metadata->'profiling_ready'
        ),
        'updatedAt',coalesce(d.updated_at,d.created_at)
      )
    )
  from catalog.datasets d
  where d.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('datasets',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,aggregate_version,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DATASET_VERSION:' || dv.id::text || ':v1'),
    d.project_id,v_org_id,1,'REBUILD','CATALOG.DATASET_VERSION_UPDATED',coalesce(dv.observed_at,dv.created_at),
    'DATASET_VERSION',dv.id::text,dv.version_number::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',dv.dataset_id,'versionNumber',dv.version_number,'status',dv.status::text,
      'sourceUri',dv.source_uri,'schemaHash',dv.schema_hash,'rowCount',dv.row_count,
      'columnCount',dv.column_count,'sizeBytes',dv.size_bytes,'profilingReady',dv.metadata->'profiling_ready'
    )
  from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id
  where d.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('datasetVersions',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':GLOSSARY_TERM:' || gt.id::text || ':v1'),
    gt.project_id,v_org_id,1,'REBUILD','GOVERNANCE.GLOSSARY_TERM_UPDATED',coalesce(gt.updated_at,gt.created_at),
    'GLOSSARY_TERM',gt.id::text,'SYSTEM',
    jsonb_build_object(
      'status',gt.status,'domain',gt.domain,
      'knowledgeDocument',jsonb_build_object(
        'objectType','GLOSSARY_TERM','objectId',gt.id::text,'label',gt.term,'description',gt.definition,
        'content',concat_ws(' ',gt.term,gt.definition,gt.domain,array_to_string(gt.synonyms,' ')),
        'href','/glossary/'||gt.id::text,
        'metadata',jsonb_build_object('domain',gt.domain,'status',gt.status,'synonyms',to_jsonb(gt.synonyms)),
        'updatedAt',coalesce(gt.updated_at,gt.created_at)
      )
    )
  from governance.glossary_terms gt
  where gt.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('glossaryTerms',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,aggregate_version,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DATA_CONTRACT:' || dc.id::text || ':v1'),
    dc.project_id,v_org_id,1,'REBUILD','GOVERNANCE.DATA_CONTRACT_UPDATED',coalesce(dc.updated_at,dc.created_at),
    'DATA_CONTRACT',dc.id::text,dc.current_version::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',dc.dataset_id,'status',dc.status,'currentVersion',dc.current_version,
      'knowledgeDocument',jsonb_build_object(
        'objectType','DATA_CONTRACT','objectId',dc.id::text,'label',dc.name,'description',null,
        'content',concat_ws(' ',dc.name,dc.status,'version',dc.current_version::text),
        'href','/contracts/'||dc.id::text,
        'metadata',jsonb_build_object('datasetId',dc.dataset_id,'status',dc.status,'currentVersion',dc.current_version),
        'updatedAt',coalesce(dc.updated_at,dc.created_at)
      )
    )
  from governance.data_contracts dc
  where dc.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('dataContracts',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':CLASSIFICATION:' || cl.id::text || ':v1'),
    cl.project_id,v_org_id,1,'REBUILD','GOVERNANCE.CLASSIFICATION_UPDATED',now(),
    'CLASSIFICATION',cl.id::text,'SYSTEM',
    jsonb_build_object(
      'code',cl.code,'category',cl.category,'enabled',cl.enabled,
      'knowledgeDocument',jsonb_build_object(
        'objectType','CLASSIFICATION','objectId',cl.id::text,'label',cl.name,'description',cl.description,
        'content',concat_ws(' ',cl.code,cl.name,cl.category,cl.description),
        'href','/classification',
        'metadata',jsonb_build_object('code',cl.code,'category',cl.category,'enabled',cl.enabled),
        'updatedAt',now()
      )
    )
  from governance.classification_labels cl
  where cl.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('classifications',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DOCUMENT:' || doc.id::text || ':v1'),
    doc.project_id,v_org_id,1,'REBUILD','GOVERNANCE.DOCUMENT_UPDATED',coalesce(doc.updated_at,doc.created_at),
    'DOCUMENT',doc.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',doc.dataset_id,'datasetVersionId',doc.dataset_version_id,'profileRunId',doc.profile_run_id,
      'fileType',doc.file_type,'contentType',doc.content_type,'characterCount',doc.character_count,'chunkCount',doc.chunk_count,
      'knowledgeDocument',jsonb_build_object(
        'objectType','DOCUMENT','objectId',doc.id::text,'label',coalesce(doc.file_name,doc.source_uri),
        'description',concat_ws(' ',doc.file_type,doc.content_type,doc.extraction_method),
        'content',concat_ws(' ',doc.file_name,doc.source_uri,doc.file_type,doc.content_type),
        'href','/datasets/'||doc.dataset_id::text,
        'metadata',jsonb_build_object(
          'datasetId',doc.dataset_id,'datasetVersionId',doc.dataset_version_id,'profileRunId',doc.profile_run_id,
          'fileType',doc.file_type,'contentType',doc.content_type,'contentHash',doc.content_hash,
          'extractionMethod',doc.extraction_method,'characterCount',doc.character_count,'chunkCount',doc.chunk_count
        ),
        'updatedAt',coalesce(doc.updated_at,doc.created_at)
      )
    )
  from governance.documents doc
  where doc.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('documents',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,aggregate_version,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DOCUMENT_CHUNK:' || ch.id::text || ':v1'),
    ch.project_id,v_org_id,1,'REBUILD','GOVERNANCE.DOCUMENT_CHUNK_UPDATED',coalesce(ch.updated_at,ch.created_at),
    'DOCUMENT_CHUNK',ch.id::text,ch.chunk_index::text,'SYSTEM',
    jsonb_build_object(
      'documentId',ch.document_id,'datasetId',doc.dataset_id,'datasetVersionId',doc.dataset_version_id,'chunkIndex',ch.chunk_index,
      'knowledgeDocument',jsonb_build_object(
        'objectType','DOCUMENT_CHUNK','objectId',ch.id::text,
        'label',coalesce(doc.file_name,doc.source_uri)||' #'||ch.chunk_index::text,'description',null,'content',ch.content,
        'href','/datasets/'||doc.dataset_id::text,
        'metadata',jsonb_build_object(
          'documentId',ch.document_id,'datasetId',doc.dataset_id,'datasetVersionId',doc.dataset_version_id,
          'chunkIndex',ch.chunk_index,'contentHash',ch.content_hash,'characterCount',ch.character_count
        ),
        'updatedAt',coalesce(ch.updated_at,ch.created_at)
      )
    )
  from governance.document_chunks ch join governance.documents doc on doc.id=ch.document_id
  where ch.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('documentChunks',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':PROFILE_RUN:' || pr.id::text || ':v1'),
    d.project_id,v_org_id,1,'REBUILD','PROFILING.RUN_UPDATED',coalesce(pr.completed_at,pr.started_at),
    'PROFILE_RUN',pr.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',d.id,'datasetVersionId',pr.dataset_version_id,'status',pr.status::text,
      'engineName',pr.engine_name,'engineVersion',pr.engine_version,'samplingMode',pr.sampling_mode,
      'samplingSize',pr.sampling_size,'samplingRate',pr.sampling_rate,'rowCount',pr.row_count,
      'columnCount',pr.column_count,'duplicateRowCount',pr.duplicate_row_count,'schemaHash',pr.schema_hash,
      'configurationHash',pr.configuration_hash,'profileSignature',pr.profile_signature,'startedAt',pr.started_at,
      'completedAt',pr.completed_at,'errorCode',pr.error_code,'summary',pr.summary
    )
  from profiling.profile_runs pr
  join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
  join catalog.datasets d on d.id=dv.dataset_id
  where d.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('profileRuns',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':PROFILE_FINDING:' || pf.id::text || ':v1'),
    d.project_id,v_org_id,1,'REBUILD','PROFILING.FINDING_UPDATED',pf.created_at,
    'PROFILE_FINDING',pf.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',d.id,'datasetVersionId',pr.dataset_version_id,'profileRunId',pf.profile_run_id,
      'profileColumnId',pf.profile_column_id,'findingType',pf.finding_type,'severity',pf.severity,
      'confidence',pf.confidence,'evidence',pf.evidence,'recommendation',pf.recommendation,
      'knowledgeDocument',jsonb_build_object(
        'objectType','FINDING','objectId',pf.id::text,'label',pf.title,'description',pf.description,
        'content',concat_ws(' ',pf.title,pf.description,pf.finding_type,pf.severity),
        'href','/profiling/runs/'||pf.profile_run_id::text,
        'metadata',jsonb_build_object(
          'datasetId',d.id,'datasetVersionId',pr.dataset_version_id,'profileRunId',pf.profile_run_id,
          'profileColumnId',pf.profile_column_id,'findingType',pf.finding_type,'severity',pf.severity,'confidence',pf.confidence
        ),
        'updatedAt',pf.created_at
      )
    )
  from profiling.profile_findings pf
  join profiling.profile_runs pr on pr.id=pf.profile_run_id
  join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
  join catalog.datasets d on d.id=dv.dataset_id
  where d.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('profileFindings',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':DQ_SCORE:' || qs.id::text || ':v1'),
    d.project_id,v_org_id,1,'REBUILD','DQ.SCORE_UPDATED',qs.created_at,
    'DATA_QUALITY_SCORE',qs.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',d.id,'datasetVersionId',pr.dataset_version_id,'profileRunId',qs.profile_run_id,
      'completenessScore',qs.completeness_score,'uniquenessScore',qs.uniqueness_score,
      'validityScore',qs.validity_score,'accuracyScore',qs.accuracy_score,'overallScore',qs.overall_score
    )
  from profiling.data_quality_scores qs
  join profiling.profile_runs pr on pr.id=qs.profile_run_id
  join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
  join catalog.datasets d on d.id=dv.dataset_id
  where d.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('dataQualityScores',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,aggregate_version,actor_type,payload
  )
  with numbered as (
    select pm.*,pr.dataset_version_id,d.id as dataset_id,d.project_id,
           coalesce(pr.completed_at,pr.started_at) as occurred_at,
           ((row_number() over(partition by pm.profile_run_id order by pm.created_at,pm.id)-1)/500)::integer as batch_no
    from profiling.profile_metrics pm
    join profiling.profile_runs pr on pr.id=pm.profile_run_id
    join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
    join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id
  ), batches as (
    select profile_run_id,dataset_version_id,dataset_id,project_id,occurred_at,batch_no,
           count(*) as metric_count,
           jsonb_agg(jsonb_build_object(
             'metricId',id,'metricDefinitionId',metric_definition_id,'profileColumnId',profile_column_id,
             'metricKey',metric_key,'numericValue',numeric_value,'textValue',text_value,
             'booleanValue',boolean_value,'jsonValue',json_value,'createdAt',created_at
           ) order by created_at,id) as metrics
    from numbered
    group by profile_run_id,dataset_version_id,dataset_id,project_id,occurred_at,batch_no
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text || ':PROFILE_METRIC_BATCH:' || profile_run_id::text || ':' || batch_no::text || ':v1'),
    project_id,v_org_id,1,'REBUILD','PROFILING.METRIC_BATCH_CAPTURED',occurred_at,
    'PROFILE_RUN',profile_run_id::text,batch_no::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',dataset_id,'datasetVersionId',dataset_version_id,'profileRunId',profile_run_id,
      'batchNumber',batch_no,'batchSize',jsonb_array_length(metrics),'metricCount',metric_count,'metrics',metrics
    )
  from batches
  on conflict(event_id) do nothing;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows; v_details := v_details || jsonb_build_object('profileMetricBatches',v_rows);

  update orchestration.projection_reconciliation_runs
  set status='PASSED',expected_count=v_total,actual_count=v_total,mismatch_count=0,
      completed_at=now(),details=details||v_details||jsonb_build_object('seedVersion',1)
  where id=v_run_id;

  return jsonb_build_object('projectId',p_project_id,'status','PASSED','projection','initial_projection_seed_v1','eventsEnqueued',v_total,'details',v_details);
end;
$$;
revoke all on function orchestration.seed_initial_projection(uuid) from public, anon, authenticated;
grant execute on function orchestration.seed_initial_projection(uuid) to service_role;
