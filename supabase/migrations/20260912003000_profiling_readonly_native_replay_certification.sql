-- Profiling Agent v2.0: explicit native safety certification for proven read-only tools.
-- Existing runtime manifests remain immutable snapshots; future runs pin these v2.1 contracts.
-- Mutating profiling tools are intentionally excluded until their persistence paths are replay hardened.

update agent.tool_definitions t
set version = '2.1',
    execution_config = t.execution_config || jsonb_build_object(
      'read_only', true,
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
  and t.tool_key = any(array[
    'inspect_dataset',
    'infer_column_types',
    'get_profile_run',
    'detect_patterns',
    'infer_candidate_keys',
    'detect_outliers',
    'detect_sensitive_columns',
    'detect_duplicates'
  ]::text[]);

do $block$
declare
  v_expected constant integer := 8;
  v_certified integer;
begin
  select count(*) into v_certified
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.agent_key = 'profiling_agent'
    and d.version = '2.0'
    and t.enabled
    and t.version = '2.1'
    and t.tool_key = any(array[
      'inspect_dataset',
      'infer_column_types',
      'get_profile_run',
      'detect_patterns',
      'infer_candidate_keys',
      'detect_outliers',
      'detect_sensitive_columns',
      'detect_duplicates'
    ]::text[])
    and coalesce((t.execution_config->>'read_only')::boolean, false)
    and coalesce((t.execution_config->>'idempotent')::boolean, false)
    and coalesce((t.execution_config->>'replay_certified')::boolean, false)
    and not coalesce((t.execution_config->>'destructive')::boolean, false)
    and not coalesce((t.execution_config->>'privileged')::boolean, false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean, false)
    and not coalesce((t.execution_config->>'approval_required')::boolean, false)
    and t.execution_config->'retryable_error_codes' = jsonb_build_array('STEP_FAILED');

  if v_certified <> v_expected then
    raise exception 'Expected % certified read-only profiling tools, found %', v_expected, v_certified;
  end if;
end;
$block$;
