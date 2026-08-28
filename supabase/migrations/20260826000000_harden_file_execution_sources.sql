begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Resolve the execution source registered for a dataset version.
-- The profiling application owns physical source loading. This RPC exposes
-- only the source contract and keeps storage credentials out of the catalog.
create or replace function profiling.get_dataset_execution_source(
  p_dataset_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, catalog, profiling, app_private
as $$
declare
  v_source jsonb;
begin
  if p_dataset_version_id is null then
    raise exception 'dataset_version_id is required';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'dataset_version_id', s.dataset_version_id,
    'source_type', s.source_type,
    'source_uri', s.source_uri,
    'execution_config', coalesce(s.execution_config, '{}'::jsonb),
    'active', s.active,
    'created_at', s.created_at,
    'updated_at', s.updated_at
  )
  into v_source
  from profiling.dataset_execution_sources s
  where s.dataset_version_id = p_dataset_version_id
    and s.active = true
  order by s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1;

  if v_source is null then
    raise exception
      'No active execution source registered for dataset version %',
      p_dataset_version_id;
  end if;

  return v_source;
end;
$$;

grant execute on function profiling.get_dataset_execution_source(uuid)
to service_role;

-- Guard against multiple active execution sources for one dataset version.
create unique index if not exists
  ux_dataset_execution_sources_active_version
on profiling.dataset_execution_sources(dataset_version_id)
where active = true;

commit;
