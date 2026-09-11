-- Replay-safe metric execution for Profiling Agent v2.0.
-- One bounded lease owns source loading and metric persistence. Completed evidence is
-- first-write-wins and future replays return the durable native result without
-- deleting/reinserting profiling evidence.

create table if not exists profiling.profile_metric_execution_replays (
  profile_run_id uuid primary key references profiling.profile_runs(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  status text not null check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_metric_execution_replays_state_check check (
    (status = 'COMPLETED' and result is not null and lease_token is null and lease_expires_at is null)
    or (status = 'RUNNING' and result is null and lease_token is not null and lease_expires_at is not null)
    or (status = 'FAILED' and result is null and lease_token is null and lease_expires_at is null)
  )
);

alter table profiling.profile_metric_execution_replays enable row level security;
revoke all on table profiling.profile_metric_execution_replays from public, anon, authenticated;
grant select, insert, update, delete on table profiling.profile_metric_execution_replays to service_role;

create policy profile_metric_execution_replays_service_role_all
on profiling.profile_metric_execution_replays
for all
to service_role
using (true)
with check (true);

create or replace function profiling.claim_profile_metric_execution_replay(
  p_profile_run_id uuid,
  p_dataset_version_id uuid,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run profiling.profile_runs%rowtype;
  v_claim profiling.profile_metric_execution_replays%rowtype;
  v_contract jsonb;
  v_score jsonb;
  v_result jsonb;
  v_metrics integer;
  v_findings integer;
  v_token uuid;
  v_lease_expires_at timestamptz;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 1200 then
    raise exception 'Metric replay lease must be between 60 and 1200 seconds';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_run_id::text, 97)
  );

  select * into v_run
  from profiling.profile_runs
  where id = p_profile_run_id
  for update;

  if not found then
    raise exception 'Profiling run % was not found', p_profile_run_id;
  end if;
  if v_run.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Profiling run % does not belong to dataset version %', p_profile_run_id, p_dataset_version_id;
  end if;
  if v_run.status = 'CANCELLED' then
    raise exception 'Profiling run % was cancelled before metric execution', p_profile_run_id;
  end if;

  select * into v_claim
  from profiling.profile_metric_execution_replays
  where profile_run_id = p_profile_run_id
  for update;

  if found and v_claim.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Metric replay dataset version drift for profiling run %', p_profile_run_id;
  end if;

  if found and v_claim.status = 'COMPLETED' and pg_catalog.jsonb_typeof(v_claim.result) = 'object' then
    return pg_catalog.jsonb_build_object(
      'status', 'COMPLETED',
      'replay', true,
      'result', v_claim.result
    );
  end if;

  -- Crash recovery and pre-existing completed evidence: if the persisted metric
  -- contract is already valid, materialize the exact native result and never reload
  -- the source or rewrite metric/finding/score rows.
  if v_run.status = 'COMPLETED' then
    select profiling.validate_metric_execution_contract(p_profile_run_id) into v_contract;
    if coalesce((v_contract->>'valid')::boolean, false) then
      select count(*)::integer into v_metrics
      from profiling.profile_metrics
      where profile_run_id = p_profile_run_id;

      select count(*)::integer into v_findings
      from profiling.profile_findings
      where profile_run_id = p_profile_run_id;

      select pg_catalog.jsonb_build_object(
        'completeness_score', completeness_score,
        'uniqueness_score', uniqueness_score,
        'validity_score', validity_score,
        'accuracy_score', accuracy_score,
        'overall_score', overall_score
      )
      into v_score
      from profiling.data_quality_scores
      where profile_run_id = p_profile_run_id;

      if pg_catalog.jsonb_typeof(v_score) = 'object' then
        v_result := pg_catalog.jsonb_build_object(
          'dataset_version_id', p_dataset_version_id,
          'profiling_run_id', p_profile_run_id,
          'status', 'COMPLETED',
          'metrics_persisted', coalesce(v_metrics, 0),
          'findings_persisted', coalesce(v_findings, 0),
          'score', v_score
        );

        insert into profiling.profile_metric_execution_replays (
          profile_run_id, dataset_version_id, status, result, attempt_count, updated_at
        ) values (
          p_profile_run_id, p_dataset_version_id, 'COMPLETED', v_result, 1, now()
        )
        on conflict (profile_run_id) do update
          set dataset_version_id = excluded.dataset_version_id,
              status = 'COMPLETED',
              lease_token = null,
              lease_expires_at = null,
              result = excluded.result,
              last_error = null,
              updated_at = now();

        return pg_catalog.jsonb_build_object(
          'status', 'COMPLETED',
          'replay', true,
          'result', v_result
        );
      end if;
    end if;
  end if;

  if found and v_claim.status = 'RUNNING' and v_claim.lease_expires_at > now() then
    return pg_catalog.jsonb_build_object(
      'status', 'IN_PROGRESS',
      'replay', false,
      'lease_expires_at', v_claim.lease_expires_at
    );
  end if;

  v_token := extensions.gen_random_uuid();
  v_lease_expires_at := now() + pg_catalog.make_interval(secs => p_lease_seconds);

  insert into profiling.profile_metric_execution_replays (
    profile_run_id,
    dataset_version_id,
    status,
    lease_token,
    lease_expires_at,
    result,
    attempt_count,
    last_error,
    updated_at
  ) values (
    p_profile_run_id,
    p_dataset_version_id,
    'RUNNING',
    v_token,
    v_lease_expires_at,
    null,
    1,
    null,
    now()
  )
  on conflict (profile_run_id) do update
    set dataset_version_id = excluded.dataset_version_id,
        status = 'RUNNING',
        lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        result = null,
        attempt_count = profiling.profile_metric_execution_replays.attempt_count + 1,
        last_error = null,
        updated_at = now();

  return pg_catalog.jsonb_build_object(
    'status', 'CLAIMED',
    'replay', false,
    'lease_token', v_token,
    'lease_expires_at', v_lease_expires_at
  );
end;
$function$;

create or replace function profiling.complete_profile_metric_execution_replay(
  p_profile_run_id uuid,
  p_dataset_version_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claim profiling.profile_metric_execution_replays%rowtype;
begin
  if pg_catalog.jsonb_typeof(p_result) <> 'object' then
    raise exception 'Metric execution result must be a JSON object';
  end if;
  if p_result->>'profiling_run_id' is distinct from p_profile_run_id::text
     or p_result->>'dataset_version_id' is distinct from p_dataset_version_id::text
     or p_result->>'status' <> 'COMPLETED' then
    raise exception 'Metric execution result identity/status does not match the replay claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_run_id::text, 97)
  );

  select * into v_claim
  from profiling.profile_metric_execution_replays
  where profile_run_id = p_profile_run_id
  for update;

  if not found then
    raise exception 'Metric replay claim was not found for profiling run %', p_profile_run_id;
  end if;
  if v_claim.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Metric replay dataset version drift for profiling run %', p_profile_run_id;
  end if;
  if v_claim.status = 'COMPLETED' and pg_catalog.jsonb_typeof(v_claim.result) = 'object' then
    return v_claim.result;
  end if;
  if v_claim.status <> 'RUNNING' or v_claim.lease_token is distinct from p_lease_token then
    raise exception 'Metric replay claim is not owned by this lease';
  end if;

  update profiling.profile_metric_execution_replays
     set status = 'COMPLETED',
         lease_token = null,
         lease_expires_at = null,
         result = p_result,
         last_error = null,
         updated_at = now()
   where profile_run_id = p_profile_run_id;

  return p_result;
end;
$function$;

create or replace function profiling.fail_profile_metric_execution_replay(
  p_profile_run_id uuid,
  p_lease_token uuid,
  p_error_summary text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update profiling.profile_metric_execution_replays
     set status = 'FAILED',
         lease_token = null,
         lease_expires_at = null,
         result = null,
         last_error = left(coalesce(p_error_summary, 'Metric execution failed'), 2000),
         updated_at = now()
   where profile_run_id = p_profile_run_id
     and status = 'RUNNING'
     and lease_token = p_lease_token;

  return found;
end;
$function$;

revoke all on function profiling.claim_profile_metric_execution_replay(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function profiling.complete_profile_metric_execution_replay(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function profiling.fail_profile_metric_execution_replay(uuid, uuid, text) from public, anon, authenticated;
grant execute on function profiling.claim_profile_metric_execution_replay(uuid, uuid, integer) to service_role;
grant execute on function profiling.complete_profile_metric_execution_replay(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function profiling.fail_profile_metric_execution_replay(uuid, uuid, text) to service_role;

update agent.tool_definitions t
set version = '2.1',
    execution_config = t.execution_config || pg_catalog.jsonb_build_object(
      'read_only', false,
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
  and d.agent_key = 'profiling_agent'
  and d.version = '2.0'
  and t.enabled
  and t.tool_key = 'execute_metrics';

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
    and t.tool_key = 'execute_metrics'
    and t.version = '2.1'
    and not coalesce((t.execution_config->>'read_only')::boolean, false)
    and coalesce((t.execution_config->>'idempotent')::boolean, false)
    and coalesce((t.execution_config->>'replay_certified')::boolean, false)
    and not coalesce((t.execution_config->>'reversible')::boolean, false)
    and not coalesce((t.execution_config->>'compensatable')::boolean, false)
    and not coalesce((t.execution_config->>'destructive')::boolean, false)
    and not coalesce((t.execution_config->>'privileged')::boolean, false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean, false)
    and not coalesce((t.execution_config->>'approval_required')::boolean, false)
    and t.execution_config->'retryable_error_codes' = pg_catalog.jsonb_build_array('STEP_FAILED');

  if v_certified <> 1 then
    raise exception 'Expected execute_metrics to be replay certified exactly once, found %', v_certified;
  end if;
end;
$block$;
