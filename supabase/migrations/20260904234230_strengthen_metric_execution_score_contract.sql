create or replace function profiling.validate_metric_execution_contract(p_profile_run_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'profiling'
as $function$
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
  v_run_status profiling.run_status;
  v_run_row_count bigint;
  v_run_column_count integer;
  v_run_schema_hash text;
  v_run_summary jsonb;
  v_score_id uuid;
  v_completeness numeric;
  v_uniqueness numeric;
  v_validity numeric;
  v_accuracy numeric;
  v_overall numeric;
  v_summary_completeness numeric;
  v_summary_uniqueness numeric;
  v_summary_validity numeric;
  v_summary_accuracy numeric;
  v_summary_overall numeric;
  v_score_present boolean := false;
  v_score_values_valid boolean := false;
  v_score_consistent boolean := false;
  v_completed_facts_present boolean := false;
  v_metric_contract_valid boolean := false;
begin
  select status, row_count, column_count, schema_hash, summary
  into v_run_status, v_run_row_count, v_run_column_count, v_run_schema_hash, v_run_summary
  from profiling.profile_runs
  where id = p_profile_run_id;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'profile_run_id', p_profile_run_id,
      'error', 'PROFILE_RUN_NOT_FOUND'
    );
  end if;

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

  v_metric_contract_valid := profile_column_count = actual_column_count
    and actual_dataset_metric_count = expected_dataset_metric_count
    and actual_column_metric_count = expected_column_metric_count * profile_column_count
    and actual_distribution_metric_count = expected_distribution_metric_count * profile_column_count;

  select id, completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score
  into v_score_id, v_completeness, v_uniqueness, v_validity, v_accuracy, v_overall
  from profiling.data_quality_scores
  where profile_run_id = p_profile_run_id;

  v_score_present := v_score_id is not null;
  if v_score_present then
    v_score_values_valid := v_completeness between 0 and 1
      and v_uniqueness between 0 and 1
      and v_validity between 0 and 1
      and (v_accuracy is null or v_accuracy between 0 and 1)
      and v_overall between 0 and 1;

    v_summary_completeness := nullif(v_run_summary->'score'->>'completeness_score','')::numeric;
    v_summary_uniqueness := nullif(v_run_summary->'score'->>'uniqueness_score','')::numeric;
    v_summary_validity := nullif(v_run_summary->'score'->>'validity_score','')::numeric;
    v_summary_accuracy := nullif(v_run_summary->'score'->>'accuracy_score','')::numeric;
    v_summary_overall := nullif(v_run_summary->'score'->>'overall_score','')::numeric;

    v_score_consistent := v_summary_completeness is not distinct from v_completeness
      and v_summary_uniqueness is not distinct from v_uniqueness
      and v_summary_validity is not distinct from v_validity
      and v_summary_accuracy is not distinct from v_accuracy
      and v_summary_overall is not distinct from v_overall;
  end if;

  v_completed_facts_present := v_run_status <> 'COMPLETED'
    or (
      v_run_row_count is not null
      and v_run_column_count is not null
      and v_run_column_count = profile_column_count
      and nullif(v_run_schema_hash, '') is not null
    );

  return jsonb_build_object(
    'valid', v_metric_contract_valid
      and (v_run_status <> 'COMPLETED' or (v_score_present and v_score_values_valid and v_score_consistent and v_completed_facts_present)),
    'profile_run_id', p_profile_run_id,
    'profile_run_status', v_run_status,
    'profile_column_count', profile_column_count,
    'actual_column_count', actual_column_count,
    'expected_dataset_metric_count', expected_dataset_metric_count,
    'actual_dataset_metric_count', actual_dataset_metric_count,
    'expected_column_metric_count_per_column', expected_column_metric_count,
    'actual_column_metric_count', actual_column_metric_count,
    'expected_distribution_metric_count_per_column', expected_distribution_metric_count,
    'actual_distribution_metric_count', actual_distribution_metric_count,
    'missing_metric_keys', missing_keys,
    'metric_contract_valid', v_metric_contract_valid,
    'score_present', v_score_present,
    'score_values_valid', v_score_values_valid,
    'score_consistent', v_score_consistent,
    'completed_facts_present', v_completed_facts_present,
    'run_facts', jsonb_build_object(
      'row_count', v_run_row_count,
      'column_count', v_run_column_count,
      'schema_hash', v_run_schema_hash
    ),
    'persisted_score', jsonb_build_object(
      'completeness_score', v_completeness,
      'uniqueness_score', v_uniqueness,
      'validity_score', v_validity,
      'accuracy_score', v_accuracy,
      'overall_score', v_overall
    ),
    'summary_score', coalesce(v_run_summary->'score', '{}'::jsonb)
  );
end;
$function$;
