begin;

do $$
declare
  v_agent_id uuid;
begin
  select id into v_agent_id
  from agent.agent_definitions
  where agent_key = 'profiling_agent'
    and version = '2.0';

  if v_agent_id is null then
    raise exception 'Profiling Agent v2.0 was not found';
  end if;

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'execute_metrics',
    'Execute Profiling Metrics',
    'Execute deterministic column metrics, findings and quality scoring for a persisted profiling run.',
    '2.0',
    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id", "profiling_run_id"],
      "properties": {
        "dataset_version_id": {"type": "string", "format": "uuid"},
        "profiling_run_id": {"type": "string", "format": "uuid"}
      }
    }'::jsonb,
    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id", "profiling_run_id", "status"],
      "properties": {
        "dataset_version_id": {"type": "string", "format": "uuid"},
        "profiling_run_id": {"type": "string", "format": "uuid"},
        "status": {"type": "string", "enum": ["COMPLETED", "FAILED"]},
        "metrics_persisted": {"type": "integer", "minimum": 0},
        "findings_persisted": {"type": "integer", "minimum": 0},
        "score": {"type": "object"}
      }
    }'::jsonb,
    '{
      "executor": "profiling-executor",
      "operation": "execute_metrics",
      "timeout_ms": 600000,
      "max_retries": 2,
      "idempotent": true,
      "requires_source_access": true,
      "writes_profile_metrics": true,
      "writes_profile_findings": true,
      "writes_quality_score": true
    }'::jsonb,
    true
  )
  on conflict (agent_definition_id, tool_key, version)
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;
end
$$;
commit;
