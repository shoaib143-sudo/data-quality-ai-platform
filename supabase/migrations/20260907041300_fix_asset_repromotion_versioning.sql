create or replace function catalog.promote_approved_asset(
  p_request_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'catalog', 'profiling', 'public'
as $function$
declare
  v_req catalog.asset_promotion_requests%rowtype;
  v_asset catalog.discovered_assets%rowtype;
  v_source catalog.data_sources%rowtype;
  v_dataset catalog.datasets%rowtype;
  v_existing_version catalog.dataset_versions%rowtype;
  v_version_id uuid;
  v_source_identifier text;
  v_dataset_name text;
  v_next_version integer;
begin
  if p_actor is null then
    raise exception 'Human actor is required';
  end if;

  select * into v_req
  from catalog.asset_promotion_requests
  where id = p_request_id
  for update;

  if not found or v_req.status <> 'APPROVED' then
    raise exception 'Only an approved promotion request can create a governed dataset';
  end if;

  select * into v_asset
  from catalog.discovered_assets
  where source_id = v_req.source_id
    and identity_key = v_req.identity_key
    and is_current
  order by last_seen_at desc
  limit 1;

  if not found then
    raise exception 'Current discovered asset not found';
  end if;

  select * into v_source
  from catalog.data_sources
  where id = v_req.source_id;

  if not found then
    raise exception 'Source not found';
  end if;

  v_source_identifier := coalesce(
    nullif(v_asset.metadata->>'native_qualified_name', ''),
    v_asset.asset_key
  );

  select * into v_dataset
  from catalog.datasets
  where project_id = v_req.project_id
    and data_source_id = v_req.source_id
    and lower(coalesce(source_identifier, '')) = lower(v_source_identifier)
  order by updated_at desc
  limit 1
  for update;

  if not found then
    v_dataset_name := coalesce(nullif(v_asset.namespace, '') || '.', '') || v_asset.name;
    if exists (
      select 1
      from catalog.datasets
      where project_id = v_req.project_id
        and name = v_dataset_name
    ) then
      v_dataset_name := v_dataset_name || ' [' || left(v_req.source_id::text, 8) || ']';
    end if;

    insert into catalog.datasets(
      project_id,
      data_source_id,
      name,
      source_identifier,
      owner_user_id,
      business_domain,
      metadata
    )
    values (
      v_req.project_id,
      v_req.source_id,
      v_dataset_name,
      v_source_identifier,
      p_actor,
      nullif(v_req.recommendations->>'business_domain', ''),
      jsonb_build_object(
        'promotion_request_id', v_req.id,
        'discovered_asset_id', v_asset.id,
        'identity_key', v_req.identity_key,
        'promotion_human_approved', true
      )
    )
    returning * into v_dataset;
  else
    update catalog.datasets
    set source_identifier = v_source_identifier,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'promotion_request_id', v_req.id,
          'discovered_asset_id', v_asset.id,
          'identity_key', v_req.identity_key,
          'promotion_human_approved', true
        ),
        updated_at = now()
    where id = v_dataset.id
    returning * into v_dataset;
  end if;

  select * into v_existing_version
  from catalog.dataset_versions
  where dataset_id = v_dataset.id
    and metadata->>'discovered_asset_id' = v_asset.id::text
  order by version_number desc
  limit 1;

  if found then
    v_version_id := v_existing_version.id;
  else
    select coalesce(max(version_number), 0) + 1
    into v_next_version
    from catalog.dataset_versions
    where dataset_id = v_dataset.id;

    insert into catalog.dataset_versions(
      dataset_id,
      version_number,
      source_uri,
      content_hash,
      schema_hash,
      column_count,
      observed_at,
      status,
      metadata
    )
    values (
      v_dataset.id,
      v_next_version,
      v_source_identifier,
      v_asset.structure_hash,
      v_asset.structure_hash,
      jsonb_array_length(v_asset.columns),
      v_asset.last_seen_at,
      'AVAILABLE',
      jsonb_build_object(
        'discovered_asset_id', v_asset.id,
        'identity_key', v_req.identity_key,
        'source_asset_version', v_asset.version_number,
        'promotion_request_id', v_req.id,
        'promotion_human_approved', true
      )
    )
    returning id into v_version_id;
  end if;

  if not exists (
    select 1
    from profiling.dataset_execution_sources
    where dataset_version_id = v_version_id
      and active = true
  ) then
    insert into profiling.dataset_execution_sources(
      dataset_version_id,
      source_type,
      source_uri,
      execution_config,
      active
    )
    values (
      v_version_id,
      v_source.source_type,
      v_source_identifier,
      jsonb_build_object(
        'source_id', v_source.id,
        'source_type', v_source.source_type,
        'connection_metadata', v_source.connection_metadata
      ),
      true
    );
  end if;

  update catalog.asset_promotion_requests
  set status = 'PROMOTED',
      dataset_id = v_dataset.id,
      updated_at = now()
  where id = v_req.id;

  return v_dataset.id;
end
$function$;
