BEGIN;

INSERT INTO agent.tool_definitions (
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
SELECT
    d.id,
    'governance_specialist_investigate',
    'Governance specialist investigation',
    'Runs the bounded deterministic read-only governance specialist investigation for the project.',
    '1.0',
    jsonb_build_object(
        'type', 'object',
        'required', jsonb_build_array('projectId'),
        'additionalProperties', false,
        'properties', jsonb_build_object(
            'projectId', jsonb_build_object('type', 'string', 'minLength', 1, 'maxLength', 200),
            'question', jsonb_build_object('type', 'string', 'maxLength', 1000)
        )
    ),
    jsonb_build_object(
        'type', 'object',
        'required', jsonb_build_array('agent', 'project', 'investigation', 'specialist'),
        'properties', jsonb_build_object(
            'agent', jsonb_build_object('type', 'object'),
            'project', jsonb_build_object('type', 'object'),
            'investigation', jsonb_build_object('type', 'object'),
            'specialist', jsonb_build_object('type', 'object')
        )
    ),
    jsonb_build_object(
        'executor', 'governance-specialist-agent',
        'operation', 'governance_specialist_investigate',
        'read_only', true,
        'idempotent', true,
        'replay_certified', false,
        'reversible', false,
        'compensatable', false,
        'destructive', false,
        'privileged', false,
        'governance_authority_change', false,
        'approval_required', false,
        'timeout_ms', 120000,
        'max_retries', 1
    ),
    true
FROM agent.agent_definitions d
WHERE d.agent_key IN (
    'steward_agent',
    'governance_analyst_agent',
    'architect_agent',
    'investigator_agent',
    'executive_agent',
    'support_agent'
)
  AND d.enabled = true
ON CONFLICT (agent_definition_id, tool_key, version)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema,
    execution_config = EXCLUDED.execution_config,
    enabled = true;

COMMIT;
