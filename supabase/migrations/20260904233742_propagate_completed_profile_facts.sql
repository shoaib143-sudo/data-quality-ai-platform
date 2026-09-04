create or replace function profiling.propagate_completed_profile_facts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, profiling, catalog
as $$
declare
  v_duplicate_count bigint;
  v_content_hash text;
begin
  if new.status::text <> 'COMPLETED' then
    return new;
  end if;

  select pm.numeric_value::bigint
    into v_duplicate_count
  from profiling.profile_metrics pm
  where pm.profile_run_id = new.id
    and pm.profile_column_id is null
    and pm.metric_key = 'duplicate_row_count'
  limit 1;

  v_content_hash := coalesce(
    nullif(new.content_hash, ''),
    nullif(new.summary #>> '{source_access,content_hash}', ''),
    nullif(new.summary #>> '{file_metadata,sha256}', '')
  );

  new.duplicate_row_count := coalesce(new.duplicate_row_count, v_duplicate_count);
  new.content_hash := coalesce(new.content_hash, v_content_hash);

  update catalog.dataset_versions dv
  set row_count = coalesce(new.row_count, dv.row_count),
      column_count = coalesce(new.column_count, dv.column_count),
      content_hash = coalesce(new.content_hash, dv.content_hash),
      schema_hash = coalesce(new.schema_hash, dv.schema_hash),
      observed_at = coalesce(new.completed_at, now()),
      metadata = coalesce(dv.metadata, '{}'::jsonb) || jsonb_build_object(
        'latest_profile_run_id', new.id,
        'profile_facts_propagated_at', now(),
        'profiling_engine', new.engine_name,
        'profiling_engine_version', new.engine_version
      )
  where dv.id = new.dataset_version_id;

  return new;
end;
$$;

revoke all on function profiling.propagate_completed_profile_facts() from public, anon, authenticated, service_role;

drop trigger if exists profile_runs_propagate_completed_facts on profiling.profile_runs;
create trigger profile_runs_propagate_completed_facts
before insert or update of status, row_count, column_count, content_hash, schema_hash, summary, completed_at
on profiling.profile_runs
for each row
when (new.status::text = 'COMPLETED')
execute function profiling.propagate_completed_profile_facts();

update profiling.profile_runs
set summary = summary
where status::text = 'COMPLETED'
  and (
    content_hash is null
    or duplicate_row_count is null
    or exists (
      select 1 from catalog.dataset_versions dv
      where dv.id = profiling.profile_runs.dataset_version_id
        and (dv.row_count is null or dv.column_count is null or dv.content_hash is null or dv.schema_hash is null)
    )
  );
