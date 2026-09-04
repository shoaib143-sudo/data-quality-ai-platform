-- Atomic catalog projections into the ordered, append-only projection log.
-- PostgreSQL remains authoritative; OpenSearch/ClickHouse consumers advance independently.

create or replace function orchestration.project_catalog_dataset_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dataset catalog.datasets%rowtype;
  v_organization_id uuid;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_actor_id text;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    v_dataset := old;
    v_operation := 'DELETE';
    v_event_type := 'CATALOG.DATASET_DELETED';
    v_occurred_at := now();
  elsif tg_op = 'INSERT' then
    v_dataset := new;
    v_operation := 'UPSERT';
    v_event_type := 'CATALOG.DATASET_REGISTERED';
    v_occurred_at := coalesce(new.updated_at, new.created_at, now());
  else
    v_dataset := new;
    v_operation := 'UPSERT';
    v_event_type := 'CATALOG.DATASET_UPDATED';
    v_occurred_at := coalesce(new.updated_at, now());
  end if;

  select p.organization_id into v_organization_id
  from app.projects p
  where p.id = v_dataset.project_id;

  if v_organization_id is null then
    raise exception 'Cannot project dataset % because project % is missing', v_dataset.id, v_dataset.project_id;
  end if;

  v_actor_id := auth.uid()::text;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object(
      'knowledgeDocument', jsonb_build_object(
        'objectType', 'DATASET',
        'objectId', v_dataset.id::text
      )
    );
  else
    v_payload := jsonb_build_object(
      'dataSourceId', v_dataset.data_source_id,
      'sourceIdentifier', v_dataset.source_identifier,
      'businessDomain', v_dataset.business_domain,
      'status', v_dataset.status::text,
      'profilingReady', v_dataset.metadata -> 'profiling_ready',
      'knowledgeDocument', jsonb_build_object(
        'objectType', 'DATASET',
        'objectId', v_dataset.id::text,
        'label', v_dataset.name,
        'description', v_dataset.description,
        'content', concat_ws(' ', v_dataset.name, v_dataset.description, v_dataset.business_domain, v_dataset.source_identifier),
        'href', '/datasets/' || v_dataset.id::text,
        'metadata', jsonb_build_object(
          'businessDomain', v_dataset.business_domain,
          'status', v_dataset.status::text,
          'sourceType', v_dataset.metadata ->> 'registered_source_type',
          'profilingReady', v_dataset.metadata -> 'profiling_ready'
        ),
        'updatedAt', v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox (
    event_id, project_id, organization_id, schema_version, operation, event_type,
    occurred_at, aggregate_type, aggregate_id, aggregate_version,
    actor_type, actor_id, payload
  ) values (
    gen_random_uuid(), v_dataset.project_id, v_organization_id, 1, v_operation, v_event_type,
    v_occurred_at, 'DATASET', v_dataset.id::text,
    nullif(v_dataset.metadata ->> 'current_version_number', ''),
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,
    v_actor_id,
    v_payload
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function orchestration.project_catalog_dataset_change() from public, anon, authenticated;

drop trigger if exists datasets_projection_outbox on catalog.datasets;
create trigger datasets_projection_outbox
after insert or delete or update of data_source_id, name, description, source_identifier, business_domain, status, metadata
on catalog.datasets
for each row execute function orchestration.project_catalog_dataset_change();

create or replace function orchestration.project_catalog_dataset_version_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_organization_id uuid;
  v_event_type text;
  v_actor_id text;
begin
  select d.project_id, p.organization_id
  into v_project_id, v_organization_id
  from catalog.datasets d
  join app.projects p on p.id = d.project_id
  where d.id = new.dataset_id;

  if v_project_id is null or v_organization_id is null then
    raise exception 'Cannot project dataset version % because dataset/project context is missing', new.id;
  end if;

  v_event_type := case when tg_op = 'INSERT' then 'CATALOG.DATASET_VERSION_CREATED' else 'CATALOG.DATASET_VERSION_UPDATED' end;
  v_actor_id := auth.uid()::text;

  insert into orchestration.projection_outbox (
    event_id, project_id, organization_id, schema_version, operation, event_type,
    occurred_at, aggregate_type, aggregate_id, aggregate_version,
    actor_type, actor_id, payload
  ) values (
    gen_random_uuid(), v_project_id, v_organization_id, 1, 'APPEND', v_event_type,
    coalesce(new.observed_at, new.created_at, now()), 'DATASET_VERSION', new.id::text, new.version_number::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,
    v_actor_id,
    jsonb_build_object(
      'datasetId', new.dataset_id,
      'versionNumber', new.version_number,
      'status', new.status::text,
      'sourceUri', new.source_uri,
      'schemaHash', new.schema_hash,
      'rowCount', new.row_count,
      'columnCount', new.column_count,
      'sizeBytes', new.size_bytes,
      'profilingReady', new.metadata -> 'profiling_ready'
    )
  );

  return new;
end;
$$;

revoke all on function orchestration.project_catalog_dataset_version_change() from public, anon, authenticated;

drop trigger if exists dataset_versions_projection_outbox on catalog.dataset_versions;
create trigger dataset_versions_projection_outbox
after insert or update of source_uri, schema_hash, row_count, column_count, size_bytes, observed_at, status, metadata
on catalog.dataset_versions
for each row execute function orchestration.project_catalog_dataset_version_change();
