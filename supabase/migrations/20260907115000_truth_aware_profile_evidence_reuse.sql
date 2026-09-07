create or replace function profiling.reuse_profile_evidence(
  p_project_id uuid,
  p_profile_run_id uuid,
  p_source_profile_run_id uuid,
  p_profile_signature text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target profiling.profile_runs%rowtype;
  v_source profiling.profile_runs%rowtype;
  v_target_project uuid;
  v_source_project uuid;
  v_target_summary jsonb;
  v_source_summary jsonb;
begin
  if p_project_id is null or p_profile_run_id is null or p_source_profile_run_id is null or nullif(p_profile_signature, '') is null then
    raise exception 'Project, target run, source run and profile signature are required';
  end if;

  if p_profile_run_id = p_source_profile_run_id then
    raise exception 'A profiling run cannot reuse itself';
  end if;

  select * into v_target
  from profiling.profile_runs
  where id = p_profile_run_id
  for update;

  if not found then raise exception 'Target profiling run not found'; end if;
  if v_target.status::text <> 'RUNNING' then raise exception 'Target profiling run must be RUNNING'; end if;

  select * into v_source
  from profiling.profile_runs
  where id = p_source_profile_run_id;

  if not found then raise exception 'Source profiling run not found'; end if;
  if v_source.status::text <> 'COMPLETED' then raise exception 'Source profiling run must be COMPLETED'; end if;
  if v_source.dataset_version_id <> v_target.dataset_version_id then raise exception 'Evidence reuse is restricted to the same dataset version'; end if;

  select d.project_id into v_target_project
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  where dv.id = v_target.dataset_version_id;

  select d.project_id into v_source_project
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  where dv.id = v_source.dataset_version_id;

  if v_target_project is distinct from p_project_id or v_source_project is distinct from p_project_id then
    raise exception 'Profiling evidence reuse project boundary mismatch';
  end if;

  if v_target.profile_signature is distinct from p_profile_signature
     or v_source.profile_signature is distinct from p_profile_signature
     or v_target.content_hash is null
     or v_source.content_hash is distinct from v_target.content_hash
     or v_target.schema_hash is null
     or v_source.schema_hash is distinct from v_target.schema_hash
     or v_target.configuration_hash is null
     or v_source.configuration_hash is distinct from v_target.configuration_hash then
    raise exception 'Profiling evidence fingerprints do not match exactly';
  end if;

  if coalesce(v_source.summary->>'execution_mode', 'EXECUTED') = 'REUSED' then
    raise exception 'Reuse source must be directly executed evidence, not previously reused evidence';
  end if;

  if not exists (select 1 from profiling.profile_metrics where profile_run_id = v_source.id)
     or not exists (select 1 from profiling.data_quality_scores where profile_run_id = v_source.id)
     or jsonb_typeof(v_source.summary->'investigation') is distinct from 'object' then
    raise exception 'Source profiling evidence is incomplete';
  end if;

  if exists (select 1 from profiling.profile_metrics where profile_run_id = v_target.id)
     or exists (select 1 from profiling.profile_findings where profile_run_id = v_target.id)
     or exists (select 1 from profiling.data_quality_scores where profile_run_id = v_target.id) then
    raise exception 'Target profiling run already contains derived evidence';
  end if;

  if exists (
    select 1
    from profiling.profile_columns source_column
    where source_column.profile_run_id = v_source.id
      and not exists (
        select 1
        from profiling.profile_columns target_column
        where target_column.profile_run_id = v_target.id
          and target_column.column_name = source_column.column_name
      )
  ) then
    raise exception 'Target profiling columns do not match source profiling columns';
  end if;

  insert into profiling.profile_metrics(
    profile_run_id,
    metric_definition_id,
    profile_column_id,
    metric_key,
    numeric_value,
    text_value,
    boolean_value,
    json_value
  )
  select
    v_target.id,
    source_metric.metric_definition_id,
    case
      when source_metric.profile_column_id is null then null
      else target_column.id
    end,
    source_metric.metric_key,
    source_metric.numeric_value,
    source_metric.text_value,
    source_metric.boolean_value,
    source_metric.json_value
  from profiling.profile_metrics source_metric
  left join profiling.profile_columns source_column
    on source_column.id = source_metric.profile_column_id
  left join profiling.profile_columns target_column
    on target_column.profile_run_id = v_target.id
   and target_column.column_name = source_column.column_name
  where source_metric.profile_run_id = v_source.id;

  insert into profiling.profile_findings(
    profile_run_id,
    profile_column_id,
    finding_type,
    severity,
    title,
    description,
    confidence,
    evidence,
    recommendation
  )
  select
    v_target.id,
    case
      when source_finding.profile_column_id is null then null
      else target_column.id
    end,
    source_finding.finding_type,
    source_finding.severity,
    source_finding.title,
    source_finding.description,
    source_finding.confidence,
    source_finding.evidence,
    source_finding.recommendation
  from profiling.profile_findings source_finding
  left join profiling.profile_columns source_column
    on source_column.id = source_finding.profile_column_id
  left join profiling.profile_columns target_column
    on target_column.profile_run_id = v_target.id
   and target_column.column_name = source_column.column_name
  where source_finding.profile_run_id = v_source.id;

  insert into profiling.data_quality_scores(
    profile_run_id,
    completeness_score,
    uniqueness_score,
    validity_score,
    accuracy_score,
    overall_score
  )
  select
    v_target.id,
    completeness_score,
    uniqueness_score,
    validity_score,
    accuracy_score,
    overall_score
  from profiling.data_quality_scores
  where profile_run_id = v_source.id;

  v_target_summary := coalesce(v_target.summary, '{}'::jsonb);
  v_source_summary := coalesce(v_source.summary, '{}'::jsonb);

  update profiling.profile_runs
  set status = 'COMPLETED',
      sampling_mode = v_source.sampling_mode,
      sampling_size = v_source.sampling_size,
      sampling_rate = v_source.sampling_rate,
      sampling_seed = v_source.sampling_seed,
      row_count = v_target.row_count,
      column_count = v_target.column_count,
      duplicate_row_count = v_source.duplicate_row_count,
      summary = v_source_summary
        || jsonb_build_object(
          'source_access', v_target_summary->'source_access',
          'execution_mode', 'REUSED',
          'reused_from_profile_run_id', v_source.id,
          'reuse_reason', 'EXACT_SOURCE_BYTES_AND_EXECUTION_FINGERPRINT_MATCH',
          'reuse_source_execution_mode', coalesce(v_source_summary->>'execution_mode', 'EXECUTED'),
          'reuse_fingerprint_authority', 'SOURCE_BYTES_SHA256'
        ),
      completed_at = now(),
      error_code = null,
      error_message = null
  where id = v_target.id;

  return v_target.id;
end
$function$;

revoke all on function profiling.reuse_profile_evidence(uuid, uuid, uuid, text) from public;
grant execute on function profiling.reuse_profile_evidence(uuid, uuid, uuid, text) to service_role;

comment on function profiling.reuse_profile_evidence(uuid, uuid, uuid, text) is
'Atomically materializes a new completed profiling run from directly executed evidence only when same-version source-byte, schema, configuration and profile signatures match exactly. Reuse is execution optimization evidence, never source authority or governance approval.';
