-- Close the remaining governance-specialist replay certification gap.
-- The active native specialist tool is deterministic with respect to governed project state.
-- The legacy read_project_snapshot tool is not part of the governed registry or live API path,
-- so disable it instead of expanding planner authority.

update agent.tool_definitions t
set version = '1.1',
    execution_config = t.execution_config || pg_catalog.jsonb_build_object(
      'read_only', true,
      'idempotent', true,
      'replay_certified', true,
      'reversible', false,
      'compensatable', false,
      'destructive', false,
      'privileged', false,
      'governance_authority_change', false,
      'approval_required', false,
      'retryable_error_codes', pg_catalog.jsonb_build_array('STEP_FAILED')
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = any(array[
    'steward_agent',
    'governance_analyst_agent',
    'architect_agent',
    'investigator_agent',
    'executive_agent',
    'support_agent'
  ]::text[])
  and d.version = '1.0'
  and d.enabled
  and t.enabled
  and t.tool_key = 'governance_specialist_investigate';

update agent.tool_definitions t
set enabled = false,
    execution_config = t.execution_config || pg_catalog.jsonb_build_object(
      'deprecated', true,
      'replaced_by', 'governance_specialist_investigate',
      'replay_certified', false
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = any(array[
    'steward_agent',
    'governance_analyst_agent',
    'architect_agent',
    'investigator_agent',
    'executive_agent',
    'support_agent'
  ]::text[])
  and d.version = '1.0'
  and d.enabled
  and t.tool_key = 'read_project_snapshot';

do $block$
declare
  v_certified integer;
  v_legacy_enabled integer;
  v_uncertified_enabled integer;
begin
  select count(*) into v_certified
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.agent_key = any(array[
      'steward_agent','governance_analyst_agent','architect_agent',
      'investigator_agent','executive_agent','support_agent'
    ]::text[])
    and d.version = '1.0'
    and d.enabled
    and t.enabled
    and t.tool_key = 'governance_specialist_investigate'
    and t.version = '1.1'
    and coalesce((t.execution_config->>'read_only')::boolean, false)
    and coalesce((t.execution_config->>'idempotent')::boolean, false)
    and coalesce((t.execution_config->>'replay_certified')::boolean, false)
    and not coalesce((t.execution_config->>'reversible')::boolean, false)
    and not coalesce((t.execution_config->>'compensatable')::boolean, false)
    and not coalesce((t.execution_config->>'destructive')::boolean, false)
    and not coalesce((t.execution_config->>'privileged')::boolean, false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean, false)
    and not coalesce((t.execution_config->>'approval_required')::boolean, false)
    and t.execution_config->'retryable_error_codes' = pg_catalog.jsonb_build_array('STEP_FAILED');

  select count(*) into v_legacy_enabled
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.agent_key = any(array[
      'steward_agent','governance_analyst_agent','architect_agent',
      'investigator_agent','executive_agent','support_agent'
    ]::text[])
    and d.version = '1.0'
    and d.enabled
    and t.enabled
    and t.tool_key = 'read_project_snapshot';

  select count(*) into v_uncertified_enabled
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.agent_key = any(array[
      'steward_agent','governance_analyst_agent','architect_agent',
      'investigator_agent','executive_agent','support_agent'
    ]::text[])
    and d.version = '1.0'
    and d.enabled
    and t.enabled
    and not coalesce((t.execution_config->>'replay_certified')::boolean, false);

  if v_certified <> 6 then
    raise exception 'Expected 6 replay-certified governance specialist tools, found %', v_certified;
  end if;
  if v_legacy_enabled <> 0 then
    raise exception 'Expected legacy read_project_snapshot tools to be disabled, found % enabled', v_legacy_enabled;
  end if;
  if v_uncertified_enabled <> 0 then
    raise exception 'Expected no enabled uncertified governance specialist tools, found %', v_uncertified_enabled;
  end if;
end;
$block$;
