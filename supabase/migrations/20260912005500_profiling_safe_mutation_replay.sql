-- Replay-safe native mutations for Profiling Agent v2.0.
-- These operations remain moderate writes: replay certification does not grant
-- automatic execution unless the supervisor explicitly pre-approves Tier 2.

create or replace function profiling.persist_profile_snapshot_replay_safe(
  p_profile_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run profiling.profile_runs%rowtype;
  v_existing profiling.schema_snapshots%rowtype;
  v_columns jsonb;
  v_schema jsonb;
  v_schema_hash text;
  v_snapshot_id uuid;
begin
  select * into v_run
  from profiling.profile_runs
  where id = p_profile_run_id
  for update;

  if not found then
    raise exception 'Profiling run % was not found', p_profile_run_id;
  end if;

  select * into v_existing
  from profiling.schema_snapshots
  where profile_run_id = p_profile_run_id;

  if found then
    return jsonb_build_object(
      'profiling_run_id', p_profile_run_id,
      'snapshot_id', v_existing.id,
      'schema_hash', v_existing.schema_hash
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', c.column_name,
        'ordinal_position', c.ordinal_position,
        'source_type', c.source_type,
        'inferred_type', c.inferred_type,
        'total_count', c.total_count,
        'non_null_count', c.non_null_count,
        'null_count', c.null_count,
        'blank_count', c.blank_count,
        'zero_count', c.zero_count,
        'distinct_count', c.distinct_count,
        'distinct_percentage', c.distinct_percentage
      ) order by c.ordinal_position, c.column_name
    ),
    '[]'::jsonb
  ) into v_columns
  from profiling.profile_columns c
  where c.profile_run_id = p_profile_run_id;

  v_schema := jsonb_build_object(
    'row_count', v_run.row_count,
    'column_count', coalesce(v_run.column_count, jsonb_array_length(v_columns)),
    'source_access', coalesce(v_run.summary->'source_access', 'null'::jsonb),
    'columns', v_columns
  );

  v_schema_hash := nullif(v_run.schema_hash, '');
  if v_schema_hash is null then
    v_schema_hash := encode(
      extensions.digest(convert_to(v_schema::text, 'UTF8'), 'sha256'),
      'hex'
    );
  end if;

  insert into profiling.schema_snapshots (
    profile_run_id,
    dataset_version_id,
    schema_hash,
    schema
  ) values (
    p_profile_run_id,
    v_run.dataset_version_id,
    v_schema_hash,
    v_schema
  )
  returning id into v_snapshot_id;

  return jsonb_build_object(
    'profiling_run_id', p_profile_run_id,
    'snapshot_id', v_snapshot_id,
    'schema_hash', v_schema_hash
  );
end;
$function$;

create or replace function profiling.complete_profile_run_replay_safe(
  p_profile_run_id uuid,
  p_status text,
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run profiling.profile_runs%rowtype;
  v_status profiling.run_status;
begin
  begin
    v_status := p_status::profiling.run_status;
  exception when invalid_text_representation then
    raise exception 'Invalid profiling run status: %', p_status;
  end;

  if v_status not in ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED') then
    raise exception 'Profiling run completion requires a terminal status, got %', p_status;
  end if;

  select * into v_run
  from profiling.profile_runs
  where id = p_profile_run_id
  for update;

  if not found then
    raise exception 'Profiling run % was not found', p_profile_run_id;
  end if;

  if v_run.status = v_status
     and v_run.error_code is not distinct from p_error_code
     and v_run.error_message is not distinct from p_error_message then
    return jsonb_build_object(
      'profiling_run_id', p_profile_run_id,
      'status', v_run.status::text
    );
  end if;

  update profiling.profile_runs
  set status = v_status,
      error_code = p_error_code,
      error_message = p_error_message,
      completed_at = coalesce(completed_at, now())
  where id = p_profile_run_id
  returning * into v_run;

  return jsonb_build_object(
    'profiling_run_id', p_profile_run_id,
    'status', v_run.status::text
  );
end;
$function$;

revoke all on function profiling.persist_profile_snapshot_replay_safe(uuid) from public, anon, authenticated;
revoke all on function profiling.complete_profile_run_replay_safe(uuid, text, text, text) from public, anon, authenticated;
grant execute on function profiling.persist_profile_snapshot_replay_safe(uuid) to service_role;
grant execute on function profiling.complete_profile_run_replay_safe(uuid, text, text, text) to service_role;

update agent.tool_definitions t
set version = '2.1',
    execution_config = t.execution_config || jsonb_build_object(
      'read_only', false,
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
    'persist_profile_snapshot',
    'complete_profile_run'
  ]::text[]);

do $block$
declare
  v_certified integer;
begin
  select count(*) into v_certified
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.agent_key = 'profiling_agent'
    and d.version = '2.0'
    and t.enabled
    and t.version = '2.1'
    and t.tool_key = any(array['persist_profile_snapshot','complete_profile_run']::text[])
    and not coalesce((t.execution_config->>'read_only')::boolean, false)
    and coalesce((t.execution_config->>'idempotent')::boolean, false)
    and coalesce((t.execution_config->>'replay_certified')::boolean, false)
    and not coalesce((t.execution_config->>'reversible')::boolean, false)
    and not coalesce((t.execution_config->>'compensatable')::boolean, false)
    and not coalesce((t.execution_config->>'destructive')::boolean, false)
    and not coalesce((t.execution_config->>'privileged')::boolean, false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean, false)
    and not coalesce((t.execution_config->>'approval_required')::boolean, false)
    and t.execution_config->'retryable_error_codes' = jsonb_build_array('STEP_FAILED');

  if v_certified <> 2 then
    raise exception 'Expected 2 replay-certified profiling mutation tools, found %', v_certified;
  end if;
end;
$block$;
