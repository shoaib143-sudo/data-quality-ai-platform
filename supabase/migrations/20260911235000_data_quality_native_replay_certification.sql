-- Data Quality Agent replay safety and native tool certification.
-- Existing runtime manifests remain immutable snapshots; these contracts apply to future runs.

create unique index if not exists quality_rule_runs_replay_identity_uidx
  on profiling.quality_rule_runs (agent_run_id, rule_definition_id, profile_run_id) nulls not distinct
  where agent_run_id is not null;

create unique index if not exists quality_rule_exceptions_replay_identity_uidx
  on profiling.quality_rule_exceptions (quality_rule_run_id, record_hash, column_name) nulls not distinct;

create unique index if not exists quality_quarantine_records_replay_identity_uidx
  on profiling.quality_quarantine_records (quality_rule_run_id, record_hash)
  where quality_rule_run_id is not null;

create or replace function profiling.preserve_quality_rule_run_replay_timestamp()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'profiling'
as $function$
begin
  if old.status is not distinct from new.status
     and old.passed is not distinct from new.passed
     and old.observed_value is not distinct from new.observed_value
     and old.threshold is not distinct from new.threshold
     and old.evidence is not distinct from new.evidence
     and old.error_message is not distinct from new.error_message
     and old.dataset_version_id is not distinct from new.dataset_version_id
     and old.profile_run_id is not distinct from new.profile_run_id
     and old.agent_run_id is not distinct from new.agent_run_id then
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$function$;

revoke all on function profiling.preserve_quality_rule_run_replay_timestamp() from public;

create or replace trigger quality_rule_run_preserve_replay_timestamp
before update on profiling.quality_rule_runs
for each row execute function profiling.preserve_quality_rule_run_replay_timestamp();

create or replace function profiling.capture_quality_rule_run_event()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'profiling'
as $function$
declare
  v_project uuid;
  v_snapshot jsonb;
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.passed is not distinct from new.passed
     and old.observed_value is not distinct from new.observed_value
     and old.threshold is not distinct from new.threshold
     and old.evidence is not distinct from new.evidence
     and old.error_message is not distinct from new.error_message
     and old.dataset_version_id is not distinct from new.dataset_version_id
     and old.profile_run_id is not distinct from new.profile_run_id
     and old.agent_run_id is not distinct from new.agent_run_id then
    return new;
  end if;

  select project_id into v_project
  from profiling.quality_rule_definitions
  where id = new.rule_definition_id;

  v_snapshot := jsonb_build_object(
    'status', new.status,
    'passed', new.passed,
    'observed_value', new.observed_value,
    'threshold', new.threshold,
    'evidence', new.evidence,
    'error_message', new.error_message,
    'dataset_version_id', new.dataset_version_id,
    'profile_run_id', new.profile_run_id,
    'agent_run_id', new.agent_run_id,
    'started_at', new.started_at,
    'completed_at', new.completed_at
  );

  insert into profiling.quality_rule_run_events(
    project_id,
    quality_rule_run_id,
    rule_definition_id,
    rule_version_id,
    event_type,
    run_snapshot
  ) values (
    v_project,
    new.id,
    new.rule_definition_id,
    new.rule_version_id,
    case when tg_op = 'INSERT' then 'EXECUTED' else 'REEXECUTED' end,
    v_snapshot
  );

  return new;
end;
$function$;

revoke all on function profiling.capture_quality_rule_run_event() from public;

update agent.tool_definitions t
set version = '1.1',
    input_schema = jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'datasetVersionId', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'profileRunId', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'userId', jsonb_build_object('type', jsonb_build_array('string', 'null'), 'format', 'uuid')
      ),
      'required', jsonb_build_array('datasetVersionId', 'profileRunId'),
      'additionalProperties', false
    ),
    output_schema = jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'rule_count', jsonb_build_object('type', 'integer', 'minimum', 0),
        'active_rule_count', jsonb_build_object('type', 'integer', 'minimum', 0),
        'pending_review_count', jsonb_build_object('type', 'integer', 'minimum', 0),
        'inactive_rule_count', jsonb_build_object('type', 'integer', 'minimum', 0)
      ),
      'required', jsonb_build_array('rule_count', 'active_rule_count', 'pending_review_count', 'inactive_rule_count'),
      'additionalProperties', false
    ),
    execution_config = jsonb_build_object(
      'executor', 'data_quality',
      'read_only', false,
      'idempotent', true,
      'replay_certified', true,
      'reversible', false,
      'compensatable', false,
      'destructive', false,
      'privileged', false,
      'governance_authority_change', false,
      'approval_required', false
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = 'data_quality_agent'
  and t.tool_key = 'sync_quality_rules';

update agent.tool_definitions t
set version = '1.1',
    input_schema = jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'datasetVersionId', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'profileRunId', jsonb_build_object('type', 'string', 'format', 'uuid')
      ),
      'required', jsonb_build_array('datasetVersionId', 'profileRunId'),
      'additionalProperties', false
    ),
    output_schema = jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'total', jsonb_build_object('type', 'integer', 'minimum', 0),
        'passed', jsonb_build_object('type', 'integer', 'minimum', 0),
        'failed', jsonb_build_object('type', 'integer', 'minimum', 0),
        'errors', jsonb_build_object('type', 'integer', 'minimum', 0),
        'row_exceptions', jsonb_build_object('type', 'integer', 'minimum', 0),
        'quarantined_records', jsonb_build_object('type', 'integer', 'minimum', 0)
      ),
      'required', jsonb_build_array('total', 'passed', 'failed', 'errors', 'row_exceptions', 'quarantined_records'),
      'additionalProperties', false
    ),
    execution_config = jsonb_build_object(
      'executor', 'data_quality',
      'read_only', false,
      'idempotent', true,
      'replay_certified', true,
      'reversible', false,
      'compensatable', false,
      'destructive', false,
      'privileged', false,
      'governance_authority_change', false,
      'approval_required', false
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = 'data_quality_agent'
  and t.tool_key = 'execute_quality_rules';

update agent.tool_definitions t
set version = '1.1',
    input_schema = jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'datasetVersionId', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'profileRunId', jsonb_build_object('type', 'string', 'format', 'uuid')
      ),
      'required', jsonb_build_array('datasetVersionId', 'profileRunId'),
      'additionalProperties', false
    ),
    output_schema = jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'execution_completed', jsonb_build_object('type', 'boolean'),
        'data_quality_job', jsonb_build_object('type', 'boolean'),
        'dataset_version_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'profile_run_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
        'rules_total', jsonb_build_object('type', 'integer', 'minimum', 0),
        'rules_passed', jsonb_build_object('type', 'integer', 'minimum', 0),
        'rules_failed', jsonb_build_object('type', 'integer', 'minimum', 0),
        'pass_rate', jsonb_build_object('type', jsonb_build_array('number', 'null'), 'minimum', 0, 'maximum', 1),
        'row_exceptions', jsonb_build_object('type', 'integer', 'minimum', 0),
        'quarantined_records', jsonb_build_object('type', 'integer', 'minimum', 0),
        'governance_status', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('NO_ACTIVE_CONTROLS', 'ATTENTION_REQUIRED', 'CONTROLLED'))
      ),
      'required', jsonb_build_array(
        'execution_completed', 'data_quality_job', 'dataset_version_id', 'profile_run_id',
        'rules_total', 'rules_passed', 'rules_failed', 'pass_rate', 'row_exceptions',
        'quarantined_records', 'governance_status'
      ),
      'additionalProperties', false
    ),
    execution_config = jsonb_build_object(
      'executor', 'data_quality',
      'read_only', false,
      'idempotent', true,
      'replay_certified', true,
      'reversible', false,
      'compensatable', false,
      'destructive', false,
      'privileged', false,
      'governance_authority_change', false,
      'approval_required', false
    )
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.agent_key = 'data_quality_agent'
  and t.tool_key = 'publish_quality_results';
