create or replace function profiling.reconcile_stale_file_onboarding(p_stale_minutes integer default 60)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, profiling, catalog, storage
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if p_stale_minutes < 15 or p_stale_minutes > 10080 then
    raise exception 'p_stale_minutes must be between 15 and 10080';
  end if;

  for v_id in
    select dv.id
    from catalog.dataset_versions dv
    join profiling.dataset_execution_sources des
      on des.dataset_version_id = dv.id
     and des.source_type = 'FILE'
     and des.active = true
    where dv.status = 'PROCESSING'::catalog.dataset_version_status
      and dv.created_at < now() - make_interval(mins => p_stale_minutes)
      and coalesce(des.execution_config, '{}'::jsonb) = '{}'::jsonb
      and nullif(btrim(dv.source_uri), '') is not null
      and position('://' in dv.source_uri) = 0
      and not exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'dataset-files'
          and (o.name = dv.source_uri or o.name like '%/' || dv.source_uri)
      )
    for update of dv, des skip locked
  loop
    update catalog.dataset_versions
       set status = 'FAILED'::catalog.dataset_version_status,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'reconciliation', jsonb_build_object(
               'reason', 'SOURCE_OBJECT_MISSING',
               'reconciled_at', now(),
               'source_uri', source_uri,
               'stale_minutes', p_stale_minutes
             )
           )
     where id = v_id
       and status = 'PROCESSING'::catalog.dataset_version_status;

    if found then
      update profiling.dataset_execution_sources
         set active = false,
             updated_at = now(),
             execution_config = coalesce(execution_config, '{}'::jsonb) || jsonb_build_object(
               'reconciliation', jsonb_build_object(
                 'reason', 'SOURCE_OBJECT_MISSING',
                 'reconciled_at', now()
               )
             )
       where dataset_version_id = v_id
         and source_type = 'FILE'
         and active = true;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function profiling.reconcile_stale_file_onboarding(integer) from public;
revoke all on function profiling.reconcile_stale_file_onboarding(integer) from anon;
revoke all on function profiling.reconcile_stale_file_onboarding(integer) from authenticated;
grant execute on function profiling.reconcile_stale_file_onboarding(integer) to service_role;

select cron.schedule(
  'dgp-stale-file-onboarding',
  '*/15 * * * *',
  'select profiling.reconcile_stale_file_onboarding(60);'
)
where not exists (
  select 1 from cron.job where jobname = 'dgp-stale-file-onboarding'
);
