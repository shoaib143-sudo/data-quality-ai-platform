create or replace function profiling.normalize_metric_contract()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, profiling
as $$
declare
  metric_scope profiling.metric_scope;
  existing_dataset_metric_id uuid;
begin
  select scope into metric_scope from profiling.metric_definitions
  where id = new.metric_definition_id and metric_key = new.metric_key and enabled = true;
  if not found then
    raise exception 'Metric contract violation: metric_definition_id % does not match enabled metric_key %', new.metric_definition_id, new.metric_key;
  end if;
  if metric_scope = 'DATASET' then
    new.profile_column_id := null;
    select id into existing_dataset_metric_id from profiling.profile_metrics
    where profile_run_id = new.profile_run_id and metric_key = new.metric_key and profile_column_id is null limit 1;
    if existing_dataset_metric_id is not null and (tg_op = 'INSERT' or existing_dataset_metric_id <> new.id) then return null; end if;
  elsif metric_scope in ('COLUMN','DISTRIBUTION') then
    if new.profile_column_id is null then
      raise exception 'Metric contract violation: % metric % requires profile_column_id', metric_scope, new.metric_key;
    end if;
    if not exists (select 1 from profiling.profile_columns pc where pc.id = new.profile_column_id and pc.profile_run_id = new.profile_run_id) then
      raise exception 'Metric contract violation: profile_column_id % does not belong to profile_run_id %', new.profile_column_id, new.profile_run_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function profiling.normalize_metric_contract() from public, anon, authenticated;

drop trigger if exists trg_normalize_metric_contract on profiling.profile_metrics;
create trigger trg_normalize_metric_contract before insert or update on profiling.profile_metrics for each row execute function profiling.normalize_metric_contract();

create or replace function profiling.validate_metric_execution_contract(p_profile_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, profiling
as $$
declare
  profile_column_count integer;
  actual_column_count integer;
  expected_dataset_metric_count integer;
  actual_dataset_metric_count integer;
  expected_column_metric_count integer;
  actual_column_metric_count integer;
  expected_distribution_metric_count integer;
  actual_distribution_metric_count integer;
  missing_keys jsonb;
begin
  select count(*) into profile_column_count from profiling.profile_columns where profile_run_id = p_profile_run_id;
  select count(distinct profile_column_id) into actual_column_count from profiling.profile_metrics where profile_run_id = p_profile_run_id and profile_column_id is not null;
  select count(*) into expected_dataset_metric_count from profiling.metric_definitions where enabled = true and scope = 'DATASET';
  select count(*) into expected_column_metric_count from profiling.metric_definitions where enabled = true and scope = 'COLUMN';
  select count(*) into expected_distribution_metric_count from profiling.metric_definitions where enabled = true and scope = 'DISTRIBUTION';
  select count(*) into actual_dataset_metric_count from profiling.profile_metrics pm join profiling.metric_definitions md on md.id = pm.metric_definition_id where pm.profile_run_id = p_profile_run_id and pm.profile_column_id is null and md.enabled = true and md.scope = 'DATASET';
  select count(*) into actual_column_metric_count from profiling.profile_metrics pm join profiling.metric_definitions md on md.id = pm.metric_definition_id where pm.profile_run_id = p_profile_run_id and pm.profile_column_id is not null and md.enabled = true and md.scope = 'COLUMN';
  select count(*) into actual_distribution_metric_count from profiling.profile_metrics pm join profiling.metric_definitions md on md.id = pm.metric_definition_id where pm.profile_run_id = p_profile_run_id and pm.profile_column_id is not null and md.enabled = true and md.scope = 'DISTRIBUTION';
  select coalesce(jsonb_agg(key order by key), '[]'::jsonb) into missing_keys from (
    select md.metric_key as key from profiling.metric_definitions md
    where md.enabled and md.scope = 'DATASET' and not exists (select 1 from profiling.profile_metrics pm where pm.profile_run_id=p_profile_run_id and pm.metric_definition_id=md.id and pm.profile_column_id is null)
    union all
    select md.metric_key || ':column' from profiling.metric_definitions md cross join profiling.profile_columns pc
    where md.enabled and md.scope in ('COLUMN','DISTRIBUTION') and pc.profile_run_id=p_profile_run_id and not exists (select 1 from profiling.profile_metrics pm where pm.profile_run_id=p_profile_run_id and pm.profile_column_id=pc.id and pm.metric_definition_id=md.id)
  ) missing;
  return jsonb_build_object(
    'valid', profile_column_count = actual_column_count
      and actual_dataset_metric_count = expected_dataset_metric_count
      and actual_column_metric_count = expected_column_metric_count * profile_column_count
      and actual_distribution_metric_count = expected_distribution_metric_count * profile_column_count,
    'profile_run_id', p_profile_run_id,
    'profile_column_count', profile_column_count,
    'actual_column_count', actual_column_count,
    'expected_dataset_metric_count', expected_dataset_metric_count,
    'actual_dataset_metric_count', actual_dataset_metric_count,
    'expected_column_metric_count_per_column', expected_column_metric_count,
    'actual_column_metric_count', actual_column_metric_count,
    'expected_distribution_metric_count_per_column', expected_distribution_metric_count,
    'actual_distribution_metric_count', actual_distribution_metric_count,
    'missing_metric_keys', missing_keys
  );
end;
$$;
revoke execute on function profiling.validate_metric_execution_contract(uuid) from public, anon, authenticated;
