-- Replay-safe profile_dataset evidence for Profiling Agent v2.0.
-- Claims occur before source access. Profile columns, schema evidence and run summary
-- are persisted in one database transaction. Completed evidence is first-write-wins.

create table if not exists profiling.profile_dataset_replays (
  profile_run_id uuid primary key references profiling.profile_runs(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  status text not null check (status in ('RUNNING','COMPLETED','FAILED')),
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_dataset_replays_state_check check (
    (status = 'COMPLETED' and result is not null and lease_token is null and lease_expires_at is null)
    or (status = 'RUNNING' and result is null and lease_token is not null and lease_expires_at is not null)
    or (status = 'FAILED' and result is null and lease_token is null and lease_expires_at is null)
  )
);

alter table profiling.profile_dataset_replays enable row level security;
revoke all on table profiling.profile_dataset_replays from public, anon, authenticated;
grant select, insert, update, delete on table profiling.profile_dataset_replays to service_role;

create policy profile_dataset_replays_service_role_all
on profiling.profile_dataset_replays
for all
to service_role
using (true)
with check (true);

create or replace function profiling.claim_profile_dataset_replay(
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
  v_claim profiling.profile_dataset_replays%rowtype;
  v_marker jsonb;
  v_snapshot_hash text;
  v_columns integer;
  v_result jsonb;
  v_token uuid;
  v_lease_expires_at timestamptz;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 1200 then
    raise exception 'Profile dataset replay lease must be between 60 and 1200 seconds';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_run_id::text, 101)
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
    raise exception 'Profiling run % was cancelled before dataset profiling', p_profile_run_id;
  end if;

  select * into v_claim
  from profiling.profile_dataset_replays
  where profile_run_id = p_profile_run_id
  for update;

  if found and v_claim.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Profile dataset replay dataset version drift for profiling run %', p_profile_run_id;
  end if;

  if found and v_claim.status = 'COMPLETED' and pg_catalog.jsonb_typeof(v_claim.result) = 'object' then
    return pg_catalog.jsonb_build_object('status','COMPLETED','replay',true,'result',v_claim.result);
  end if;

  -- Crash recovery after the atomic evidence RPC committed but before the replay
  -- ledger was completed. The marker, snapshot hash and exact column count must agree.
  v_marker := v_run.summary->'profile_dataset_evidence';
  if pg_catalog.jsonb_typeof(v_marker) = 'object'
     and v_marker->>'dataset_version_id' = p_dataset_version_id::text
     and nullif(v_marker->>'schema_hash','') is not null then
    select s.schema_hash into v_snapshot_hash
    from profiling.schema_snapshots s
    where s.profile_run_id = p_profile_run_id;

    select count(*)::integer into v_columns
    from profiling.profile_columns c
    where c.profile_run_id = p_profile_run_id;

    if v_snapshot_hash = v_marker->>'schema_hash'
       and v_columns = coalesce((v_marker->>'column_count')::integer, -1) then
      v_result := pg_catalog.jsonb_build_object(
        'profiling_run_id', p_profile_run_id,
        'dataset_version_id', p_dataset_version_id,
        'status', 'COMPLETED',
        'row_count', v_run.row_count,
        'column_count', v_run.column_count,
        'anomalies_found', coalesce((v_marker->>'anomalies_found')::integer, 0)
      );

      insert into profiling.profile_dataset_replays (
        profile_run_id,dataset_version_id,status,result,attempt_count,updated_at
      ) values (
        p_profile_run_id,p_dataset_version_id,'COMPLETED',v_result,1,now()
      )
      on conflict (profile_run_id) do update
        set dataset_version_id=excluded.dataset_version_id,
            status='COMPLETED',
            lease_token=null,
            lease_expires_at=null,
            result=excluded.result,
            last_error=null,
            updated_at=now();

      return pg_catalog.jsonb_build_object('status','COMPLETED','replay',true,'result',v_result);
    end if;
  end if;

  if found and v_claim.status = 'RUNNING' and v_claim.lease_expires_at > now() then
    return pg_catalog.jsonb_build_object(
      'status','IN_PROGRESS',
      'replay',false,
      'lease_expires_at',v_claim.lease_expires_at
    );
  end if;

  v_token := extensions.gen_random_uuid();
  v_lease_expires_at := now() + pg_catalog.make_interval(secs => p_lease_seconds);

  insert into profiling.profile_dataset_replays (
    profile_run_id,dataset_version_id,status,lease_token,lease_expires_at,
    result,attempt_count,last_error,updated_at
  ) values (
    p_profile_run_id,p_dataset_version_id,'RUNNING',v_token,v_lease_expires_at,
    null,1,null,now()
  )
  on conflict (profile_run_id) do update
    set dataset_version_id=excluded.dataset_version_id,
        status='RUNNING',
        lease_token=excluded.lease_token,
        lease_expires_at=excluded.lease_expires_at,
        result=null,
        attempt_count=profiling.profile_dataset_replays.attempt_count+1,
        last_error=null,
        updated_at=now();

  return pg_catalog.jsonb_build_object(
    'status','CLAIMED',
    'replay',false,
    'lease_token',v_token,
    'lease_expires_at',v_lease_expires_at
  );
end;
$function$;

create or replace function profiling.persist_profile_dataset_evidence_replay_safe(
  p_profile_run_id uuid,
  p_dataset_version_id uuid,
  p_row_count bigint,
  p_column_count integer,
  p_schema_hash text,
  p_columns jsonb,
  p_schema jsonb,
  p_summary jsonb,
  p_content_hash text default null,
  p_mark_run_completed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run profiling.profile_runs%rowtype;
  v_metric_definition_id uuid;
  v_marker jsonb;
begin
  if nullif(p_schema_hash,'') is null then
    raise exception 'Profile dataset schema hash is required';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_columns,'[]'::jsonb)) <> 'array' then
    raise exception 'Profile dataset columns must be an array';
  end if;
  if pg_catalog.jsonb_array_length(coalesce(p_columns,'[]'::jsonb)) <> p_column_count then
    raise exception 'Profile dataset column count does not match persisted columns';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_schema,'{}'::jsonb)) <> 'object'
     or pg_catalog.jsonb_typeof(coalesce(p_summary,'{}'::jsonb)) <> 'object' then
    raise exception 'Profile dataset schema and summary must be JSON objects';
  end if;

  select * into v_run
  from profiling.profile_runs
  where id = p_profile_run_id
    and dataset_version_id = p_dataset_version_id
  for update;

  if not found then
    raise exception 'Profiling run % was not found for dataset version %', p_profile_run_id, p_dataset_version_id;
  end if;
  if v_run.status = 'CANCELLED' then
    raise exception 'Profiling run % has been cancelled', p_profile_run_id;
  end if;

  delete from profiling.profile_columns where profile_run_id = p_profile_run_id;

  insert into profiling.profile_columns (
    profile_run_id,column_name,ordinal_position,source_type,inferred_type,
    total_count,non_null_count,null_count,blank_count,zero_count,
    distinct_count,distinct_percentage,metadata
  )
  select
    p_profile_run_id,
    coalesce(nullif(c->>'name',''), 'column_' || (c->>'ordinal_position')),
    (c->>'ordinal_position')::integer,
    nullif(c->>'source_type',''),
    coalesce(nullif(c->>'inferred_type',''),'unknown'),
    nullif(c->>'total_count','')::bigint,
    nullif(c->>'non_null_count','')::bigint,
    nullif(c->>'null_count','')::bigint,
    nullif(c->>'blank_count','')::bigint,
    nullif(c->>'zero_count','')::bigint,
    nullif(c->>'distinct_count','')::bigint,
    nullif(c->>'distinct_percentage','')::numeric,
    coalesce(c->'metadata','{}'::jsonb)
  from pg_catalog.jsonb_array_elements(coalesce(p_columns,'[]'::jsonb)) c;

  insert into profiling.schema_snapshots (
    profile_run_id,dataset_version_id,schema_hash,schema
  ) values (
    p_profile_run_id,p_dataset_version_id,p_schema_hash,p_schema
  )
  on conflict (profile_run_id) do update
    set dataset_version_id=excluded.dataset_version_id,
        schema_hash=excluded.schema_hash,
        schema=excluded.schema;

  select id into v_metric_definition_id
  from profiling.metric_definitions
  where metric_key='schema_hash'
  limit 1;

  if v_metric_definition_id is not null then
    delete from profiling.profile_metrics
    where profile_run_id=p_profile_run_id and metric_key='schema_hash';

    insert into profiling.profile_metrics (
      profile_run_id,metric_definition_id,metric_key,text_value
    ) values (
      p_profile_run_id,v_metric_definition_id,'schema_hash',p_schema_hash
    );
  end if;

  v_marker := pg_catalog.jsonb_build_object(
    'dataset_version_id',p_dataset_version_id,
    'schema_hash',p_schema_hash,
    'row_count',p_row_count,
    'column_count',p_column_count,
    'anomalies_found',0
  );

  update profiling.profile_runs
  set row_count=p_row_count,
      column_count=p_column_count,
      content_hash=coalesce(p_content_hash,content_hash),
      schema_hash=p_schema_hash,
      summary=coalesce(p_summary,'{}'::jsonb)
              || pg_catalog.jsonb_build_object('profile_dataset_evidence',v_marker),
      status=case when p_mark_run_completed then 'COMPLETED'::profiling.run_status else status end,
      completed_at=case
        when p_mark_run_completed then coalesce(completed_at,now())
        else completed_at
      end
  where id=p_profile_run_id
    and dataset_version_id=p_dataset_version_id
    and status <> 'CANCELLED'
  returning * into v_run;

  if not found then
    raise exception 'Profiling run % was cancelled or changed during profile persistence',p_profile_run_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'profiling_run_id',p_profile_run_id,
    'dataset_version_id',p_dataset_version_id,
    'status','COMPLETED',
    'row_count',v_run.row_count,
    'column_count',v_run.column_count,
    'anomalies_found',0
  );
end;
$function$;

create or replace function profiling.complete_profile_dataset_replay(
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
  v_claim profiling.profile_dataset_replays%rowtype;
begin
  if pg_catalog.jsonb_typeof(p_result) <> 'object'
     or p_result->>'profiling_run_id' is distinct from p_profile_run_id::text
     or p_result->>'dataset_version_id' is distinct from p_dataset_version_id::text
     or p_result->>'status' <> 'COMPLETED' then
    raise exception 'Profile dataset result identity/status does not match replay claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_run_id::text,101)
  );

  select * into v_claim
  from profiling.profile_dataset_replays
  where profile_run_id=p_profile_run_id
  for update;

  if not found then
    raise exception 'Profile dataset replay claim was not found for profiling run %',p_profile_run_id;
  end if;
  if v_claim.dataset_version_id is distinct from p_dataset_version_id then
    raise exception 'Profile dataset replay dataset version drift for profiling run %',p_profile_run_id;
  end if;
  if v_claim.status='COMPLETED' and pg_catalog.jsonb_typeof(v_claim.result)='object' then
    return v_claim.result;
  end if;
  if v_claim.status <> 'RUNNING' or v_claim.lease_token is distinct from p_lease_token then
    raise exception 'Profile dataset replay claim is not owned by this lease';
  end if;

  update profiling.profile_dataset_replays
  set status='COMPLETED',
      lease_token=null,
      lease_expires_at=null,
      result=p_result,
      last_error=null,
      updated_at=now()
  where profile_run_id=p_profile_run_id;

  return p_result;
end;
$function$;

create or replace function profiling.fail_profile_dataset_replay(
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
  update profiling.profile_dataset_replays
  set status='FAILED',
      lease_token=null,
      lease_expires_at=null,
      result=null,
      last_error=left(coalesce(p_error_summary,'Profile dataset execution failed'),2000),
      updated_at=now()
  where profile_run_id=p_profile_run_id
    and status='RUNNING'
    and lease_token=p_lease_token;
  return found;
end;
$function$;

revoke all on function profiling.claim_profile_dataset_replay(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function profiling.persist_profile_dataset_evidence_replay_safe(uuid,uuid,bigint,integer,text,jsonb,jsonb,jsonb,text,boolean) from public,anon,authenticated;
revoke all on function profiling.complete_profile_dataset_replay(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function profiling.fail_profile_dataset_replay(uuid,uuid,text) from public,anon,authenticated;
grant execute on function profiling.claim_profile_dataset_replay(uuid,uuid,integer) to service_role;
grant execute on function profiling.persist_profile_dataset_evidence_replay_safe(uuid,uuid,bigint,integer,text,jsonb,jsonb,jsonb,text,boolean) to service_role;
grant execute on function profiling.complete_profile_dataset_replay(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function profiling.fail_profile_dataset_replay(uuid,uuid,text) to service_role;

update agent.tool_definitions t
set version='2.1',
    execution_config=t.execution_config || pg_catalog.jsonb_build_object(
      'read_only',false,
      'idempotent',true,
      'replay_certified',true,
      'reversible',false,
      'compensatable',false,
      'destructive',false,
      'privileged',false,
      'governance_authority_change',false,
      'approval_required',false,
      'retryable_error_codes',pg_catalog.jsonb_build_array('STEP_FAILED')
    )
from agent.agent_definitions d
where t.agent_definition_id=d.id
  and d.agent_key='profiling_agent'
  and d.version='2.0'
  and t.enabled
  and t.tool_key='profile_dataset';

do $block$
declare v_certified integer;
begin
  select count(*) into v_certified
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.agent_key='profiling_agent'
    and d.version='2.0'
    and t.enabled
    and t.tool_key='profile_dataset'
    and t.version='2.1'
    and not coalesce((t.execution_config->>'read_only')::boolean,false)
    and coalesce((t.execution_config->>'idempotent')::boolean,false)
    and coalesce((t.execution_config->>'replay_certified')::boolean,false)
    and not coalesce((t.execution_config->>'reversible')::boolean,false)
    and not coalesce((t.execution_config->>'compensatable')::boolean,false)
    and not coalesce((t.execution_config->>'destructive')::boolean,false)
    and not coalesce((t.execution_config->>'privileged')::boolean,false)
    and not coalesce((t.execution_config->>'governance_authority_change')::boolean,false)
    and not coalesce((t.execution_config->>'approval_required')::boolean,false)
    and t.execution_config->'retryable_error_codes'=pg_catalog.jsonb_build_array('STEP_FAILED');

  if v_certified <> 1 then
    raise exception 'Expected profile_dataset to be replay certified exactly once, found %',v_certified;
  end if;
end;
$block$;
