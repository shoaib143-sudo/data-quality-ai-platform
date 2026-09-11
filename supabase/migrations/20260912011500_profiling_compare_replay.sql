-- Replay-safe comparison evidence for Profiling Agent v2.0.
-- The calculation remains deterministic in application code; this function owns
-- the atomic evidence write and returns the first persisted result on replay.

create or replace function profiling.persist_profile_comparison_replay_safe(
  p_current_profile_run_id uuid,
  p_baseline_profile_run_id uuid,
  p_summary text,
  p_changes jsonb,
  p_anomalies jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current profiling.profile_runs%rowtype;
  v_baseline profiling.profile_runs%rowtype;
  v_existing profiling.profile_comparisons%rowtype;
  v_comparison profiling.profile_comparisons%rowtype;
  v_metrics_changed integer;
  v_anomalies_found integer;
begin
  if p_current_profile_run_id is null
     or p_baseline_profile_run_id is null
     or p_current_profile_run_id = p_baseline_profile_run_id then
    raise exception 'Distinct current and baseline profile run IDs are required';
  end if;

  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise exception 'Comparison changes must be a JSON object';
  end if;

  if jsonb_typeof(coalesce(p_anomalies, '[]'::jsonb)) <> 'array' then
    raise exception 'Comparison anomalies must be a JSON array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_current_profile_run_id::text || ':' || p_baseline_profile_run_id::text,
      73
    )
  );

  select * into v_existing
  from profiling.profile_comparisons
  where current_profile_run_id = p_current_profile_run_id
    and baseline_profile_run_id = p_baseline_profile_run_id
    and comparison_type = 'BASELINE';

  if found then
    return jsonb_build_object(
      'comparison_id', v_existing.id,
      'status', v_existing.status,
      'metrics_changed', v_existing.metrics_changed,
      'anomalies_found', v_existing.anomalies_found
    );
  end if;

  select * into v_current
  from profiling.profile_runs
  where id = p_current_profile_run_id;
  if not found then
    raise exception 'Current profiling run % was not found', p_current_profile_run_id;
  end if;

  select * into v_baseline
  from profiling.profile_runs
  where id = p_baseline_profile_run_id;
  if not found then
    raise exception 'Baseline profiling run % was not found', p_baseline_profile_run_id;
  end if;

  if v_current.status not in ('COMPLETED', 'PARTIAL')
     or v_baseline.status not in ('COMPLETED', 'PARTIAL') then
    raise exception 'Profile comparison requires completed or partial terminal runs';
  end if;

  v_metrics_changed := coalesce(jsonb_array_length(coalesce(p_changes->'material_changes', '[]'::jsonb)), 0);
  v_anomalies_found := v_metrics_changed;

  insert into profiling.profile_comparisons (
    current_profile_run_id,
    baseline_profile_run_id,
    comparison_type,
    status,
    summary,
    changes,
    metrics_changed,
    anomalies_found
  ) values (
    p_current_profile_run_id,
    p_baseline_profile_run_id,
    'BASELINE',
    'COMPLETED',
    p_summary,
    coalesce(p_changes, '{}'::jsonb),
    v_metrics_changed,
    v_anomalies_found
  )
  returning * into v_comparison;

  insert into profiling.profile_anomalies (
    profile_run_id,
    profile_column_id,
    anomaly_type,
    severity,
    metric_key,
    current_value,
    baseline_value,
    absolute_change,
    relative_change,
    direction,
    title,
    description,
    evidence,
    detected_by
  )
  select
    p_current_profile_run_id,
    nullif(a->>'profile_column_id', '')::uuid,
    'PROFILE_CHANGE',
    case when upper(coalesce(a->>'severity', 'MEDIUM')) = 'HIGH' then 'HIGH' else 'MEDIUM' end,
    nullif(a->>'metric_key', ''),
    nullif(a->>'current_value', '')::numeric,
    nullif(a->>'baseline_value', '')::numeric,
    nullif(a->>'absolute_change', '')::numeric,
    nullif(a->>'relative_change', '')::numeric,
    nullif(a->>'direction', ''),
    coalesce(nullif(a->>'title', ''), 'Profile metric changed materially'),
    coalesce(nullif(a->>'description', ''), 'A material profile change was detected.'),
    coalesce(a->'evidence', '{}'::jsonb) || jsonb_build_object(
      'baseline_profile_run_id', p_baseline_profile_run_id,
      'target_profile_run_id', p_current_profile_run_id,
      'comparison_id', v_comparison.id
    ),
    'profiling_agent_2.0'
  from jsonb_array_elements(coalesce(p_anomalies, '[]'::jsonb)) a
  on conflict do nothing;

  return jsonb_build_object(
    'comparison_id', v_comparison.id,
    'status', v_comparison.status,
    'metrics_changed', v_comparison.metrics_changed,
    'anomalies_found', v_comparison.anomalies_found
  );
end;
$function$;

revoke all on function profiling.persist_profile_comparison_replay_safe(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function profiling.persist_profile_comparison_replay_safe(uuid, uuid, text, jsonb, jsonb) to service_role;

update agent.tool_definitions t
set version = '2.1',
    execution_config = t.execution_config || jsonb_build_object(
      'read_only', false,
      'idempotent', true,
      'replay_certified', true,
      'reversible', false,
      'compensatable', false,
      'destructive', false,
      'privileged', false,
      'governance_authority_change', false,
      'approval_required', false,
      'retryable_error_codes', jsonb_build_array('STEP_FAILED')
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = 'profiling_agent'
  and d.version = '2.0'
  and t.version = '2.0'
  and t.enabled
  and t.tool_key = 'compare_profiles';

do $block$
declare
  v_certified integer;
begin
  select count(*) into v_certified
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.agent_key = 'profiling_agent'
    and d.version = '2.0'
    and t.enabled
    and t.tool_key = 'compare_profiles'
    and t.version = '2.1'
    and not coalesce((t.execution_config->>'read_only')::boolean, false)
    and coalesce((t.execution_config->>'idempotent')::boolean, false)
    and coalesce((t.execution_config->>'replay_certified')::boolean, false)
    and not coalesce((t.execution_config->>'reversible')::boolean, false)
    and not coalesce((t.execution_config->>'compensatable')::boolean, false)
    and not coalesce((t.execution_config->>'destructive')::boolean, false)
    and not coalesce((t.execution_config->>'privileged')::boolean, false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean, false)
    and not coalesce((t.execution_config->>'approval_required')::boolean, false)
    and t.execution_config->'retryable_error_codes' = jsonb_build_array('STEP_FAILED');

  if v_certified <> 1 then
    raise exception 'Expected compare_profiles to be replay certified exactly once, found %', v_certified;
  end if;
end;
$block$;
