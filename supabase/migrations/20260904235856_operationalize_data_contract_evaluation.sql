create or replace function governance.evaluate_data_contract(
  p_contract_id uuid,
  p_profile_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog
as $$
declare
  v_project_id uuid;
  v_dataset_id uuid;
  v_contract_version_id uuid;
  v_contract_version integer;
  v_freshness_sla_hours integer;
  v_row_count_min bigint;
  v_row_count_max bigint;
  v_quality_requirements jsonb;
  v_critical_columns text[];
  v_profile_run_id uuid;
  v_profile_completed_at timestamptz;
  v_profile_row_count bigint;
  v_score numeric;
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean := true;
  v_col text;
  v_req jsonb;
  v_actual numeric;
  v_expected numeric;
  v_missing_columns text[];
  v_eval_id uuid;
begin
  select c.project_id,c.dataset_id,v.id,v.version_number,v.freshness_sla_hours,v.row_count_min,v.row_count_max,
         coalesce(v.quality_requirements,'{}'::jsonb),coalesce(v.critical_columns,'{}'::text[])
  into v_project_id,v_dataset_id,v_contract_version_id,v_contract_version,v_freshness_sla_hours,v_row_count_min,v_row_count_max,
       v_quality_requirements,v_critical_columns
  from governance.data_contracts c
  join governance.data_contract_versions v
    on v.contract_id=c.id and v.version_number=c.current_version
  where c.id=p_contract_id and c.status='ACTIVE' and v.status='ACTIVE';

  if not found then
    raise exception 'Active data contract % with active current version was not found', p_contract_id;
  end if;

  if p_profile_run_id is null then
    select pr.id,pr.completed_at,pr.row_count
    into v_profile_run_id,v_profile_completed_at,v_profile_row_count
    from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
    where dv.dataset_id=v_dataset_id and pr.status='COMPLETED'
    order by pr.completed_at desc nulls last,pr.started_at desc
    limit 1;
  else
    select pr.id,pr.completed_at,pr.row_count
    into v_profile_run_id,v_profile_completed_at,v_profile_row_count
    from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
    where pr.id=p_profile_run_id and dv.dataset_id=v_dataset_id and pr.status='COMPLETED';
  end if;

  if v_profile_run_id is null then
    raise exception 'No completed profiling run is available for contract % dataset %', p_contract_id, v_dataset_id;
  end if;

  select overall_score into v_score
  from profiling.data_quality_scores
  where profile_run_id=v_profile_run_id;

  if v_row_count_min is not null then
    v_actual := coalesce(v_profile_row_count,0);
    v_expected := v_row_count_min;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check','row_count_min','passed',v_actual >= v_expected,'actual',v_actual,'expected_min',v_expected));
    v_pass := v_pass and v_actual >= v_expected;
  end if;

  if v_row_count_max is not null then
    v_actual := coalesce(v_profile_row_count,0);
    v_expected := v_row_count_max;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check','row_count_max','passed',v_actual <= v_expected,'actual',v_actual,'expected_max',v_expected));
    v_pass := v_pass and v_actual <= v_expected;
  end if;

  if v_freshness_sla_hours is not null then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check','freshness_sla_hours',
      'passed',v_profile_completed_at >= now() - make_interval(hours => v_freshness_sla_hours),
      'actual_age_hours',round((extract(epoch from (now()-v_profile_completed_at))/3600)::numeric,2),
      'expected_max_hours',v_freshness_sla_hours
    ));
    v_pass := v_pass and v_profile_completed_at >= now() - make_interval(hours => v_freshness_sla_hours);
  end if;

  if v_quality_requirements ? 'quality_score_min' then
    v_expected := (v_quality_requirements->>'quality_score_min')::numeric;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check','quality_score_min','passed',coalesce(v_score,-1) >= v_expected,'actual',v_score,'expected_min',v_expected));
    v_pass := v_pass and coalesce(v_score,-1) >= v_expected;
  end if;

  select array_agg(required_col order by required_col)
  into v_missing_columns
  from unnest(v_critical_columns) required_col
  where not exists (
    select 1 from profiling.profile_columns pc
    where pc.profile_run_id=v_profile_run_id and pc.column_name=required_col
  );

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check','critical_columns_present',
    'passed',coalesce(cardinality(v_missing_columns),0)=0,
    'missing_columns',coalesce(to_jsonb(v_missing_columns),'[]'::jsonb),
    'required_columns',to_jsonb(v_critical_columns)
  ));
  v_pass := v_pass and coalesce(cardinality(v_missing_columns),0)=0;

  for v_col,v_req in
    select key,value from jsonb_each(v_quality_requirements)
    where jsonb_typeof(value)='object'
  loop
    if v_req ? 'null_rate_max' then
      v_expected := (v_req->>'null_rate_max')::numeric;
      select pm.numeric_value into v_actual
      from profiling.profile_metrics pm
      join profiling.profile_columns pc on pc.id=pm.profile_column_id
      where pm.profile_run_id=v_profile_run_id and pc.column_name=v_col and pm.metric_key='null_rate'
      limit 1;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object('check',v_col||'.null_rate_max','passed',v_actual is not null and v_actual <= v_expected,'actual',v_actual,'expected_max',v_expected));
      v_pass := v_pass and v_actual is not null and v_actual <= v_expected;
    end if;

    if v_req ? 'distinct_rate_min' then
      v_expected := (v_req->>'distinct_rate_min')::numeric;
      select pm.numeric_value into v_actual
      from profiling.profile_metrics pm
      join profiling.profile_columns pc on pc.id=pm.profile_column_id
      where pm.profile_run_id=v_profile_run_id and pc.column_name=v_col and pm.metric_key='distinct_rate'
      limit 1;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object('check',v_col||'.distinct_rate_min','passed',v_actual is not null and v_actual >= v_expected,'actual',v_actual,'expected_min',v_expected));
      v_pass := v_pass and v_actual is not null and v_actual >= v_expected;
    end if;

    if v_req ? 'pattern_match_rate_min' then
      v_expected := (v_req->>'pattern_match_rate_min')::numeric;
      select pm.numeric_value into v_actual
      from profiling.profile_metrics pm
      join profiling.profile_columns pc on pc.id=pm.profile_column_id
      where pm.profile_run_id=v_profile_run_id and pc.column_name=v_col and pm.metric_key='pattern_match_rate'
      limit 1;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object('check',v_col||'.pattern_match_rate_min','passed',v_actual is not null and v_actual >= v_expected,'actual',v_actual,'expected_min',v_expected));
      v_pass := v_pass and v_actual is not null and v_actual >= v_expected;
    end if;
  end loop;

  insert into governance.data_contract_evaluations(
    project_id,contract_id,contract_version_id,dataset_id,profile_run_id,status,checks,evaluated_at
  ) values (
    v_project_id,p_contract_id,v_contract_version_id,v_dataset_id,v_profile_run_id,
    case when v_pass then 'PASS' else 'FAIL' end,
    jsonb_build_object('contract_version',v_contract_version,'passed',v_pass,'checks',v_checks,'profile_completed_at',v_profile_completed_at),
    now()
  )
  on conflict (contract_version_id,profile_run_id) do update set
    status=excluded.status,checks=excluded.checks,evaluated_at=excluded.evaluated_at
  returning id into v_eval_id;

  return jsonb_build_object(
    'evaluation_id',v_eval_id,
    'contract_id',p_contract_id,
    'contract_version_id',v_contract_version_id,
    'profile_run_id',v_profile_run_id,
    'status',case when v_pass then 'PASS' else 'FAIL' end,
    'checks',v_checks
  );
end;
$$;

revoke all on function governance.evaluate_data_contract(uuid,uuid) from public,anon,authenticated;
grant execute on function governance.evaluate_data_contract(uuid,uuid) to service_role;
