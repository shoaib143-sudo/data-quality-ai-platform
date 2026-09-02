update agent.tool_definitions
set version = '2.0',
    execution_config = jsonb_build_object(
      'executor', 'profiling-executor',
      'operation', 'investigate_profile',
      'idempotent', true,
      'timeout_ms', 600000,
      'max_retries', 2,
      'requires_source_access', false,
      'writes_investigation', true
    )
where agent_definition_id = 'a21cb836-a136-4c1c-a206-f5913522f350'
  and tool_key = 'investigate_profile'
  and enabled = true
  and version = '1.0';
