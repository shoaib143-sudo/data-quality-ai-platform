create or replace function orchestration.project_catalog_dataset_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
    if tg_op = 'DELETE' then
      return old;
    end if;
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
$function$;
