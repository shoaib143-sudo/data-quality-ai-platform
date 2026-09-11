-- Explicit replay certification for the six governed read-only specialist agents.
-- Runtime/checkpoint/audit evidence is allowed; governed project/domain state remains read-only.

update agent.tool_definitions t
set version='1.1',
    execution_config=t.execution_config || pg_catalog.jsonb_build_object(
      'read_only',true,
      'idempotent',true,
      'replay_certified',true,
      'reversible',false,
      'compensatable',false,
      'destructive',false,
      'privileged',false,
      'governance_authority_change',false,
      'approval_required',false,
      'side_effect_scope','runtime_evidence_only',
      'retryable_error_codes',pg_catalog.jsonb_build_array('STEP_FAILED')
    )
from agent.agent_definitions d
where t.agent_definition_id=d.id
  and d.enabled
  and d.agent_key=any(array[
    'steward_agent',
    'governance_analyst_agent',
    'architect_agent',
    'investigator_agent',
    'executive_agent',
    'support_agent'
  ]::text[])
  and t.enabled
  and t.tool_key=any(array[
    'read_project_snapshot',
    'governance_specialist_investigate'
  ]::text[]);

do $block$
declare
  v_specialist_certified integer;
  v_uncertified_enabled integer;
begin
  select count(*) into v_specialist_certified
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.enabled
    and d.agent_key=any(array[
      'steward_agent','governance_analyst_agent','architect_agent',
      'investigator_agent','executive_agent','support_agent'
    ]::text[])
    and t.enabled
    and t.tool_key=any(array['read_project_snapshot','governance_specialist_investigate']::text[])
    and t.version='1.1'
    and coalesce((t.execution_config->>'read_only')::boolean,false)
    and coalesce((t.execution_config->>'idempotent')::boolean,false)
    and coalesce((t.execution_config->>'replay_certified')::boolean,false)
    and not coalesce((t.execution_config->>'reversible')::boolean,false)
    and not coalesce((t.execution_config->>'compensatable')::boolean,false)
    and not coalesce((t.execution_config->>'destructive')::boolean,false)
    and not coalesce((t.execution_config->>'privileged')::boolean,false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean,false)
    and not coalesce((t.execution_config->>'approval_required')::boolean,false)
    and t.execution_config->>'side_effect_scope'='runtime_evidence_only'
    and t.execution_config->'retryable_error_codes'=pg_catalog.jsonb_build_array('STEP_FAILED');

  if v_specialist_certified <> 12 then
    raise exception 'Expected 12 replay-certified specialist read tools, found %',v_specialist_certified;
  end if;

  select count(*) into v_uncertified_enabled
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.enabled
    and t.enabled
    and not coalesce((t.execution_config->>'replay_certified')::boolean,false);

  if v_uncertified_enabled <> 0 then
    raise exception 'Enabled agent-tool replay certification baseline is incomplete: % tool(s) remain uncertified',v_uncertified_enabled;
  end if;
end;
$block$;
