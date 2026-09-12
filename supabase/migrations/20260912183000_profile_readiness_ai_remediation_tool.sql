-- Governed AI-assisted profiling-readiness remediation tool.
--
-- Forward-only follow-up to project profile readiness V2. The already-merged
-- admission-gate migration remains immutable. This migration registers a new
-- profiling_agent tool whose executor may perform only deterministic-policy-
-- authorized low-risk source revalidation/reconciliation. The database
-- readiness verifier remains the sole authority for READY.

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
select
  ad.id,
  'remediate_profile_readiness',
  'Remediate Profile Readiness',
  'Uses governed AI reasoning to select only policy-authorized low-risk readiness remediation, then revalidates deterministic readiness. Higher-risk blockers remain approval-gated.',
  '2.1',
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('datasetVersionId'),
    'additionalProperties', false,
    'properties', jsonb_build_object(
      'datasetVersionId', jsonb_build_object('type', 'string', 'format', 'uuid')
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('status','selected_action','executed','approval_required','before_state','after_state'),
    'properties', jsonb_build_object(
      'status', jsonb_build_object('type', 'string'),
      'selected_action', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('REVALIDATE_SOURCE','NO_ACTION')),
      'executed', jsonb_build_object('type', 'boolean'),
      'approval_required', jsonb_build_object('type', 'boolean'),
      'rationale', jsonb_build_object('type', 'string'),
      'confidence', jsonb_build_object('type', jsonb_build_array('number','null')),
      'before_state', jsonb_build_object('type', 'string'),
      'after_state', jsonb_build_object('type', 'string'),
      'blocker_codes', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string')),
      'readiness', jsonb_build_object('type', 'object'),
      'source_validation', jsonb_build_object('type', 'object'),
      'provider', jsonb_build_object('type', jsonb_build_array('string','null')),
      'model', jsonb_build_object('type', jsonb_build_array('string','null')),
      'routing', jsonb_build_object('type', 'object')
    )
  ),
  jsonb_build_object(
    'executor', 'profiling-executor',
    'operation', 'remediate_profile_readiness',
    'read_only', false,
    'idempotent', true,
    'privileged', false,
    'reversible', false,
    'timeout_ms', 120000,
    'destructive', false,
    'max_retries', 1,
    'compensatable', false,
    'replay_certified', true,
    'approval_required', false,
    'rollback_strategy', 'ESCALATE_ONLY',
    'retryable_error_codes', jsonb_build_array('STEP_FAILED'),
    'requires_source_access', true,
    'writes_source_validation', true,
    'readiness_authority_change', false,
    'governance_authority_change', false
  ),
  true
from agent.agent_definitions ad
where ad.agent_key = 'profiling_agent'
  and ad.version = '2.0'
on conflict (agent_definition_id, tool_key, version)
do update set
  name = excluded.name,
  description = excluded.description,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  execution_config = excluded.execution_config,
  enabled = excluded.enabled;

do $$
begin
  if not exists (
    select 1
    from agent.tool_definitions td
    join agent.agent_definitions ad on ad.id = td.agent_definition_id
    where ad.agent_key = 'profiling_agent'
      and ad.version = '2.0'
      and td.tool_key = 'remediate_profile_readiness'
      and td.version = '2.1'
      and td.enabled = true
      and td.execution_config->>'executor' = 'profiling-executor'
      and td.execution_config->>'operation' = 'remediate_profile_readiness'
      and coalesce((td.execution_config->>'readiness_authority_change')::boolean, false) = false
      and coalesce((td.execution_config->>'governance_authority_change')::boolean, false) = false
  ) then
    raise exception 'PROFILE_READINESS_AI_REMEDIATION_TOOL_REGISTRATION_FAILED';
  end if;
end
$$;
