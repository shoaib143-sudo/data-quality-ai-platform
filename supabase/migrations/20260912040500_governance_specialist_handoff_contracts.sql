-- Extend the certified governance specialist tool contract with bounded supervisor handoff references.
-- Handoff references are identifiers only. Downstream workers resolve succeeded sibling-run evidence after native admission.

update agent.tool_definitions t
set version = '1.2',
    input_schema = jsonb_build_object(
      'type', 'object',
      'additionalProperties', false,
      'required', jsonb_build_array('projectId'),
      'properties', jsonb_build_object(
        'projectId', jsonb_build_object('type', 'string', 'minLength', 1, 'maxLength', 200),
        'question', jsonb_build_object('type', 'string', 'minLength', 1, 'maxLength', 1000),
        'handoffRefs', jsonb_build_object(
          'type', 'array',
          'maxItems', 5,
          'items', jsonb_build_object(
            'type', 'object',
            'additionalProperties', false,
            'required', jsonb_build_array('sourceStepId','sourceAgentKey','sourceRunId'),
            'properties', jsonb_build_object(
              'sourceStepId', jsonb_build_object('type','string','minLength',1,'maxLength',200),
              'sourceAgentKey', jsonb_build_object(
                'type','string',
                'enum', jsonb_build_array(
                  'steward_agent','governance_analyst_agent','architect_agent',
                  'investigator_agent','executive_agent','support_agent'
                )
              ),
              'sourceRunId', jsonb_build_object('type','string','minLength',1,'maxLength',200)
            )
          )
        )
      )
    ),
    execution_config = t.execution_config || jsonb_build_object(
      'handoff_context_mode', 'validated_sibling_run_refs',
      'handoff_max_sources', 5,
      'handoff_max_findings_per_source', 6,
      'handoff_max_finding_chars', 320
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = any(array[
    'steward_agent','governance_analyst_agent','architect_agent',
    'investigator_agent','executive_agent','support_agent'
  ]::text[])
  and d.version = '1.0'
  and d.enabled
  and t.enabled
  and t.tool_key = 'governance_specialist_investigate';

do $block$
declare
  v_count integer;
begin
  select count(*) into v_count
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.agent_key = any(array[
    'steward_agent','governance_analyst_agent','architect_agent',
    'investigator_agent','executive_agent','support_agent'
  ]::text[])
    and d.version='1.0' and d.enabled and t.enabled
    and t.tool_key='governance_specialist_investigate'
    and t.version='1.2'
    and coalesce((t.execution_config->>'replay_certified')::boolean,false)
    and t.execution_config->>'handoff_context_mode'='validated_sibling_run_refs'
    and (t.input_schema->'properties'->'handoffRefs'->>'maxItems')::integer=5;

  if v_count <> 6 then
    raise exception 'Expected six certified specialist handoff contracts, found %', v_count;
  end if;
end;
$block$;
