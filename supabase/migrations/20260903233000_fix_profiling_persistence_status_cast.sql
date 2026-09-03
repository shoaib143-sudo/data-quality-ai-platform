create or replace function profiling.persist_profiling_results(
  p_profile_run_id uuid,
  p_dataset_version_id uuid,
  p_metrics jsonb default '[]'::jsonb,
  p_findings jsonb default '[]'::jsonb,
  p_score jsonb default '{}'::jsonb,
  p_summary jsonb default '{}'::jsonb,
  p_status text default 'COMPLETED'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, profiling
as $function$
declare
  v_run profiling.profile_runs%rowtype;
  v_contract jsonb;
  v_overall_score numeric;
  v_status profiling.run_status;
begin
  begin
    v_status := p_status::profiling.run_status;
  exception when invalid_text_representation then
    raise exception 'Invalid profiling run status: %', p_status;
  end;

  select * into v_run
  from profiling.profile_runs
  where id = p_profile_run_id
    and dataset_version_id = p_dataset_version_id
  for update;

  if not found then
    raise exception 'Profiling run % was not found for dataset version %', p_profile_run_id, p_dataset_version_id;
  end if;

  if v_run.status = 'CANCELLED' then
    raise exception 'Profiling run % has been cancelled', p_profile_run_id;
  end if;

  delete from profiling.profile_metrics where profile_run_id = p_profile_run_id;
  delete from profiling.profile_findings where profile_run_id = p_profile_run_id;

  insert into profiling.profile_metrics (
    profile_run_id, metric_definition_id, profile_column_id, metric_key,
    numeric_value, text_value, boolean_value, json_value
  )
  select
    p_profile_run_id,
    (m->>'metric_definition_id')::uuid,
    nullif(m->>'profile_column_id','')::uuid,
    m->>'metric_key',
    nullif(m->>'numeric_value','')::numeric,
    m->>'text_value',
    nullif(m->>'boolean_value','')::boolean,
    m->'json_value'
  from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb)) m;

  insert into profiling.profile_findings (
    profile_run_id, profile_column_id, finding_type, severity,
    title, description, confidence, evidence, recommendation
  )
  select
    p_profile_run_id,
    nullif(f->>'profile_column_id','')::uuid,
    f->>'finding_type',
    f->>'severity',
    f->>'title',
    f->>'description',
    nullif(f->>'confidence','')::numeric,
    coalesce(f->'evidence','{}'::jsonb),
    f->'recommendation'
  from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) f;

  select round(avg(score), 4)
  into v_overall_score
  from unnest(array[
    nullif(p_score->>'completeness_score','')::numeric,
    nullif(p_score->>'uniqueness_score','')::numeric,
    nullif(p_score->>'validity_score','')::numeric,
    nullif(p_score->>'accuracy_score','')::numeric
  ]) as available(score)
  where score is not null;

  insert into profiling.data_quality_scores (
    profile_run_id, completeness_score, uniqueness_score, validity_score,
    accuracy_score, overall_score
  )
  values (
    p_profile_run_id,
    nullif(p_score->>'completeness_score','')::numeric,
    nullif(p_score->>'uniqueness_score','')::numeric,
    nullif(p_score->>'validity_score','')::numeric,
    nullif(p_score->>'accuracy_score','')::numeric,
    v_overall_score
  )
  on conflict (profile_run_id) do update set
    completeness_score = excluded.completeness_score,
    uniqueness_score = excluded.uniqueness_score,
    validity_score = excluded.validity_score,
    accuracy_score = excluded.accuracy_score,
    overall_score = excluded.overall_score;

  update profiling.profile_runs
  set summary = coalesce(p_summary, '{}'::jsonb),
      status = v_status,
      completed_at = case when v_status in ('COMPLETED','FAILED','CANCELLED') then now() else completed_at end
  where id = p_profile_run_id
    and dataset_version_id = p_dataset_version_id
    and status <> 'CANCELLED';

  if not found then
    raise exception 'Profiling run % was cancelled or changed during persistence', p_profile_run_id;
  end if;

  if v_status = 'COMPLETED' then
    select profiling.validate_metric_execution_contract(p_profile_run_id) into v_contract;
    if coalesce((v_contract->>'valid')::boolean, false) is not true then
      raise exception 'Metric execution contract validation failed for profiling run %: %', p_profile_run_id, v_contract;
    end if;
  end if;
end;
$function$;

revoke execute on function profiling.persist_profiling_results(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function profiling.persist_profiling_results(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text) to service_role;
