-- Defense-in-depth admission gate for profiling runs.
-- The readiness verifier remains read-only. This trigger prevents a profile run
-- from being created for a dataset version whose deterministic readiness state
-- is BLOCKED or NOT_ASSESSED.

create or replace function profiling.enforce_profile_run_readiness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_readiness jsonb;
begin
  select d.project_id
    into v_project_id
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  where dv.id = new.dataset_version_id;

  if v_project_id is null then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_READINESS_DATASET_VERSION_NOT_FOUND';
  end if;

  v_readiness := catalog.verify_dataset_version_profile_readiness(
    v_project_id,
    new.dataset_version_id
  );

  if coalesce(v_readiness->>'state', 'NOT_ASSESSED') <> 'READY'
     or coalesce((v_readiness->>'profiling_ready')::boolean, false) <> true then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_READINESS_GATE_BLOCKED',
      detail = v_readiness::text;
  end if;

  return new;
end;
$$;

comment on function profiling.enforce_profile_run_readiness() is
  'Fail-closed profile-run admission guard. Only deterministic READY dataset versions may create new profiling runs; existing runs are not rewritten.';

drop trigger if exists profile_runs_readiness_admission_guard on profiling.profile_runs;
create trigger profile_runs_readiness_admission_guard
before insert on profiling.profile_runs
for each row
execute function profiling.enforce_profile_run_readiness();

revoke all on function profiling.enforce_profile_run_readiness() from public, anon, authenticated;
grant execute on function profiling.enforce_profile_run_readiness() to service_role;

-- Governed AI-assisted readiness remediation tool.
-- The tool may reason over blocker evidence, but its executor can mutate state only
-- through the existing allowlisted low-risk source revalidation/reconciliation path.
-- Deterministic readiness verification remains the sole readiness authority.
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
