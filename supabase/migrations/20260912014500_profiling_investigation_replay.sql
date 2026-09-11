-- Replay-safe investigation evidence for Profiling Agent v2.0.
-- One bounded lease owns model enrichment; completed results are first-write-wins
-- and future replays return the durable result without invoking the model again.

create table if not exists profiling.profile_investigation_replays (
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
  constraint profile_investigation_replays_state_check check (
    (status = 'COMPLETED' and result is not null and lease_token is null and lease_expires_at is null)
    or (status = 'RUNNING' and result is null and lease_token is not null and lease_expires_at is not null)
    or (status = 'FAILED' and result is null and lease_token is null and lease_expires_at is null)
  )
);

alter table profiling.profile_investigation_replays enable row level security;
revoke all on table profiling.profile_investigation_replays from public, anon, authenticated;
grant select, insert, update, delete on table profiling.profile_investigation_replays to service_role;

create policy profile_investigation_replays_service_role_all
on profiling.profile_investigation_replays
for all
to service_role
using (true)
with check (true);

create or replace function profiling.claim_profile_investigation_replay(
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
  v_claim profiling.profile_investigation_replays%rowtype;
  v_result jsonb;
  v_token uuid;
  v_lease_expires_at timestamptz;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 1200 then
    raise exception 'Investigation replay lease must be between 60 and 1200 seconds';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_run_id::text, 89)
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
    raise exception 'Profiling run % was cancelled before investigation', p_profile_run_id;
  end if;

  v_result := v_run.summary->'investigation';
  if pg_catalog.jsonb_typeof(v_result) = 'object' then
    insert into profiling.profile_investigation_replays (
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

  select * into v_claim
  from profiling.profile_investigation_replays
  where profile_run_id = p_profile_run_id
  for update;

  if found and v_claim.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Investigation replay dataset version drift for profiling run %', p_profile_run_id;
  end if;

  if found and v_claim.status = 'COMPLETED' and pg_catalog.jsonb_typeof(v_claim.result) = 'object' then
    return pg_catalog.jsonb_build_object(
      'status', 'COMPLETED',
      'replay', true,
      'result', v_claim.result
    );
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

  insert into profiling.profile_investigation_replays (
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
        attempt_count = profiling.profile_investigation_replays.attempt_count + 1,
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

create or replace function profiling.complete_profile_investigation_replay(
  p_profile_run_id uuid,
  p_dataset_version_id uuid,
  p_lease_token uuid,
  p_investigation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claim profiling.profile_investigation_replays%rowtype;
  v_run profiling.profile_runs%rowtype;
  v_result jsonb;
begin
  if pg_catalog.jsonb_typeof(p_investigation) <> 'object' then
    raise exception 'Investigation result must be a JSON object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_run_id::text, 89)
  );

  select * into v_claim
  from profiling.profile_investigation_replays
  where profile_run_id = p_profile_run_id
  for update;

  if not found then
    raise exception 'Investigation replay claim was not found for profiling run %', p_profile_run_id;
  end if;
  if v_claim.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Investigation replay dataset version drift for profiling run %', p_profile_run_id;
  end if;
  if v_claim.status = 'COMPLETED' and pg_catalog.jsonb_typeof(v_claim.result) = 'object' then
    return v_claim.result;
  end if;
  if v_claim.status <> 'RUNNING' or v_claim.lease_token is distinct from p_lease_token then
    raise exception 'Investigation replay claim is not owned by this lease';
  end if;

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
    raise exception 'Profiling run % was cancelled before investigation persistence completed', p_profile_run_id;
  end if;

  v_result := v_run.summary->'investigation';
  if pg_catalog.jsonb_typeof(v_result) <> 'object' then
    update profiling.profile_runs
       set summary = coalesce(summary, '{}'::jsonb)
                     || pg_catalog.jsonb_build_object('investigation', p_investigation)
     where id = p_profile_run_id
       and dataset_version_id = p_dataset_version_id
       and status <> 'CANCELLED';
    v_result := p_investigation;
  end if;

  update profiling.profile_investigation_replays
     set status = 'COMPLETED',
         lease_token = null,
         lease_expires_at = null,
         result = v_result,
         last_error = null,
         updated_at = now()
   where profile_run_id = p_profile_run_id;

  return v_result;
end;
$function$;

create or replace function profiling.fail_profile_investigation_replay(
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
  update profiling.profile_investigation_replays
     set status = 'FAILED',
         lease_token = null,
         lease_expires_at = null,
         result = null,
         last_error = left(coalesce(p_error_summary, 'Investigation execution failed'), 2000),
         updated_at = now()
   where profile_run_id = p_profile_run_id
     and status = 'RUNNING'
     and lease_token = p_lease_token;

  return found;
end;
$function$;

revoke all on function profiling.claim_profile_investigation_replay(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function profiling.complete_profile_investigation_replay(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function profiling.fail_profile_investigation_replay(uuid, uuid, text) from public, anon, authenticated;
grant execute on function profiling.claim_profile_investigation_replay(uuid, uuid, integer) to service_role;
grant execute on function profiling.complete_profile_investigation_replay(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function profiling.fail_profile_investigation_replay(uuid, uuid, text) to service_role;

-- Agent-run completion already mirrors investigation evidence into profile_runs.
-- Make that trigger a no-op when the first durable investigation is already equal,
-- so completion cannot create a second profile-run UPDATE and duplicate downstream effects.
create or replace function profiling.persist_investigation_summary()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'profiling', 'agent'
as $function$
declare
  investigation jsonb;
begin
  investigation := case
    when jsonb_typeof(new.output) = 'object' then new.output -> 'investigation'
    else null
  end;

  if jsonb_typeof(investigation) = 'object'
     and jsonb_typeof(investigation -> 'output') = 'object'
     and jsonb_typeof(investigation -> 'output' -> 'result') = 'object' then
    investigation := investigation -> 'output' -> 'result';
  end if;

  if investigation is not null
     and jsonb_typeof(investigation) = 'object'
     and new.dataset_version_id is not null then
    update profiling.profile_runs
       set summary = coalesce(summary, '{}'::jsonb)
                    || jsonb_build_object('investigation', investigation)
     where agent_run_id = new.id
       and dataset_version_id = new.dataset_version_id
       and status <> 'CANCELLED'
       and (summary->'investigation') is distinct from investigation;
  end if;

  return new;
end;
$function$;

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
  and t.tool_key = 'investigate_profile';

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
    and t.tool_key = 'investigate_profile'
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
    and t.execution_config->'retryable_error_codes' = jsonb_build_array('STEP_FAILED');

  if v_certified <> 1 then
    raise exception 'Expected investigate_profile to be replay certified exactly once, found %', v_certified;
  end if;
end;
$block$;
