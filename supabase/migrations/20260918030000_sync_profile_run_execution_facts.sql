begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Keep authoritative profile-run execution facts synchronized with the
-- dataset-level metrics that are persisted atomically by the profiling engine.
-- This runs inside profiling.persist_profiling_results(), so a later contract
-- failure rolls these updates back with the metrics/findings/score transaction.
create or replace function profiling.sync_profile_run_execution_facts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, profiling
as $$
begin
  if new.profile_column_id is not null then
    return new;
  end if;

  if new.metric_key = 'row_count' then
    if new.numeric_value is null
      or new.numeric_value < 0
      or trunc(new.numeric_value) <> new.numeric_value then
      raise exception 'PROFILE_RUN_FACT_INVALID: row_count must be a non-negative integer';
    end if;

    update profiling.profile_runs
    set row_count = new.numeric_value::bigint
    where id = new.profile_run_id;

  elsif new.metric_key = 'column_count' then
    if new.numeric_value is null
      or new.numeric_value < 0
      or trunc(new.numeric_value) <> new.numeric_value
      or new.numeric_value > 2147483647 then
      raise exception 'PROFILE_RUN_FACT_INVALID: column_count must be a non-negative integer';
    end if;

    update profiling.profile_runs
    set column_count = new.numeric_value::integer
    where id = new.profile_run_id;

  elsif new.metric_key = 'schema_hash' then
    if nullif(btrim(new.text_value), '') is null then
      raise exception 'PROFILE_RUN_FACT_INVALID: schema_hash must be non-empty';
    end if;

    update profiling.profile_runs
    set schema_hash = new.text_value
    where id = new.profile_run_id;
  end if;

  return new;
end;
$$;

revoke all on function profiling.sync_profile_run_execution_facts() from public, anon, authenticated;
grant execute on function profiling.sync_profile_run_execution_facts() to service_role;

drop trigger if exists trg_sync_profile_run_execution_facts on profiling.profile_metrics;
create trigger trg_sync_profile_run_execution_facts
after insert or update of metric_key, profile_run_id, profile_column_id, numeric_value, text_value
on profiling.profile_metrics
for each row
when (new.profile_column_id is null)
execute function profiling.sync_profile_run_execution_facts();

-- Fail closed if the trigger is not present after migration replay.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'profiling'
      and c.relname = 'profile_metrics'
      and t.tgname = 'trg_sync_profile_run_execution_facts'
      and not t.tgisinternal
  ) then
    raise exception 'PROFILE_RUN_FACT_SYNC_INVALID: trigger is missing';
  end if;
end
$$;

commit;
